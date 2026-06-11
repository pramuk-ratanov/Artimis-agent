"""
Artimis Agent — Brain (Memory & Skills Manager)

The Brain is the persistent knowledge layer. It manages:
- Memories: facts, preferences, project context. Tagged, pinned, active-tracking.
- Skills: procedural knowledge. Auto-updating, versioned, pinnable.

"Red highlight" = active flag. When a memory is currently in the system prompt,
it gets marked active=1. The UI renders active memories with a red left border.
"""

import json
import os
import re
from typing import Optional
from datetime import datetime, timezone

from artimis.db.manager import (
    list_memories, create_memory, update_memory, get_memory,
    increment_memory_use, delete_memory,
)
from artimis.db.schema import get_db, generate_id, now


# ─── Memory Relevance Engine ───────────────────────────────

def score_memory_relevance(memory: dict, query: str, query_emb: Optional[list[float]] = None) -> float:
    """Score how relevant a memory is to the current query. 0.0 to 1.0."""
    content = memory.get("content", "").lower()
    query_lower = query.lower()

    score = 0.0

    # Semantic similarity (fastembed)
    if query_emb:
        try:
            emb_str = memory.get("embedding")
            if emb_str:
                import json
                from artimis.engine.embeddings import cosine_similarity
                mem_emb = json.loads(emb_str)
                sim = cosine_similarity(query_emb, mem_emb)
                # Boost score heavily for semantic similarity (>0.5 threshold)
                if sim > 0.5:
                    score += sim * 0.8
        except Exception:
            pass

    # Exact phrase match fallback
    if query_lower in content:
        score += 0.3

    # Word overlap
    query_words = set(query_lower.split())
    content_words = set(content.split())
    overlap = query_words & content_words
    if overlap:
        score += 0.2 * (len(overlap) / max(len(query_words), 1))

    # Pinned bonus
    if memory.get("pinned"):
        score += 0.2

    # Use count bonus
    use_count = memory.get("use_count", 0)
    if use_count > 0:
        score += min(0.1, use_count * 0.01)

    # Recency bonus (within last 7 days)
    updated = memory.get("updated_at", "")
    if updated:
        try:
            dt = datetime.fromisoformat(updated)
            days_ago = (datetime.now(timezone.utc) - dt).days
            if days_ago < 7:
                score += 0.1 * (1 - days_ago / 7)
        except (ValueError, TypeError):
            pass

    return min(score, 1.0)


def get_relevant_memories(query: str, max_results: int = 15) -> list[dict]:
    """
    Get memories relevant to the current query.
    Always includes pinned memories. Adds relevance-scored others up to max_results.
    """
    pinned = list_memories(pinned=True)
    all_memories = list_memories()

    # Always include pinned
    included = {m["id"]: m for m in pinned}

    # Identity triggers: if user asks about themselves, pull all identity/fact/project memories
    identity_triggers = [
        "who am i", "what do you know", "about me", "what i do",
        "remember me", "my name", "my company", "my business",
        "what do i", "tell me about myself", "what you know about"
    ]
    is_identity_query = any(t in query.lower() for t in identity_triggers)

    # Score remaining memories
    scored = []
    for m in all_memories:
        if m["id"] in included:
            continue

        if is_identity_query:
            tags = json.loads(m.get("tags", "[]"))
            if any(t in tags for t in ("identity", "fact", "preference", "project")):
                scored.append((0.9, m))
                continue

        rel = score_memory_relevance(m, query)
        # Lower threshold for shorter queries
        threshold = 0.05 if len(query.split()) <= 5 else 0.1
        if rel > threshold:
            scored.append((rel, m))

    scored.sort(key=lambda x: x[0], reverse=True)

    # Add top scored up to max
    for rel, m in scored:
        if len(included) >= max_results:
            break
        included[m["id"]] = m

    # Mark all included as active (= red highlight)
    for mid in included:
        update_memory(mid, active=True)

    return list(included.values())


