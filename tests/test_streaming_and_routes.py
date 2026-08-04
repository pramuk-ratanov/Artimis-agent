import json
from types import SimpleNamespace


def _obj(**kwargs):
    return SimpleNamespace(**kwargs)


def _sse_payloads(chunks):
    payloads = []
    for chunk in chunks:
        assert chunk.startswith("data: ")
        payloads.append(json.loads(chunk.removeprefix("data: ").strip()))
    return payloads


def test_streaming_inline_tool_calls_loop_back_to_final_answer(monkeypatch):
    from artimis.engine import agent
    import artimis.engine.intelligence as intelligence

    recorded_messages = []

    class FakeCompletions:
        def __init__(self):
            self.non_stream_calls = 0

        def create(self, **kwargs):
            recorded_messages.append(kwargs["messages"])
            if kwargs.get("stream"):
                # First stream emits an inline tool call, second stream emits final text.
                if self.non_stream_calls == 1:
                    return iter([
                        _obj(choices=[_obj(delta=_obj(
                            tool_calls=[_obj(
                                index=0,
                                id="call_1",
                                function=_obj(name="canvas_update", arguments='{"title":"T","content":"C"}'),
                            )],
                            content=None,
                        ))])
                    ])
                return iter([
                    _obj(choices=[_obj(delta=_obj(tool_calls=None, content="Final answer after tool."))])
                ])

            self.non_stream_calls += 1
            return _obj(choices=[_obj(message=_obj(tool_calls=None, content=None))])

    fake_completions = FakeCompletions()
    fake_client = _obj(chat=_obj(completions=fake_completions))

    monkeypatch.setattr(agent, "_get_client", lambda model=None: fake_client)
    monkeypatch.setattr(agent, "execute_tool", lambda name, args: "tool-result")
    monkeypatch.setattr(intelligence, "check_format", lambda user, text: None)
    monkeypatch.setattr(intelligence, "self_critique", lambda user, text, tools: {"overall_score": 8, "passed": True})
    monkeypatch.setattr(intelligence, "learn_from_critique", lambda *args, **kwargs: None)

    chunks = list(agent.run_agent_streaming("make a canvas", session_id="s1", max_iterations=3))
    payloads = _sse_payloads(chunks)

    assert {p["type"] for p in payloads} >= {"start", "tool", "token", "done"}
    assert any(p.get("content") == "Final answer after tool." for p in payloads)
    assert payloads[-1]["type"] == "done"
    assert payloads[-1]["tool_calls_made"] == 1

    second_non_stream_messages = recorded_messages[2]
    assistant_tool_idx = next(i for i, m in enumerate(second_non_stream_messages) if m.get("role") == "assistant" and m.get("tool_calls"))
    tool_idx = next(i for i, m in enumerate(second_non_stream_messages) if m.get("role") == "tool")
    assert assistant_tool_idx < tool_idx
    assert second_non_stream_messages[assistant_tool_idx]["tool_calls"][0]["id"] == second_non_stream_messages[tool_idx]["tool_call_id"]


def test_streaming_terminal_errors_include_session_id():
    from artimis.engine import agent

    payloads = _sse_payloads(list(agent.run_agent_streaming("hello", session_id="session-123", max_iterations=0)))

    # The stream opens with an immediate "thinking" reasoning event (added so the
    # UI shows activity instantly), then the terminal error.
    assert payloads[0]["type"] == "reasoning"
    assert payloads[1:] == [{"type": "error", "content": "Max iterations reached", "session_id": "session-123"}]


def test_relevant_skills_route_is_not_shadowed_by_skill_id_route():
    from artimis.api.server import app

    paths = [getattr(route, "path", "") for route in app.routes]
    assert paths.index("/api/skills/relevant") < paths.index("/api/skills/{skill_id}")


def test_intelligence_source_has_no_literal_backslash_newline_artifacts():
    from pathlib import Path

    source = Path("artimis/engine/intelligence.py").read_text()
    assert "\\\\n" not in source
