"""
Artimis Agent — Intelligence Layer (Three-Tier)

Tier 1: Format Check — every message (fast, rule-based with LLM backup)
Tier 2: Drift Detection — every 3rd message + on topic shifts (LLM analysis)
Tier 3: Self-Critique — final output only (full LLM critique)

Core behaviors:
- Auto-naming: generates session names from first exchange
- Format intelligence: validates output matches requested format
- Context inheritance: new sessions get oriented from past sessions
- Drift detection: challenges requests that conflict with known facts
- Self-critique: reviews own output against quality standards before showing user
"""

import json
import logging
from typing import Optional
from datetime import datetime, timezone

logger = logging.getLogger("artimis.intelligence")


# ═══════════════════════════════════════════════════════════════
# TIER 1: FORMAT CHECK — every message (fast, cheap)
# ═══════════════════════════════════════════════════════════════

FORMAT_KEYWORDS = {
    "table": {
        "keywords": ["table", "tabular", "columns", "rows", "spreadsheet", "grid",
                      "compare", "comparison", "vs", "versus", "side by side", "breakdown"],
        "validator": lambda o: "|" in o and ("---" in o or ":-" in o),
        "instruction": "Present the data in a markdown table with headers and rows.",
    },
    "list": {
        "keywords": ["list", "steps", "numbered", "bullet", "how to", "guide",
                      "tutorial", "walkthrough", "checklist", "process", "workflow"],
        "validator": lambda o: any(f"{i}." in o or f"{i})" in o or f"{i} " in o[:3]
                                    for i in range(1, 5)) or "- " in o,
        "instruction": "Present the items as a numbered or bulleted list.",
    },
    "code": {
        "keywords": ["code", "function", "script", "program", "implement",
                      "write a", "build a", "create a function", "snippet"],
        "validator": lambda o: "```" in o,
        "instruction": "Wrap code in markdown code blocks with language tags.",
    },
    "json": {
        "keywords": ["json", "structured", "parseable", "api response",
                      "machine-readable", "export as json"],
        "validator": lambda o: o.strip().startswith("{") or o.strip().startswith("["),
        "instruction": "Return valid JSON only.",
    },
    "email": {
        "keywords": ["email", "draft an email", "write an email", "compose",
                      "subject line", "cold email", "outreach email"],
        "validator": lambda o: "subject" in o.lower() and ("body" in o.lower() or "\n\n" in o),
        "instruction": "Include a subject line and body. Use blank line between sections.",
    },
    "short": {
        "keywords": [],  # triggered by message length signal, not keywords
        "validator": lambda o: True,  # always passes, just a suggestion
        "instruction": "Keep the answer brief — the user's question was short.",
    },
}


def check_format(user_message: str, assistant_output: str) -> Optional[dict]:
    """
    Check if the assistant output matches the format the user needs.
    Runs on every message. Rule-based for speed, LLM backup if ambiguous.

    Returns a dict with format guidance if mismatch found, or None.
    """
    msg_lower = user_message.lower()
    msg_words = len(user_message.split())
    output_words = len(assistant_output.split())

    detected = []

    # Short-message detection: if user asked a short question, suggest brevity
    if msg_words < 12 and output_words > 250:
        detected.append({
            "format": "short",
            "current": f"essay ({output_words} words)",
            "expected": "brief answer",
            "guidance": "The user asked a short question. Keep the response under 100 words unless detail was requested.",
        })

    # Keyword-based format detection
    for fmt_name, fmt in FORMAT_KEYWORDS.items():
        if fmt_name == "short":
            continue  # already handled above
        if any(kw in msg_lower for kw in fmt["keywords"]):
            if not fmt["validator"](assistant_output):
                detected.append({
                    "format": fmt_name,
                    "current": "detected prose or wrong format",
                    "expected": fmt_name,
                    "guidance": fmt["instruction"],
                })

    if not detected:
        return None

    return {
        "mismatches": detected,
        "needs_regeneration": any(
            d["format"] in ("table", "code", "json") for d in detected
            # These formats are structural failures — must regenerate
        ),
        "notes": [d["guidance"] for d in detected if not d.get("needs_regeneration")],
    }


# ═══════════════════════════════════════════════════════════════
# TIER 2: DRIFT DETECTION — every 3rd message (LLM-backed)
# ═══════════════════════════════════════════════════════════════

