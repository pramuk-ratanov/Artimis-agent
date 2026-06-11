"""
Artimis Agent — Core Agent Loop
OpenAI-compatible API client with tool calling. Works with DeepSeek, OpenAI, Anthropic, and any compatible provider.
"""

import json
import os
import logging
from typing import Optional
from datetime import datetime

from openai import OpenAI

from artimis.engine.system_prompt import SYSTEM_PROMPT
from artimis.engine.tools import TOOL_SCHEMAS, execute_tool

logger = logging.getLogger("artimis.agent")

# Load env vars from the Artimis home (~/.artimis/.env by default, or
# $ARTIMIS_HOME/.env inside a container). Artimis' own isolated config.
_ENV_FILE = os.path.join(
    os.environ.get("ARTIMIS_HOME", os.path.expanduser("~/.artimis")),
    ".env",
)
if os.path.exists(_ENV_FILE):
    with open(_ENV_FILE) as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                key, _, val = line.partition("=")
                key = key.strip()
                val = val.strip().strip('"').strip("'")
                if key and val and key not in os.environ:
                    os.environ[key] = val

# Default model — supported models:
#   DeepSeek:   deepseek-v4-pro, deepseek-v4-flash
#   OpenAI:     gpt-4o, gpt-4o-mini, gpt-5.5
#   OpenRouter: anthropic/claude-sonnet-4, anthropic/claude-opus-4, openai/gpt-5.5-pro
DEFAULT_MODEL = os.getenv("ARTIMIS_MODEL", "deepseek-v4-pro")


def _get_client(model: Optional[str] = None) -> OpenAI:
    """Get an OpenAI-compatible client using available API keys.

    Routing priority:
      1. If model is prefixed with 'openai/' or 'anthropic/' → OpenRouter
      2. DEEPSEEK_API_KEY  → DeepSeek
      3. OPENAI_API_KEY / GPT_API_KEY → OpenAI
      4. OPENROUTER_API_KEY → OpenRouter (generic fallback)
      5. ANTHROPIC_API_KEY → OpenRouter (legacy alias)
    """
    openrouter_key = os.getenv("OPENROUTER_API_KEY")
    deepseek_key = os.getenv("DEEPSEEK_API_KEY")
    openai_key = os.getenv("OPENAI_API_KEY") or os.getenv("GPT_API_KEY")
    anthropic_key = os.getenv("ANTHROPIC_API_KEY")

    # Route prefixed model names directly to OpenRouter
    _model = model or DEFAULT_MODEL
    if _model and (_model.startswith("openai/") or _model.startswith("anthropic/")):
        _key = openrouter_key or anthropic_key or openai_key
        if _key:
            return OpenAI(api_key=_key, base_url="https://openrouter.ai/api/v1")

    if deepseek_key:
        return OpenAI(api_key=deepseek_key, base_url="https://api.deepseek.com/v1")

    if openai_key:
        return OpenAI(api_key=openai_key)

    if openrouter_key:
        return OpenAI(api_key=openrouter_key, base_url="https://openrouter.ai/api/v1")

    if anthropic_key:
        return OpenAI(
            api_key=anthropic_key,
            base_url="https://openrouter.ai/api/v1"
        )

    raise RuntimeError(
        "No API key found. Set DEEPSEEK_API_KEY, OPENAI_API_KEY, GPT_API_KEY, "
        "OPENROUTER_API_KEY, or ANTHROPIC_API_KEY."
    )