def format_memories_for_prompt(memories: list[dict]) -> str:
    """Format memories for injection into the system prompt with tier labels."""
    if not memories:
        return ""

    # Split into tiers
    pinned = [m for m in memories if m.get("pinned")]
    identity = [m for m in memories if not m.get("pinned") and _has_tag(m, "identity")]
    other = [m for m in memories if not m.get("pinned") and not _has_tag(m, "identity")]

    lines = ["\n## YOUR MEMORY CONTEXT"]
    lines.append("(These are facts you know about the user and their world. Use them proactively.)\n")

    if pinned:
        lines.append("### [CRITICAL] Pinned — Always remember")
        for m in pinned:
            lines.append(f"- {m['content']}")
        lines.append("")

    if identity:
        lines.append("### [HIGH] Identity & Facts")
        for m in identity[:8]:
            lines.append(f"- {m['content']}")
        lines.append("")

    if other:
        lines.append("### [MEDIUM] Context & Preferences")
        for m in other[:10]:
            tags = json.loads(m.get("tags", "[]")) if isinstance(m.get("tags"), str) else m.get("tags", [])
            tag_str = f" [{', '.join(tags)}]" if tags else ""
            lines.append(f"- {m['content']}{tag_str}")
        lines.append("")

    return "\n".join(lines)


def _has_tag(memory: dict, tag: str) -> bool:
    """Check if a memory has a specific tag."""
    tags = memory.get("tags", "[]")
    if isinstance(tags, str):
        try:
            tags = json.loads(tags)
        except (json.JSONDecodeError, TypeError):
            return False
    return tag in tags


def deactivate_stale_memories(max_active: int = 30):
    """Deactivate memories that are no longer in context. Keeps pinned active."""
    conn = get_db()
    conn.execute(
        """UPDATE memories SET active = 0
           WHERE active = 1 AND pinned = 0
           AND id NOT IN (
               SELECT id FROM memories WHERE active = 1 AND pinned = 0
               ORDER BY updated_at DESC LIMIT ?
           )""",
        (max_active,)
    )
    conn.commit()
    conn.close()


# ─── Auto-Memory Creation ──────────────────────────────────

_SIGNIFICANCE_PATTERNS = [
    (r"(?:my|the user(?:'s)?)\s+name\s+is\s+(\S+(?:\s+\S+){0,3})", "identity"),
    (r"(?:I|we)\s+(?:am|are|work)\s+(?:a|an|as|at|for|in)\s+(.{10,80})", "fact"),
    (r"(?:I|we)\s+(?:prefer|like|want|need|use|don't)\s+(.{10,80})", "preference"),
    (r"(?:my|our)\s+(?:project|company|business|product)\s+(?:is|called|named)\s+(.{5,60})", "project"),
    (r"(?:remember|note|save)(?!\s+to\s+memory\s+that)\s+(?:this|that)?\s*:?\s*(.{10,200})", "fact"),
]


def detect_significant_facts(user_message: str) -> list[dict]:
    """
    Scan user messages for facts worth remembering.
    Returns list of {content, tags} dicts.
    """
    facts = []
    for pattern, tag in _SIGNIFICANCE_PATTERNS:
        matches = re.findall(pattern, user_message, re.IGNORECASE)
        for match in matches:
            content = match.strip().rstrip(".,;:!?")
            if len(content) > 5:
                facts.append({"content": content, "tags": [tag]})
    return facts


def auto_save_memories(user_message: str) -> list[dict]:
    """
    Automatically detect and save significant facts from user messages.
    Returns list of created memories.
    """
    facts = detect_significant_facts(user_message)
    saved = []
    for fact in facts:
        # Check for duplicates
        existing = list_memories(search=fact["content"][:50])
        if not existing:
            mem = create_memory(
                content=fact["content"],
                tags=fact["tags"],
                source="auto"
            )
            saved.append(mem)
    return saved


# ─── Skills Manager ────────────────────────────────────────

SKILLS_DIR = os.path.join(
    os.environ.get("ARTIMIS_HOME", os.path.expanduser("~/.artimis")), "skills"
)


def ensure_skills_dir():
    """Create the skills directory if it doesn't exist."""
    os.makedirs(SKILLS_DIR, exist_ok=True)