DRIFT_CHECK_PROMPT = """You are a conversation monitor. Analyze whether the user's message represents a significant departure from the established conversation.

Conversation summary (previous messages): {context}

User's new message: "{message}"

Analyze:
1. Does this shift the topic significantly?
2. Does it contradict any facts established earlier?
3. Is there a sudden change in task/goal?
4. Is the user repeating themselves (stuck loop)?
5. Does the request conflict with known user preferences or constraints?

Return JSON only:
{{
  "drift_detected": true/false,
  "drift_type": "topic_shift" | "contradiction" | "goal_change" | "repetition" | "preference_conflict" | null,
  "explanation": "one sentence describing the drift",
  "suggested_action": "what the agent should say to the user (e.g., 'confirm the topic change', 'point out the contradiction')",
  "confidence": 0.0-1.0
}}

If no drift, set drift_detected to false and leave other fields null."""


def detect_drift(
    user_message: str,
    session_id: Optional[str] = None,
    conversation_history: Optional[list] = None,
) -> Optional[dict]:
    """
    Analyze whether the user has drifted from the session's established
    context. Runs every 3 messages.

    Returns a drift report dict or None if no drift.
    """
    # Build context summary from history
    if not conversation_history or len(conversation_history) < 4:
        return None  # Not enough context to detect drift

    context_lines = []
    for msg in conversation_history[-8:]:  # Last 8 messages for context
        role = msg.get("role", "unknown")
        content = str(msg.get("content", ""))[:200]
        context_lines.append(f"[{role}]: {content}")

    context_text = "\n".join(context_lines)

    # If the message is clearly a follow-up or clarification, skip
    short_followup_signals = ["yes", "no", "ok", "thanks", "go on", "continue",
                               "more", "elaborate", "what about", "also", "and"]
    msg_lower = user_message.lower().strip()
    if len(msg_lower.split()) <= 2 and any(msg_lower.startswith(s) for s in short_followup_signals):
        return None

    # Call LLM for drift analysis
    from artimis.engine.agent import _get_client

    try:
        client = _get_client()
        prompt = DRIFT_CHECK_PROMPT.format(
            context=context_text,
            message=user_message,
        )
        response = client.chat.completions.create(
            model="deepseek-v4-pro",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.2,
            max_tokens=300,
        )
        content = response.choices[0].message.content or "{}"

        # Extract JSON (with cleanup for common LLM formatting issues)
        content = content.strip()
        if content.startswith("```"):
            lines = content.split("\n")
            content = "\n".join(lines[1:-1] if lines[-1].strip() == "```" else lines[1:])
        # Remove trailing commas before closing braces/brackets (common LLM mistake)
        import re
        content = re.sub(r',\s*}', '}', content)
        content = re.sub(r',\s*]', ']', content)
        # Handle truncated JSON by closing unclosed braces
        open_braces = content.count('{') - content.count('}')
        open_brackets = content.count('[') - content.count(']')
        content += '}' * open_braces + ']' * open_brackets
        # Fix unterminated strings (LLM truncation mid-quote)
        content = re.sub(r'("(?:\\.|[^"\\])*)$', r'\1"', content)
        # Remove trailing content after the last closing brace
        last_brace = content.rfind('}')
        if last_brace != -1:
            content = content[:last_brace+1]
        
        try:
            result = json.loads(content)
        except json.JSONDecodeError:
            result = {}

        if result.get("drift_detected") and result.get("confidence", 0) > 0.6:
            return {
                "drift_type": result.get("drift_type"),
                "explanation": result.get("explanation"),
                "suggested_action": result.get("suggested_action"),
                "confidence": result.get("confidence"),
            }
        return None

    except Exception as e:
        logger.warning(f"Drift detection failed: {e}")
        return None


def should_check_drift(message_count: int, conversation_history: Optional[list]) -> bool:
    """Decide whether to run drift detection on this message."""
    if message_count < 3:
        return False
    if message_count % 3 == 0:
        return True
    # Also check on sudden short messages that might signal a shift
    if conversation_history and len(conversation_history) >= 2:
        last_msg = str(conversation_history[-1].get("content", ""))
        if len(last_msg.split()) <= 3 and "?" not in last_msg:
            return True  # Short non-question could be a "wait, actually..."
    return False


# ═══════════════════════════════════════════════════════════════
# TIER 3: SELF-CRITIQUE — final output only (full LLM analysis)
# ═══════════════════════════════════════════════════════════════