def run_agent(
    user_message: str,
    session_id: Optional[str] = None,
    model: Optional[str] = None,
    conversation_history: Optional[list] = None,
    max_iterations: int = 10,
) -> dict:
    """
    Run the Artimis agent loop.

    Args:
        user_message: The user's message.
        session_id: The session ID for context injection.
        model: Override the default model.
        conversation_history: Previous messages to include for context.
        max_iterations: Maximum tool-calling iterations.

    Returns:
        dict with keys: response, tool_calls_made, iterations, model_used
    """
    model_name = model or DEFAULT_MODEL
    client = _get_client(model_name)

    # Build messages array
    messages = []

    # System prompt
    system_content = SYSTEM_PROMPT

    # Inject Brain context (relevant memories + skills)
    if session_id:
        try:
            from artimis.engine.brain import process_user_message
            brain_context = process_user_message(session_id, user_message)
            if brain_context:
                system_content += brain_context
        except Exception:
            pass  # Brain injection is best-effort

    # Inject self-prompting reminder — detailed rules are in the system prompt
    system_content += "\n\nFollow the SELF-PROMPTING BEHAVIOR rules in your system prompt above.\n"

    # Inject curiosity-driven session startup context
    if session_id and (not conversation_history or len(conversation_history) <= 1):
        try:
            from artimis.engine.curiosity import deep_curiosity_scan
            insights = deep_curiosity_scan()
            if insights:
                system_content += "\n\n## RECENT PATTERNS I'VE NOTICED\n"
                for insight in insights[:2]:
                    system_content += f"- {insight['description']}\n"
                    if insight.get("suggested_action"):
                        system_content += f"  The user might want to: {insight['suggested_action']}\n"
        except Exception:
            pass

    messages.append({"role": "system", "content": system_content})

    # Add conversation history if provided
    if conversation_history:
        messages.extend(conversation_history)

    # Add the user message
    messages.append({"role": "user", "content": user_message})

    tool_calls_made = 0

    # Agent loop
    for iteration in range(max_iterations):
        try:
            response = client.chat.completions.create(
                model=model_name,
                messages=messages,
                tools=TOOL_SCHEMAS,
                tool_choice="auto",
                temperature=0.7,
            )
        except Exception as e:
            logger.error(f"LLM call failed: {e}")
            return {
                "response": f"I encountered an error: {str(e)}",
                "tool_calls_made": tool_calls_made,
                "iterations": iteration,
                "model_used": model_name,
                "error": str(e),
            }

        choice = response.choices[0]
        msg = choice.message

        # If the model wants to call tools
        if msg.tool_calls:
            # Add the assistant message with tool calls
            assistant_msg = {
                "role": "assistant",
                "content": msg.content,
                "tool_calls": [
                    {
                        "id": tc.id,
                        "type": "function",
                        "function": {
                            "name": tc.function.name,
                            "arguments": tc.function.arguments,
                        },
                    }
                    for tc in msg.tool_calls
                ],
            }
            messages.append(assistant_msg)

            # Execute each tool
            for tc in msg.tool_calls:
                tool_name = tc.function.name
                try:
                    tool_args = json.loads(tc.function.arguments)
                except json.JSONDecodeError:
                    tool_args = {}

                logger.info(f"Tool call: {tool_name}({json.dumps(tool_args)[:200]})")
                result = execute_tool(tool_name, tool_args)
                tool_calls_made += 1

                # Add tool result
                messages.append({
                    "role": "tool",
                    "tool_call_id": tc.id,
                    "content": result,
                })

            continue  # Loop back to LLM with tool results

        # If the model responded with text (no tool calls)
        response_text = msg.content or ""

        # ═══ THREE-TIER INTELLIGENCE ═══
        intelligence_notes = []
        format_guidance = None

        # Tier 1: Format Check — every message (fast, rule-based)
        try:
            from artimis.engine.intelligence import check_format
            fmt = check_format(user_message, response_text)
            if fmt:
                format_guidance = fmt
                for note in fmt.get("notes", []):
                    intelligence_notes.append(f"[format] {note}")
        except Exception:
            pass

        # Tier 2: Drift Detection — every 3rd message (LLM-backed)
        try:
            from artimis.engine.intelligence import detect_drift, should_check_drift
            msg_count = len(conversation_history) + 1 if conversation_history else 1
            if should_check_drift(msg_count, conversation_history):
                drift = detect_drift(user_message, session_id, conversation_history)
                if drift:
                    intelligence_notes.append(
                        f"[drift:{drift['drift_type']}] {drift['explanation']}"
                    )
                    # Inject drift warning into response if high confidence
                    if drift.get("confidence", 0) > 0.8:
                        response_text = (
                            f"*[Heads up: {drift['suggested_action']}]*\n\n{response_text}"
                        )
        except Exception:
            pass

        # Tier 3: Self-Critique — with regeneration loop
        critique = None
        # Do not reset intelligence_notes to keep Tier 1 & Tier 2 logs
        best_response = response_text
        best_critique = None
        best_score = 0
        RETRY_LIMIT = 2
        CRITIQUE_THRESHOLD = 6  # Regenerate if score below this
        retry = 0

        for retry in range(RETRY_LIMIT + 1):  # 0 = initial, 1-2 = retries
            try:
                from artimis.engine.intelligence import self_critique
                critique = self_critique(user_message, response_text, tool_calls_made)
                score = critique.get("overall_score", 7)

                if score > best_score:
                    best_score = score
                    best_response = response_text
                    best_critique = critique

                # Log critique result
                intelligence_notes.append(
                    f"[critique:score] {score}/10"
                )

                if not critique.get("passed", True):
                    issues = critique.get("issues", [])
                    for issue in issues:
                        if isinstance(issue, dict):
                            intelligence_notes.append(
                                f"[critique:{issue.get('severity', 'minor')}] {issue.get('description', str(issue))}"
                            )
                        else:
                            intelligence_notes.append(f"[critique] {str(issue)}")

                # Save learnings from critique
                try:
                    from artimis.engine.intelligence import learn_from_critique
                    learn_from_critique(critique, user_message, session_id)
                except Exception:
                    pass

                # Check if we should regenerate
                if score >= CRITIQUE_THRESHOLD or retry >= RETRY_LIMIT:
                    break

                # Regenerate with fix guidance
                guidance = critique.get("regeneration_guidance", "")
                if not guidance and critique.get("issues"):
                    issue_list = critique["issues"]
                    if isinstance(issue_list, list) and issue_list:
                        first = issue_list[0]
                        guidance = first.get("fix", str(first)) if isinstance(first, dict) else str(first)

                if guidance:
                    intelligence_notes.append(f"[critique:retry {retry+1}/{RETRY_LIMIT}] Regenerating with fix: {guidance[:200]}")

                    # Add fix instruction to the conversation for regeneration
                    fix_message = {
                        "role": "user",
                        "content": f"[SELF-CRITIQUE] Your last response scored {score}/10. Fix: {guidance}. Regenerate a better response."
                    }
                    messages.append(fix_message)

                    try:
                        response = client.chat.completions.create(
                            model=model_name,
                            messages=messages,
                            temperature=0.5,  # Lower temp for refinement
                            max_tokens=2000,
                        )
                        response_text = response.choices[0].message.content or ""
                    except Exception as e:
                        logger.warning(f"Regeneration LLM call failed: {e}")
                        break

            except Exception:
                break

        # After retries, run curiosity engine to surface cross-session patterns
        try:
            from artimis.engine.curiosity import check_patterns
            curiosity_note = check_patterns(session_id, user_message)
            if curiosity_note:
                best_response += f"\n\n{curiosity_note}"
                intelligence_notes.append("[curiosity] surfaced cross-session pattern")
        except Exception:
            pass

        # Auto-experiment trigger: if critique score stayed below threshold,
        # create a harness improvement experiment
        if best_score < 6 and session_id:
            try:
                from artimis.db.schema import get_db, generate_id, now
                conn = get_db()
                # Check how many recent experiments are pending
                pending = conn.execute(
                    "SELECT COUNT(*) FROM harness_experiments WHERE outcome = 'pending'"
                ).fetchone()[0]
                # Only create if no pending experiments (prevent flood)
                if pending == 0:
                    exp_id = generate_id()
                    conn.execute(
                        """INSERT INTO harness_experiments (id, hypothesis, component, before_version, outcome)
                           VALUES (?,?,?, (SELECT COALESCE(MAX(version),0) FROM harness_snapshots WHERE component='system_prompt'), 'pending')""",
                        (exp_id, f"Auto-triggered: critique score {best_score}/10. Hypothesis: system_prompt needs refinement for this type of query.", "system_prompt")
                    )
                    conn.commit()
                    intelligence_notes.append(f"[harness] auto-created experiment {exp_id[:8]} (score {best_score}/10)")
                conn.close()
            except Exception:
                pass

        # Record critique score for trend tracking
        if session_id:
            try:
                from artimis.db.schema import get_db, generate_id
                conn = get_db()
                conn.execute(
                    "INSERT INTO critique_history (id, session_id, score) VALUES (?, ?, ?)",
                    (generate_id(), session_id, best_score)
                )
                conn.commit()
                conn.close()
            except Exception:
                pass

        return {
            "response": best_response,
            "tool_calls_made": tool_calls_made,
            "iterations": iteration + 1,
            "model_used": model_name,
            "intelligence": intelligence_notes if intelligence_notes else None,
            "critique": best_critique,
            "regenerations": retry,
        }

    # Max iterations reached
    return {
        "response": "I reached the maximum number of steps without completing the task. Can you simplify or clarify what you need?",
        "tool_calls_made": tool_calls_made,
        "iterations": max_iterations,
        "model_used": model_name,
    }


