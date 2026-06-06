"""
Artimis Agent — Intelligence Layer

Core agent behaviors beyond basic tool calling:
- Auto-naming: generates session names from first exchange
- Format intelligence: recommends better formats when requested format is wrong
- Context inheritance: new sessions get oriented from past sessions
- Drift detection: challenges requests that conflict with known facts
- Self-critique: reviews own output against quality standards before showing user
"""

import json
from typing import Optional
from artimis.db.manager import (
    get_session, rename_session, list_sessions, get_messages,
    get_task, update_task, list_memories,
)


# ─── Auto-Naming Chats ─────────────────────────────────────

def auto_name_session(session_id: str, first_user_message: str,
                      first_assistant_response: str):
    """
    Generate a session name from the first exchange.
    Uses a small prompt to extract a 3-6 word name.
    """
    from artimis.engine.agent import run_agent

    prompt = (
        "Generate a short name (3-6 words max) for a conversation that starts "
        f"with this exchange. Reply with ONLY the name, no quotes, no punctuation.\n\n"
        f"User: {first_user_message[:200]}\n\n"
        f"Assistant: {first_assistant_response[:200]}"
    )

    result = run_agent(prompt, max_iterations=1)
    name = result["response"].strip().strip('"').strip("'")

    # Cap at 60 chars
    if len(name) > 60:
        name = name[:57] + "..."

    rename_session(session_id, name)
    return name


# ─── Format Intelligence ───────────────────────────────────

FORMAT_RULES = {
    "comparison": {
        "best_format": "table",
        "why": "Side-by-side comparison is clearer in a table than prose.",
        "triggers": ["compare", "comparison", "vs", "versus", "difference between"],
    },
    "steps": {
        "best_format": "numbered list",
        "why": "Sequential steps are easier to follow as a numbered list.",
        "triggers": ["steps", "how to", "guide", "tutorial", "process", "walkthrough"],
    },
    "data_heavy": {
        "best_format": "table + summary",
        "why": "Dense data needs a table with a short summary above it.",
        "triggers": ["data", "metrics", "statistics", "numbers", "figures", "breakdown"],
    },
    "pros_cons": {
        "best_format": "two-column table",
        "why": "Pros and cons are clearest side by side.",
        "triggers": ["pros and cons", "advantages", "disadvantages", "trade-offs"],
    },
}


def check_format(user_request: str, assistant_output: str) -> Optional[dict]:
    """
    Check if the assistant's output format matches what the user needs.
    Returns a suggestion dict if a better format exists, None otherwise.
    """
    request_lower = user_request.lower()

    for rule_name, rule in FORMAT_RULES.items():
        if any(t in request_lower for t in rule["triggers"]):
            # Check if the output already uses the best format
            output_lower = assistant_output.lower()
            if rule["best_format"] == "table":
                if "|" not in output_lower or "---" not in output_lower:
                    return {
                        "current": "prose",
                        "suggested": rule["best_format"],
                        "why": rule["why"],
                    }
            elif rule["best_format"] == "numbered list":
                if not any(
                    f"{i}." in output_lower or f"{i})" in output_lower
                    for i in range(1, 4)
                ):
                    return {
                        "current": "unstructured",
                        "suggested": rule["best_format"],
                        "why": rule["why"],
                    }

    return None


# ─── Context Inheritance ───────────────────────────────────

def get_session_orientation(session_id: str, user_message: str) -> str:
    """
    When a new session starts, scan past sessions and memories for relevant context.
    Returns a 2-3 sentence orientation to inject into the system prompt.
    """
    from artimis.db.schema import get_db

    parts = []

    # Check recent sessions (last 7 days)
    conn = get_db()
    recent = conn.execute(
        """SELECT * FROM sessions
           WHERE id != ? AND status = 'active'
           AND updated_at > datetime('now', '-7 days')
           ORDER BY updated_at DESC LIMIT 5""",
        (session_id,)
    ).fetchall()
    conn.close()

    if recent:
        recent_names = [r["name"] for r in recent if r["name"] != "New Chat"]
        if recent_names:
            parts.append(
                f"Recent conversations: {', '.join(recent_names[:3])}."
            )

    # Check for relevant memories
    all_memories = list_memories()
    if all_memories:
        identity_memories = [
            m for m in all_memories
            if "identity" in json.loads(m.get("tags", "[]"))
        ]
        if identity_memories:
            parts.append(
                f"User context: {'; '.join(m['content'] for m in identity_memories[:3])}."
            )

    if not parts:
        return ""

    return "\n".join(parts)


# ─── Drift Detection ───────────────────────────────────────