SELF_CRITIQUE_PROMPT = """You are an internal quality auditor for an AI agent called Artimis. Review the agent's response against these criteria:

1. SPECIFICITY — Is the answer specific and detailed, or generic and vague? Flag: "seamless", "streamlined", "innovative", "world-class", "cutting-edge", "tailored solutions", "best-in-class" — these are red flags.
2. ACCURACY — Are there any factual errors, unsupported claims, or contradictions?
3. COMPLETENESS — Did it fully answer the question? What's missing?
4. ACTIONABILITY — Does the response end with a clear next step or offer to go deeper?
5. CITATIONS — If it makes factual claims, does it cite sources?
6. RELEVANCE — Does it stay on topic, or does it wander?

Question: "{user_message}"

Response to audit:
---
{output}
---

Return JSON only:
{{
  "passed": true/false,
  "score": 1-10,
  "issues": [
    {{
      "type": "vagueness|inaccuracy|incompleteness|actionability|citations|relevance",
      "severity": "minor|major|critical",
      "description": "specific problem found",
      "fix": "concrete instruction to fix this specific issue"
    }}
  ],
  "strengths": ["what was specifically good"],
  "regenerate": true/false,
  "fix": "If regenerating: exact instruction for the agent to produce a better response. Be specific — not 'be better', but 'add a table comparing X and Y with real data from source Z'."
}}"""


def self_critique(
    user_message: str,
    output: str,
    tool_calls_made: int = 0,
) -> dict:
    """
    Full LLM critique of the agent's final output.
    Runs only on the final message before returning to user.

    Returns {passed, overall_score, issues, strengths, regeneration_needed, ...}
    """
    from artimis.engine.agent import _get_client

    # Quick pre-check: if the output is very short and the question was simple, skip
    if len(user_message.split()) < 5 and len(output.split()) < 50:
        # Simple Q&A — rule-based quick check is enough
        return _quick_critique(user_message, output)

    try:
        client = _get_client()
        prompt = SELF_CRITIQUE_PROMPT.format(
            user_message=user_message,
            output=output,
        )
        response = client.chat.completions.create(
            model="deepseek-v4-pro",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.3,
            max_tokens=600,
        )
        content = response.choices[0].message.content or "{}"
        content = content.strip()
        if content.startswith("```"):
            content = content.split("\n", 1)[1].rsplit("\n", 1)[0]

        try:
            result = json.loads(content)
        except json.JSONDecodeError:
            result = {}

        return {
            "passed": result.get("passed", True),
            "overall_score": result.get("score", 7),
            "issues": result.get("issues", []),
            "strengths": result.get("strengths", []),
            "regeneration_needed": result.get("regenerate", False),
            "regeneration_guidance": result.get("fix", ""),
        }

    except Exception as e:
        logger.warning(f"Self-critique LLM call failed: {e}, falling back to quick critique")
        return _quick_critique(user_message, output)


def _quick_critique(user_message: str, output: str) -> dict:
    """Fast rule-based critique for simple messages or when LLM is unavailable."""
    issues = []
    output_lower = output.lower()

    # Vagueness
    vague = ["seamless", "streamlined", "innovative", "world-class",
             "end-to-end solutions", "tailored solutions", "cutting-edge",
             "best-in-class", "industry-leading", "state-of-the-art"]
    found_vague = [v for v in vague if v in output_lower]
    if found_vague:
        issues.append({
            "type": "vagueness",
            "severity": "minor",
            "description": f"Vague marketing terms: {', '.join(found_vague)}",
            "fix": "Replace with specific facts or remove.",
        })

    # I don't know
    if "i don't know" in output_lower and len(output.split()) < 20:
        issues.append({
            "type": "completeness",
            "severity": "major",
            "description": "Response is 'I don't know' without attempting to help.",
            "fix": "Offer to search, suggest alternatives, or ask clarifying questions.",
        })

    # Actionability on longer responses
    if len(output.split()) > 100:
        ending = output[-300:].lower()
        has_next_step = any(m in ending for m in [
            "want me to", "shall i", "would you like", "next step",
            "recommend", "let me know", "happy to", "can i help",
        ])
        if not has_next_step:
            issues.append({
                "type": "actionability",
                "severity": "minor",
                "description": "Long response without a next step offer.",
                "fix": "End with a clear next step or offer to go deeper.",
            })

    return {
        "passed": len(issues) == 0,
        "overall_score": max(1, 8 - len(issues)),
        "issues": issues,
        "strengths": [],
        "regeneration_needed": any(i["severity"] == "critical" for i in issues),
        "regeneration_guidance": "; ".join(i["fix"] for i in issues) if issues else "",
    }


# ═══════════════════════════════════════════════════════════════
# AUTO-MEMORY: Learn from critique (Correction-to-Skill Pipeline)
# ═══════════════════════════════════════════════════════════════

