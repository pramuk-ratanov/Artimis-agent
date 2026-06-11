# Artimis Agent Loop Bug Audit
**Date:** 2026-06-09
**Tool:** Gemini CLI (subagent) — single-pass codebase trace
**Scope:** session lifecycle, memory persistence, intelligence layer wiring

---

## BUG 1: Session Leak

**ROOT CAUSE:** `artimis/api/server.py:264`
**MECHANISM:** `agent_stream_endpoint` calls `db.create_session()` on line 264 BEFORE the agent processes any message. If the agent returns an error, disconnects, or the user never sends valid content, the session row exists with 0 messages — permanently orphaned. Confirmed in production: 8 empty sessions on the deployed instance.

```python
# server.py:258-265
session_id: str = req.session_id or ""
session = None
if session_id:
    session = db.get_session(session_id)
if not session:
    session = db.create_session()  # <-- LEAK: called before agent runs
    session_id = session["id"]
```

**FIX:** Move `db.create_session()` into the agent loop, triggered only when the first message is successfully saved. Alternatively, add a startup cleanup: `DELETE FROM sessions WHERE (SELECT COUNT(*) FROM messages WHERE messages.session_id=sessions.id)=0`.

---

## BUG 2: Memory Auto-Save Duplication

**ROOT CAUSE:** `artimis/engine/brain.py:478` calls `auto_save_memories()` on every user message. Pattern 5 in `_SIGNIFICANCE_PATTERNS` (line 189) matches instructional prefixes that should be stripped.

```python
# brain.py:189
(r"(?:remember|note|save)\s+(?:this|that)?\s*:?\s*(.{10,200})", "fact"),
```

For input `"save to memory that pi is approximately 3.14159"`:
1. `save` matches
2. `\s+` consumes space
3. `(?:this|that)?` is OPTIONAL — matches nothing, does not consume "to memory that"
4. `(.{10,200})` captures `"to memory that pi is approximately 3.14159"` — the full instruction prefix included

**RESULT:** Two memories created for the same fact:
- `"Pi is approximately 3.14159"` (clean, from explicit `memory_save` tool call)
- `"to memory that pi is approximately 3.14159"` (dirty, from auto-save pattern match)

**FIX:** Add `"(?:to\s+memory\s+that|this|that)?\s*"` to the non-capturing group:
```python
(r"(?:remember|note|save)\s+(?:to\s+memory\s+(?:that|this)?|this|that)?\s*:?\s*(.{10,200})", "fact"),
```

---

## BUG 3: `format_check` Not Wired in Streaming Path

**ROOT CAUSE:** `artimis/engine/intelligence.py:68` (`check_format`) is only called in the synchronous agent path (`run_agent`, agent.py:247-248). The streaming path (`run_agent_streaming`, agent.py:407-583) calls `self_critique` and `learn_from_critique` but never `check_format`.

**IMPACT:** Format guardrails (empty responses, truncated output, structural validation) do not fire during streaming. The deployed instance uses the streaming endpoint for all user-facing interactions.

**FIX:** Add `check_format` call after `self_critique` in the streaming intelligence block (agent.py ~line 536-548):
```python
format_issues = check_format(user_message, full_response)
if format_issues:
    # inject correction or re-trigger generation
```

---

## SUMMARY

| Bug | Severity | User-Visible Symptom |
|-----|----------|----------------------|
| Session leak | Medium | Dead sessions accumulate in sidebar |
| Auto-save duplication | High | User sees dirty/duplicate memory content |
| format_check missing | High | Malformed responses pass through unfiltered |

All three are in the deployed instance on :7002. All three have known, narrow fixes.