def load_skill_from_file(skill_name: str) -> Optional[dict]:
    """Load a skill from its SKILL.md file."""
    skill_path = os.path.join(SKILLS_DIR, skill_name, "SKILL.md")
    if not os.path.exists(skill_path):
        return None

    with open(skill_path) as f:
        content = f.read()

    return {
        "name": skill_name,
        "content": content,
        "file_path": skill_path,
    }


def save_skill_to_file(name: str, content: str, version: int):
    """Save a skill to the filesystem."""
    skill_dir = os.path.join(SKILLS_DIR, name)
    os.makedirs(skill_dir, exist_ok=True)

    # Save current version
    with open(os.path.join(skill_dir, "SKILL.md"), "w") as f:
        f.write(content)

    # Archive previous version
    archive_dir = os.path.join(skill_dir, "archive")
    os.makedirs(archive_dir, exist_ok=True)
    archive_path = os.path.join(archive_dir, f"v{version}.md")
    if not os.path.exists(archive_path):
        with open(archive_path, "w") as f:
            f.write(content)


def create_skill(name: str, content: str, tags: Optional[list] = None,
                 auto_updated: bool = False, skill_type: str = "logic") -> dict:
    """Create a new skill in both database and filesystem."""
    from artimis.db.schema import get_db

    skill_id = generate_id()
    conn = get_db()
    
    file_path = os.path.join(SKILLS_DIR, name, "SKILL.md")
    conn.execute(
        """INSERT INTO skills (id, name, version, content, file_path, tags, type, auto_updated)
           VALUES (?, ?, 1, ?, ?, ?, ?, ?)""",
        (skill_id, name, content, file_path, json.dumps(tags or []), skill_type, 1 if auto_updated else 0)
    )
    conn.commit()
    conn.close()

    save_skill_to_file(name, content, 1)

    return {"id": skill_id, "name": name, "version": 1, "tags": tags or [], "type": skill_type}


def update_skill_content(skill_id: str, new_content: str) -> Optional[dict]:
    """
    Auto-update a skill. Increments version, archives old version.
    Does NOT update if skill is pinned.
    """
    conn = get_db()
    row = conn.execute("SELECT * FROM skills WHERE id = ?", (skill_id,)).fetchone()
    if not row:
        conn.close()
        return None

    skill = dict(row)
    if skill["pinned"]:
        conn.close()
        return None  # Pinned = locked from auto-update

    new_version = skill["version"] + 1

    # Archive old version
    conn.execute(
        "INSERT INTO skill_versions (skill_id, version, content) VALUES (?, ?, ?)",
        (skill_id, skill["version"], skill["content"])
    )

    # Update skill
    conn.execute(
        """UPDATE skills SET content = ?, version = ?, use_count = use_count + 1,
           auto_updated = 1, updated_at = ? WHERE id = ?""",
        (new_content, new_version, now(), skill_id)
    )
    conn.commit()
    conn.close()

    save_skill_to_file(skill["name"], new_content, new_version)
    return {"id": skill_id, "name": skill["name"], "version": new_version,
            "content": new_content, "auto_updated": True}