def learn_from_critique(critique: dict, user_message: str, session_id: Optional[str] = None):
    """
    Correction-to-Skill pipeline.
    When critique fires (score < 6 or clear issues), distill the lesson into a skill entry.
    'When responding about X, always include Y.'
    Next session, that skill auto-injects.
    """
    if not critique:
        return
    
    issues = critique.get("issues", [])
    if not issues:
        return
    
    score = critique.get("overall_score", 10)
    # Only synthesize a skill if there's a significant failure (< 7)
    if score >= 7 and len(issues) <= 1:
        return
    
    from artimis.engine.agent import _get_client
    from artimis.db.schema import get_db, generate_id
    from artimis.engine.brain import create_skill, SKILLS_DIR
    import os

    try:
        # Ask LLM to synthesize a generalized rule from the critique issues
        client = _get_client()
        prompt = (
            "Analyze these critique issues from a recent conversation and formulate a generalized rule for the AI agent.\n"
            f"User's request context: {user_message[:300]}\n"
            f"Critique Issues: {json.dumps(issues, indent=2)}\n\n"
            "Formulate a clear, concise instruction in the format: 'When [condition], always [action].'\n"
            "Return JSON only:\n"
            "{\n"
            "  \"topic\": \"short-topic-name-like-coding-or-writing\",\n"
            "  \"rule\": \"When responding about X, always include Y.\"\n"
            "}"
        )
        response = client.chat.completions.create(
            model="deepseek-v4-pro",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.2,
            max_tokens=200,
        )
        content = response.choices[0].message.content or "{}"
        content = content.strip()
        if content.startswith("```"):
            lines = content.split("\n")
            content = "\n".join(lines[1:-1] if lines[-1].strip() == "```" else lines[1:])
        
        try:
            result = json.loads(content)
        except json.JSONDecodeError:
            result = {}
            
        topic = result.get("topic", "general")
        rule = result.get("rule", "")
        
        if not rule:
            return
            
        # We will maintain a single 'correction-ledger' skill that accumulates these rules.
        # It's better than creating 100 tiny skills.
        skill_name = "correction-ledger"
        
        conn = get_db()
        row = conn.execute("SELECT content FROM skills WHERE name = ?", (skill_name,)).fetchone()
        
        if row:
            # Update existing ledger
            current_content = row["content"]
            # Avoid exact duplicates
            if rule not in current_content:
                new_content = current_content + f"\n- **{topic.capitalize()}**: {rule}"
                conn.execute(
                    "UPDATE skills SET content = ?, version = version + 1 WHERE name = ?",
                    (new_content, skill_name)
                )
                conn.commit()
                # Update file
                skill_path = os.path.join(SKILLS_DIR, skill_name, "SKILL.md")
                if os.path.exists(skill_path):
                    with open(skill_path, "w") as f:
                        f.write(new_content)
                logger.info(f"Appended rule to correction-ledger: {rule[:80]}")
        else:
            # Create new ledger
            initial_content = (
                "# Correction Ledger\n\n"
                "This skill contains generalized rules learned from past mistakes and critiques. "
                "Always adhere to these rules when applicable:\n\n"
                f"- **{topic.capitalize()}**: {rule}"
            )
            create_skill(
                name=skill_name,
                content=initial_content,
                tags=["learning", "core", "rules"],
                auto_updated=True
            )
            logger.info(f"Created correction-ledger skill with rule: {rule[:80]}")
            
        conn.close()

    except Exception as e:
        logger.warning(f"Correction-to-skill pipeline failed: {e}")


# ═══════════════════════════════════════════════════════════════
# AUTO-NAMING
# ═══════════════════════════════════════════════════════════════

def _safe_session_name(candidate_name: str | None, first_user_message: str | None) -> str:
    """Return a non-empty, UI-safe session name.

    Reasoning models can return an empty content field when max_tokens is too low
    because the budget is spent on hidden reasoning. Empty names break the chat
    sidebar, so every auto-name path must pass through this sanitizer.
    """
    name = (candidate_name or "").strip().strip('"').strip("'").strip(".").strip()
    if not name:
        name = (first_user_message or "").strip()
    if not name:
        name = "New Chat"
    if len(name) > 60:
        name = name[:57].rstrip() + "..."
    return name