DRIFT_CHECKS = [
    {
        "check": "The user is asking for X, but past data suggests Y is more effective.",
        "tags": ["marketing", "campaign", "strategy"],
    },
    {
        "check": "The user's request conflicts with a stored preference or fact.",
        "tags": ["preference", "fact"],
    },
    {
        "check": "The user is listing options but may have missed something in their knowledge base.",
        "tags": ["competitor", "option", "choice"],
    },
]


def detect_drift(user_message: str) -> Optional[str]:
    """
    Check if the user's request conflicts with stored knowledge.
    Returns a drift warning string if found, None otherwise.
    """
    from artimis.db.schema import get_db

    msg_lower = user_message.lower()

    # Check for marketing-related requests that conflict with known data
    if any(t in msg_lower for t in ["linkedin", "social media", "campaign"]):
        # Check if we have memories about preferred channels
        conn = get_db()
        channel_memories = conn.execute(
            "SELECT * FROM memories WHERE content LIKE '%Google%' OR content LIKE '%search%' OR content LIKE '%channel%' LIMIT 3"
        ).fetchall()
        conn.close()

        if channel_memories:
            return (
                "Note: Stored data suggests your buyers may not be on this channel. "
                "Ask the user if they want to verify the channel choice before proceeding."
            )

    # Check for competitor analysis missing known competitors
    if any(t in msg_lower for t in ["competitor", "competition", "rival"]):
        conn = get_db()
        comp_memories = conn.execute(
            "SELECT * FROM memories WHERE content LIKE '%competitor%' OR content LIKE '%Mainfreight%' OR content LIKE '%rival%' LIMIT 5"
        ).fetchall()
        conn.close()

        if comp_memories:
            names = [m["content"][:80] for m in comp_memories]
            return (
                f"Note: Known competitors in memory: {'; '.join(names[:3])}. "
                "Check if the user has included all relevant competitors."
            )

    return None


# ─── Self-Critique Loop ────────────────────────────────────

QUALITY_CHECKS = [
    {
        "name": "vagueness",
        "check": "Does the output contain vague claims without evidence?",
        "patterns": [
            "seamless", "streamlined", "innovative", "world-class",
            "end-to-end solutions", "tailored solutions", "cutting-edge",
            "best-in-class", "industry-leading", "state-of-the-art",
        ],
        "fix": "Replace vague claims with specific facts, numbers, or examples.",
    },
    {
        "name": "citation",
        "check": "Does the output cite sources when making factual claims?",
        "patterns": [],  # Checked differently - look for URLs or source mentions
        "fix": "Add source citations for factual claims.",
    },
    {
        "name": "length",
        "check": "Is the output proportionate to the request?",
        "patterns": [],
        "fix": "If the user asked for a short answer and got an essay, trim it. If they asked for detail and got one line, expand.",
    },
    {
        "name": "actionability",
        "check": "Does the output tell the user what to do next?",
        "patterns": [],
        "fix": "End with a clear next step or offer to go deeper.",
    },
]


def self_critique(user_message: str, output: str) -> dict:
    """
    Review the output against quality standards.
    Returns {passed: bool, issues: list, fixed_output: str}
    """
    issues = []

    # Vagueness check
    vague_found = []
    for pattern in QUALITY_CHECKS[0]["patterns"]:
        if pattern.lower() in output.lower():
            vague_found.append(pattern)
    if vague_found:
        issues.append({
            "check": "vagueness",
            "found": vague_found,
            "fix": QUALITY_CHECKS[0]["fix"],
        })

    # Citation check (for factual/long outputs)
    if len(output) > 300 and "http" not in output.lower():
        factual_markers = [
            "according to", "research shows", "studies", "data from",
            "reported", "announced", "released", "published",
        ]
        if any(m in output.lower() for m in factual_markers):
            issues.append({
                "check": "citation",
                "found": "Factual claims without source links",
                "fix": QUALITY_CHECKS[1]["fix"],
            })

    # Length check
    user_words = len(user_message.split())
    output_words = len(output.split())
    if user_words < 10 and output_words > 300:
        issues.append({
            "check": "length",
            "found": f"User asked a short question ({user_words} words) but output is {output_words} words",
            "fix": QUALITY_CHECKS[2]["fix"],
        })

    # Actionability check
    if output_words > 100 and not any(
        marker in output[-200:].lower()
        for marker in ["want me to", "shall i", "would you like", "next step", "recommend"]
    ):
        issues.append({
            "check": "actionability",
            "found": "Output does not end with a next step or offer to go deeper",
            "fix": QUALITY_CHECKS[3]["fix"],
        })

    return {
        "passed": len(issues) == 0,
        "issues": issues,
        "fixed_output": output,  # Same output; agent decides whether to regenerate
    }
