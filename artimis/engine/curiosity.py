"""
Artimis Curiosity Engine — Cross-Session Pattern Detection

Scans accumulated experience (memories, sessions, tasks, skills) to surface
patterns that the user hasn't noticed. This is the "self-prompting" layer —
the agent doesn't wait for the user, it proactively flags insights.

What it checks:
1. Recurring memory themes — same tags across many memories
2. Abandoned tasks — stale tasks that should be surfaced
3. Underused skills — skills the agent has but hasn't applied recently
4. Session patterns — topic clusters across recent conversations
5. Learning accumulation — critique patterns that keep recurring
"""

import json
import logging
from typing import Optional

logger = logging.getLogger("artimis.curiosity")


def check_patterns(session_id: Optional[str] = None, current_message: str = "") -> Optional[str]:
    """
    Lightweight check that runs after every agent response.
    Returns a curiosity note to append to the response, or None if nothing to surface.
    
    Designed to be fast — no LLM calls, only DB queries.
    """
    notes = []
    
    try:
        # 1. Check for abandoned tasks
        task_note = _check_abandoned_tasks()
        if task_note:
            notes.append(task_note)
        
        # 2. Check for recurring critique patterns (3+ pinned memories of same type)
        pattern_note = _check_learning_patterns()
        if pattern_note:
            notes.append(pattern_note)
        
        # 3. Check for underused skills
        skill_note = _check_underused_skills()
        if skill_note:
            notes.append(skill_note)
        
    except Exception as e:
        logger.warning(f"Curiosity check failed: {e}")
        return None
    
    if not notes:
        return None
    
    # Format as an unobtrusive note
    return "\n\n---\n*While I have you — " + " ".join(notes) + "*"


def _check_abandoned_tasks() -> Optional[str]:
    """Check for tasks that have been sitting idle."""
    try:
        from artimis.db.manager import get_stale_tasks
        stale = get_stale_tasks(stale_hours=24)
        if stale:
            count = len(stale)
            titles = [t["title"] for t in stale[:3]]
            title_list = ", ".join(f'"{t}"' for t in titles)
            return (
                f"I noticed {count} task{'s' if count > 1 else ''} waiting for attention "
                f"({title_list}). Want me to pick one up?"
            )
    except Exception:
        pass
    return None


def _check_learning_patterns() -> Optional[str]:
    """Check if critique has identified recurring issues that need attention."""
    try:
        from artimis.db.manager import list_memories
        # Find pinned memories tagged as "learning" — these are recurring issues
        learning_mems = list_memories(tag="learning")
        pinned = [m for m in learning_mems if m.get("pinned")]
        
        if len(pinned) >= 2:
            # Extract issue types
            issue_types = set()
            for mem in pinned[:5]:
                content = mem.get("content", "") or ""
                # Extract type from content like "Critique finding [vagueness]: ..."
                if "Critique finding [" in content:
                    start = content.index("[") + 1
                    end = content.index("]", start)
                    issue_types.add(content[start:end])
            
            if issue_types:
                types_str = ", ".join(sorted(issue_types))
                return (
                    f"I've been tracking recurring issues I should improve: {types_str}. "
                    f"I'll keep working on these."
                )
    except Exception:
        pass
    return None


def _check_underused_skills() -> Optional[str]:
    """Check for skills with high use-count that haven't been applied recently."""
    try:
        from artimis.db.manager import list_skills_db
        skills = list_skills_db()
        if not skills:
            return None
        
        # Find skills with use_count > 5 that might be relevant
        high_use = [s for s in skills if s.get("use_count", 0) > 5]
        if high_use:
            skill_names = [s["name"] for s in high_use[:2]]
            return (
                f"I have skills for {', '.join(skill_names)} that might help here. "
                f"Want me to apply them?"
            )
    except Exception:
        pass
    return None


def deep_curiosity_scan() -> list[dict]:
    """
    Full deep scan for patterns across all accumulated data.
    Called periodically (e.g., on session start, or when explicitly requested).
    Returns a list of pattern insights with suggested actions.
    
    This is more expensive — it does full scans and can trigger LLM analysis.
    """
    insights = []
    
    try:
        from artimis.db.manager import list_memories, list_sessions
        
        # Analyze memory tag clusters
        memories = list_memories()
        tag_counts = {}
        for m in memories:
            tags_str = m.get("tags", "[]")
            try:
                tags = json.loads(tags_str) if isinstance(tags_str, str) else tags_str
            except (json.JSONDecodeError, TypeError):
                tags = []
            for tag in tags:
                if tag not in ("auto", "learning", "critique", "identity", "fact"):
                    tag_counts[tag] = tag_counts.get(tag, 0) + 1
        
        # Find dominant themes (tags that appear 5+ times)
        dominant_tags = [(tag, count) for tag, count in tag_counts.items() if count >= 5]
        dominant_tags.sort(key=lambda x: -x[1])
        
        if dominant_tags:
            top_themes = dominant_tags[:3]
            theme_str = ", ".join(f"{t[0]} ({t[1]}x)" for t in top_themes)
            insights.append({
                "type": "theme_cluster",
                "title": "Dominant themes in your work",
                "description": f"Your most frequent topics: {theme_str}",
                "suggested_action": f"Would you like me to create a dedicated project or skill for {top_themes[0][0]}?",
            })
        
        # Analyze session recency and gaps
        sessions = list_sessions()
        active_sessions = [s for s in sessions if s.get("status") == "active"]
        recent_count = sum(1 for s in active_sessions if s.get("updated_at", "") > "")
        
        if recent_count > 10:
            insights.append({
                "type": "session_volume",
                "title": "High session volume",
                "description": f"You have {recent_count} active sessions. Some might be ready to archive.",
                "suggested_action": "Want me to review and suggest sessions to archive?",
            })
        
    except Exception as e:
        logger.warning(f"Deep curiosity scan failed: {e}")
    
    return insights


def get_session_start_context(session_id: Optional[str] = None) -> str:
    """
    Called at session start to inject curiosity-driven context into the system prompt.
    Surfaces patterns the user should know about before they even ask.
    """
    insights = deep_curiosity_scan()
    if not insights:
        return ""
    
    lines = ["\n## Context from your previous work"]
    for insight in insights[:3]:
        lines.append(f"- {insight['description']}")
        if insight.get("suggested_action"):
            lines.append(f"  → {insight['suggested_action']}")
    
    return "\n".join(lines)