def get_skill_versions(skill_id: str) -> list[dict]:
    """Get version history for a skill."""
    conn = get_db()
    rows = conn.execute(
        "SELECT * FROM skill_versions WHERE skill_id = ? ORDER BY version DESC",
        (skill_id,)
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def rollback_skill(skill_id: str, target_version: int) -> Optional[dict]:
    """Roll back a skill to a specific version."""
    conn = get_db()
    row = conn.execute(
        "SELECT * FROM skill_versions WHERE skill_id = ? AND version = ?",
        (skill_id, target_version)
    ).fetchone()
    if not row:
        conn.close()
        return None

    old_content = row["content"]
    skill = dict(conn.execute("SELECT * FROM skills WHERE id = ?", (skill_id,)).fetchone())
    new_version = skill["version"] + 1

    # Archive current before rollback
    conn.execute(
        "INSERT INTO skill_versions (skill_id, version, content) VALUES (?, ?, ?)",
        (skill_id, skill["version"], skill["content"])
    )
    conn.execute(
        "UPDATE skills SET content = ?, version = ?, updated_at = ? WHERE id = ?",
        (old_content, new_version, now(), skill_id)
    )
    conn.commit()
    conn.close()

    save_skill_to_file(skill["name"], old_content, new_version)
    return {"id": skill_id, "name": skill["name"], "version": new_version,
            "content": old_content}


def get_relevant_skills(query: str, max_results: int = 5) -> list[dict]:
    """
    Find skills relevant to the current query.
    Uses simple keyword matching on name, content, and tags.
    """
    conn = get_db()
    query_terms = query.lower().split()
    all_skills = conn.execute(
        "SELECT * FROM skills ORDER BY use_count DESC, updated_at DESC"
    ).fetchall()
    conn.close()

    scored = []
    for skill in all_skills:
        skill = dict(skill)
        text = (skill["name"] + " " + skill["content"] + " " + skill.get("tags", "")).lower()
        score = 0
        for term in query_terms:
            if term in text:
                score += 1
        if skill.get("pinned"):
            score += 2
        if score > 0:
            scored.append((score, skill))

    scored.sort(key=lambda x: x[0], reverse=True)
    return [s for _, s in scored[:max_results]]


def format_skills_for_prompt(skills: list[dict]) -> str:
    """Format skills for injection with tier labels and context budget."""
    if not skills:
        return ""

    lines = ["\n## ACTIVE SKILLS"]
    lines.append("(Procedures and workflows you know. Reference these when relevant to the task.)\n")

    for s in skills[:3]:  # Cap at 3 skills to stay within context budget
        pinned_marker = " [PINNED]" if s.get("pinned") else ""
        lines.append(f"### Skill: {s['name']} (v{s['version']}){pinned_marker}")
        content = s['content'][:800]
        if len(s.get('content', '')) > 800:
            content += "\n... (truncated for context budget)"
        lines.append(content)
        lines.append("")

    return "\n".join(lines)


# ─── Context Budget Manager ─────────────────────────────────

MAX_CONTEXT_CHARS = 3000  # Hard cap on brain context injection

def build_brain_context(query: str) -> str:
    """
    Build tiered brain context for injection into the system prompt.
    Includes relevant memories and skills, capped at MAX_CONTEXT_CHARS.
    Always includes pinned memories. Adds scored memories and skills up to budget.
    """
    parts = []
    
    # Tier 0: Correction Ledger (always inject learned rules)
    from artimis.db.schema import get_db
    conn = get_db()
    ledger_row = conn.execute("SELECT content FROM skills WHERE name = 'correction-ledger'").fetchone()
    conn.close()
    if ledger_row:
        parts.append(f"=== LEARNED RULES ===\\n{ledger_row['content']}\\n=====================\\n")

    # Tier 1: Pinned memories (always included, no cap)
    pinned = list_memories(pinned=True)
    if pinned:
        parts.append(format_memories_for_prompt(pinned))

    # Tier 2: Relevant memories (scored, capped by budget)
    all_memories = list_memories()
    non_pinned = [m for m in all_memories if m["id"] not in {p["id"] for p in pinned}]

    from artimis.engine.embeddings import get_embedding
    query_emb = get_embedding(query)

    scored = []
    for m in non_pinned:
        rel = score_memory_relevance(m, query, query_emb)
        if rel > 0.05:
            scored.append((rel, m))

    scored.sort(key=lambda x: x[0], reverse=True)
    relevant_mems = pinned + [m for _, m in scored[:15]]
    mem_text = "\\n".join(parts) + "\\n" + format_memories_for_prompt(relevant_mems)

    # Tier 3: Skills (only if budget allows)
    remaining_budget = MAX_CONTEXT_CHARS - len(mem_text)
    if remaining_budget > 500:
        skills = get_relevant_skills(query, max_results=3)
        # Exclude correction-ledger since we already injected it
        skills = [s for s in skills if s["name"] != "correction-ledger"]
        if skills:
            skill_text = format_skills_for_prompt(skills)
            if len(skill_text) <= remaining_budget:
                mem_text += skill_text

    return mem_text


def process_user_message(session_id: str, user_message: str):
    """
    Called after every user message. Handles:
    - Auto-saving significant facts as memories
    - Building brain context for the next response
    """
    # Auto-save memories
    auto_save_memories(user_message)

    # Build context
    context = build_brain_context(user_message)

    return context