def auto_name_session(session_id: str, first_user_message: str,
                      first_assistant_response: str) -> str:
    """Generate a non-empty session name from the first exchange."""
    from artimis.engine.agent import _get_client
    from artimis.db.manager import rename_session

    try:
        client = _get_client()
        from artimis.engine.agent import DEFAULT_MODEL
        prompt = (
            "Generate a short, descriptive name (3-6 words max) for a conversation "
            "that starts with this exchange. Return ONLY the name, no quotes or punctuation.\n\n"
            f"User: {first_user_message[:200]}\n\n"
            f"Assistant: {first_assistant_response[:200]}"
        )
        response = client.chat.completions.create(
            model=DEFAULT_MODEL,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.3,
            max_tokens=512,
            timeout=45,
        )
        name = _safe_session_name(response.choices[0].message.content, first_user_message)
    except Exception:
        name = _safe_session_name("", first_user_message)

    rename_session(session_id, name)
    return name


# ═══════════════════════════════════════════════════════════════
# CONTEXT INHERITANCE
# ═══════════════════════════════════════════════════════════════

def distill_session_context(session_id: str):
    """
    Summarizes the older part of a long session to preserve context
    without blowing up the prompt budget. Saves to the 'summary' column.
    """
    from artimis.db.manager import get_messages
    from artimis.db.schema import get_db
    from artimis.engine.agent import _get_client
    
    conn = get_db()
    session = conn.execute("SELECT summary FROM sessions WHERE id = ?", (session_id,)).fetchone()
    if not session:
        conn.close()
        return
        
    # Get all messages chronologically
    all_msgs = get_messages(session_id, limit=1000, desc=False)
    conn.close()
    
    if len(all_msgs) < 20:
        return
        
    # We want to summarize everything except the last 10 messages
    to_summarize = all_msgs[:-10]
    
    text_to_summarize = "\n".join([f"{m['role'].upper()}: {m['content'][:200]}" for m in to_summarize])
    existing_summary = session["summary"] or ""
    
    try:
        client = _get_client()
        prompt = (
            "Summarize the following conversation history into a concise list of key facts, "
            "established decisions, user constraints, and completed tasks. "
            "This will serve as the persistent memory for the ongoing conversation.\n\n"
        )
        if existing_summary:
            prompt += f"Previous summary:\n{existing_summary}\n\n"
            
        prompt += f"New messages to incorporate:\n{text_to_summarize}\n\n"
        prompt += "Return ONLY the compressed summary in bullet points, without introductory text."
        
        response = client.chat.completions.create(
            model="deepseek-v4-pro",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.3,
            max_tokens=300,
        )
        new_summary = (response.choices[0].message.content or "").strip()
        
        conn = get_db()
        conn.execute("UPDATE sessions SET summary = ? WHERE id = ?", (new_summary, session_id))
        conn.commit()
        conn.close()
        
    except Exception as e:
        logger.warning(f"Session distillation failed: {e}")

def get_session_orientation(session_id: str, user_message: str) -> str:
    """
    Build context for a new session by scanning recent sessions and memories.
    Returns an orientation string to inject into the system prompt.
    """
    from artimis.db.schema import get_db
    from artimis.db.manager import list_memories, get_session

    parts = []

    # Recent sessions
    try:
        conn = get_db()
        recent = conn.execute(
            """SELECT name, summary, updated_at FROM sessions
               WHERE id != ? AND status = 'active'
               AND updated_at > datetime('now', '-7 days')
               ORDER BY updated_at DESC LIMIT 5""",
            (session_id,)
        ).fetchall()
        conn.close()

        if recent:
            names = [r["name"] for r in recent if r["name"] and r["name"] != "New Chat"]
            if names:
                parts.append(f"Recent conversations: {', '.join(names[:3])}.")

    except Exception:
        pass

    # Relevant memories
    try:
        all_memories = list_memories()
        def safe_load_tags(tag_str):
            try:
                return json.loads(tag_str)
            except json.JSONDecodeError:
                return []
        identity_mems = [
            m for m in all_memories
            if any(t in safe_load_tags(m.get("tags", "[]")) for t in ("identity", "fact", "preference"))
        ]
        if identity_mems:
            parts.append(
                "Known user context: " +
                "; ".join(m["content"] for m in identity_mems[:5]) + "."
            )
    except Exception:
        pass

    # Check for parent session's content
    try:
        conn = get_db()
        session = conn.execute(
            "SELECT parent_session_id, summary FROM sessions WHERE id = ?",
            (session_id,)
        ).fetchone()
        conn.close()

        if session and session["parent_session_id"]:
            parent = get_session(session["parent_session_id"])
            if parent and parent.get("summary"):
                parts.insert(0, f"Previous session context: {parent['summary']}")
    except Exception:
        pass

    if not parts:
        return ""

    return "\n".join(parts)