def run_agent_streaming(
    user_message: str,
    session_id: Optional[str] = None,
    model: Optional[str] = None,
    conversation_history: Optional[list] = None,
    max_iterations: int = 10,
):
    """
    Streaming version of run_agent. Yields SSE chunks for the final response.
    Tool-calling phase runs synchronously, final response streams via SSE.

    The terminal ``done`` event carries ``session_id`` and ``tool_calls_made`` so
    the frontend can sync the session ID (preventing duplicate-session leaks) and
    fire auto-naming. After streaming completes, the accumulated response is run
    through the intelligence layer (critique + auto-experiment trigger) so the
    streaming path stays in parity with the synchronous ``run_agent`` path.
    """
    model_name = model or DEFAULT_MODEL
    client = _get_client(model_name)

    # Build messages exactly like run_agent
    messages = []
    system_content = SYSTEM_PROMPT

    if session_id:
        try:
            from artimis.engine.brain import process_user_message
            brain_context = process_user_message(session_id, user_message)
            if brain_context:
                system_content += brain_context
        except Exception:
            pass

    system_content += """
## SELF-PROMPTING BEHAVIOR
You are NOT a passive assistant. At the end of every response, ask yourself:
- Is there a pattern across previous sessions I should flag?
- Is there a skill or memory relevant to this that I haven't mentioned?
If yes, add a brief note. Be proactive, not pushy. One insight per response maximum."""

    messages.append({"role": "system", "content": system_content})
    if conversation_history:
        messages.extend(conversation_history)
    messages.append({"role": "user", "content": user_message})

    tool_calls_made = 0

    # Phase 1: Tool calling loop (synchronous)
    for iteration in range(max_iterations):
        try:
            response = client.chat.completions.create(
                model=model_name,
                messages=messages,
                tools=TOOL_SCHEMAS,
                tool_choice="auto",
                temperature=0.7,
            )
        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'content': str(e)})}\n\n"
            return

        choice = response.choices[0]
        msg = choice.message

        if msg.tool_calls:
            assistant_msg = {
                "role": "assistant",
                "content": msg.content,
                "tool_calls": [
                    {"id": tc.id, "type": "function", "function": {"name": tc.function.name, "arguments": tc.function.arguments}}
                    for tc in msg.tool_calls
                ],
            }
            messages.append(assistant_msg)

            for tc in msg.tool_calls:
                tool_name = tc.function.name
                try:
                    tool_args = json.loads(tc.function.arguments)
                except json.JSONDecodeError:
                    tool_args = {}

                # Yield tool call status
                yield f"data: {json.dumps({'type': 'tool', 'name': tool_name, 'args': tool_args})}\n\n"

                result = execute_tool(tool_name, tool_args)
                tool_calls_made += 1

                messages.append({"role": "tool", "tool_call_id": tc.id, "content": result})
            continue

        # Phase 2: Stream the final response
        yield f"data: {json.dumps({'type': 'start', 'tool_calls_made': tool_calls_made, 'model': model_name})}\n\n"

        streamed_parts = []
        try:
            stream = client.chat.completions.create(
                model=model_name,
                messages=messages,
                temperature=0.7,
                max_tokens=2000,
                stream=True,
            )

            for chunk in stream:
                if chunk.choices and chunk.choices[0].delta.content:
                    content = chunk.choices[0].delta.content
                    streamed_parts.append(content)
                    yield f"data: {json.dumps({'type': 'token', 'content': content})}\n\n"

        except Exception as e:
            logger.error(f"Streaming failed: {e}")
            # Fallback: non-streaming call
            try:
                response = client.chat.completions.create(
                    model=model_name,
                    messages=messages,
                    temperature=0.7,
                    max_tokens=2000,
                )
                fallback = response.choices[0].message.content or ""
                streamed_parts.append(fallback)
                yield f"data: {json.dumps({'type': 'token', 'content': fallback})}\n\n"
            except Exception as e2:
                yield f"data: {json.dumps({'type': 'error', 'content': str(e2)})}\n\n"
                return

        final_text = "".join(streamed_parts)

        intelligence_notes = []
        try:
            from artimis.engine.intelligence import check_format
            fmt = check_format(user_message, final_text)
            if fmt:
                for note in fmt.get("notes", []):
                    intelligence_notes.append(f"[format] {note}")
        except Exception:
            pass

        # ═══ INTELLIGENCE LAYER (parity with run_agent) ═══
        intelligence_notes = []

        # ═══ CURIOSITY ENGINE (parity with run_agent) ═══
        try:
            from artimis.engine.curiosity import check_patterns
            curiosity_note = check_patterns(session_id, user_message)
            if curiosity_note:
                curiosity_payload = f"\n\n{curiosity_note}"
                final_text += curiosity_payload
                yield f"data: {json.dumps({'type': 'token', 'content': curiosity_payload})}\n\n"
                intelligence_notes.append("[curiosity] surfaced cross-session pattern")
        except Exception:
            pass

        # ═══ FORMAT CHECK (parity with run_agent) ═══
        try:
            from artimis.engine.intelligence import check_format
            fmt = check_format(user_message, final_text)
            if fmt:
                for note in fmt.get("notes", []):
                    intelligence_notes.append(f"[format] {note}")
        except Exception:
            pass

        # ═══ INTELLIGENCE LAYER (parity with run_agent) ═══
        critique_score = None
        try:
            from artimis.engine.intelligence import self_critique, learn_from_critique
            critique = self_critique(user_message, final_text, tool_calls_made)
            critique_score = critique.get("overall_score", 7)
            intelligence_notes.append(f"[critique:score] {critique_score}/10")

            if not critique.get("passed", True):
                issues = critique.get("issues", [])
                for issue in issues:
                    if isinstance(issue, dict):
                        intelligence_notes.append(
                            f"[critique:{issue.get('severity', 'minor')}] {issue.get('description', str(issue))}"
                        )
                    else:
                        intelligence_notes.append(f"[critique] {str(issue)}")

            try:
                learn_from_critique(critique, user_message, session_id)
            except Exception:
                pass
        except Exception:
            pass

        # Record critique score for trend tracking
        if critique_score is not None and session_id:
            try:
                from artimis.db.schema import get_db, generate_id
                conn = get_db()
                conn.execute(
                    "INSERT INTO critique_history (id, session_id, score) VALUES (?, ?, ?)",
                    (generate_id(), session_id, critique_score)
                )
                conn.commit()
                conn.close()
            except Exception:
                pass

        # Auto-experiment trigger
        if critique_score is not None and critique_score < 6 and session_id:
            try:
                from artimis.db.schema import get_db, generate_id
                conn = get_db()
                pending = conn.execute(
                    "SELECT COUNT(*) FROM harness_experiments WHERE outcome = 'pending'"
                ).fetchone()[0]
                if pending == 0:
                    exp_id = generate_id()
                    conn.execute(
                        "INSERT INTO harness_experiments (id, hypothesis, component, before_version, outcome) "
                        "VALUES (?,?,?, (SELECT COALESCE(MAX(version),0) FROM harness_snapshots WHERE component='system_prompt'), 'pending')",
                        (exp_id, f"Auto-triggered (streaming): critique score {critique_score}/10. Hypothesis: system_prompt needs refinement.", "system_prompt")
                    )
                    conn.commit()
                conn.close()
            except Exception:
                pass

        done_payload = {
            "type": "done",
            "session_id": session_id,
            "tool_calls_made": tool_calls_made,
            "model": model_name,
        }
        if critique_score is not None:
            done_payload["critique_score"] = critique_score
        if intelligence_notes:
            done_payload["intelligence"] = intelligence_notes
        yield f"data: {json.dumps(done_payload)}\n\n"
        return

    yield f"data: {json.dumps({'type': 'error', 'content': 'Max iterations reached'})}\n\n"
