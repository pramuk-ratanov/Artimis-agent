"""
Artimis Agent — Task Runner
Multi-phase autonomous task execution engine.

Tasks flow through phases:
    triage → research → execution → review → complete

Each phase saves partial results to the database so the user can:
- Close the workspace and come back later
- Jump between parallel workstreams
- Resume from the last checkpoint after interruption
"""

import json
import logging
import threading
from typing import Optional
from datetime import datetime, timezone

from artimis.db.manager import (
    create_task, get_task, update_task, list_tasks, get_stale_tasks
)
from artimis.engine.agent import run_agent

logger = logging.getLogger("artimis.task_runner")

# In-memory registry of running background tasks
_running_tasks: dict[str, dict] = {}


# ─── Task Triage ───────────────────────────────────────────

RESEARCH_TRIGGERS = [
    "research", "analyze", "competitor", "market", "strategy",
    "campaign", "report", "deep dive", "compare", "find",
    "what is", "how to", "generate", "create a realistic",
    "image", "prompt", "latest", "current", "price of",
    "investigate", "study", "audit", "review", "assess",
    "benchmark", "landscape", "trends", "forecast",
]


def needs_research(task_description: str) -> bool:
    """Quick triage: does this task need background research?"""
    desc_lower = task_description.lower()

    # Long descriptions usually need research
    if len(desc_lower.split()) > 20:
        return True

    # Check for research trigger words
    for trigger in RESEARCH_TRIGGERS:
        if trigger in desc_lower:
            return True

    return False


# ─── Task Execution Engine ─────────────────────────────────

def execute_task(task_id: str, user_message: str, session_id: Optional[str] = None):
    """
    Execute a task through all phases. Runs synchronously — meant to be called
    from a background thread for autonomous tasks.
    """
    task = get_task(task_id)
    if not task:
        logger.error(f"Task {task_id} not found")
        return

    # Mark as in progress
    update_task(task_id, status="in_progress", phase="triage")

    # Phase 1: Triage
    _run_phase(task_id, "triage", user_message, session_id, (
        "Assess this task and determine the approach. "
        "If it needs research, outline what to research. "
        "If it can be done immediately, describe the steps. "
        "Be concise. Output format:\n"
        "NEEDS_RESEARCH: yes/no\n"
        "APPROACH: 2-3 sentence plan"
    ))

    task = get_task(task_id)
    phase_data = json.loads(task.get("phase_data") or "{}")
    triage_result = phase_data.get("triage", "")

    # Check if task was cancelled during triage
    if task["status"] == "cancelled":
        return

    # Phase 2: Research (if needed)
    if needs_research(user_message) or "NEEDS_RESEARCH: yes" in triage_result:
        update_task(task_id, phase="research")
        _run_phase(task_id, "research", user_message, session_id, (
            "Research this thoroughly. Search the web for current information. "
            "Gather facts, data, competitor information, and relevant context. "
            "Output a structured research summary with sources."
        ))

    task = get_task(task_id)
    if task["status"] == "cancelled":
        return

    # Phase 3: Execution
    update_task(task_id, phase="execution")
    _run_phase(task_id, "execution", user_message, session_id, (
        "Execute the task now. Use all available information from the research phase. "
        "Produce the final deliverable. Be thorough and complete."
    ))

    task = get_task(task_id)
    if task["status"] == "cancelled":
        return

    # Phase 4: Review
    update_task(task_id, phase="review")
    _run_phase(task_id, "review", user_message, session_id, (
        "Review your own output critically. Check for:\n"
        "- Factual errors\n"
        "- Missing information\n"
        "- Weak reasoning\n"
        "- Format issues\n"
        "If you find problems, fix them. Output the refined final version."
    ))

    # Mark complete
    update_task(task_id, status="completed", phase="complete")

    # Remove from running registry
    _running_tasks.pop(task_id, None)


def _run_phase(task_id: str, phase: str, user_message: str,
               session_id: Optional[str], phase_instruction: str):
    """Run a single phase of task execution."""
    task = get_task(task_id)
    if not task or task["status"] == "cancelled":
        return

    # Build messages with previous phase context
    phase_data = json.loads(task.get("phase_data") or "{}")
    previous_output = ""
    phases_order = ["triage", "research", "execution", "review"]
    for p in phases_order:
        if p in phase_data and p != phase:
            previous_output += f"\n[Phase {p} output]\n{phase_data[p]}\n"

    prompt = f"{phase_instruction}\n\n"
    if previous_output:
        prompt += f"PREVIOUS PHASE OUTPUT:\n{previous_output}\n\n"
    prompt += f"ORIGINAL TASK: {user_message}"

    try:
        result = run_agent(
            user_message=prompt,
            session_id=session_id,
            max_iterations=8,
        )

        # Save phase result
        phase_data[phase] = result["response"]
        update_task(task_id, phase_data=phase_data)
        update_task(task_id, phase=phase)

    except Exception as e:
        logger.error(f"Phase {phase} failed for task {task_id}: {e}")
        phase_data[phase] = f"[Error: {str(e)}]"
        update_task(task_id, phase_data=phase_data)
        update_task(task_id, status="paused")


# ─── Background Execution ──────────────────────────────────

def run_task_background(task_id: str, user_message: str,
                        session_id: Optional[str] = None):
    """Run a task in a background thread. Non-blocking."""
    _running_tasks[task_id] = {
        "started_at": datetime.now(timezone.utc).isoformat(),
        "status": "running",
    }

    thread = threading.Thread(
        target=_background_wrapper,
        args=(task_id, user_message, session_id),
        daemon=True,
    )
    thread.start()


def _background_wrapper(task_id: str, user_message: str,
                        session_id: Optional[str]):
    """Wrapper that catches all exceptions in background threads."""
    try:
        execute_task(task_id, user_message, session_id)
    except Exception as e:
        logger.error(f"Background task {task_id} failed: {e}")
        update_task(task_id, status="cancelled")
        _running_tasks.pop(task_id, None)


# ─── Task Submission ───────────────────────────────────────

def submit_task(title: str, description: str = "",
                session_id: Optional[str] = None,
                priority: str = "medium",
                run_immediately: bool = False) -> dict:
    """
    Submit a new task. If run_immediately, starts background execution.
    Otherwise just creates the task record for later execution.
    """
    research_gated = needs_research(description or title)

    task = create_task(
        title=title,
        description=description,
        session_id=session_id,
        priority=priority,
        research_gated=research_gated,
    )

    if run_immediately:
        user_message = description or title
        run_task_background(task["id"], user_message, session_id)

    return task


# ─── Silence Detection ─────────────────────────────────────

def detect_silent_tasks(stale_hours: int = 48) -> list[dict]:
    """
    Find tasks that have been in progress with no activity.
    These are abandoned tasks that the agent should surface to the user.
    """
    return get_stale_tasks(stale_hours=stale_hours)


def get_silence_report() -> str:
    """
    Generate a report of abandoned tasks to surface to the user.
    """
    stale = detect_silent_tasks()
    if not stale:
        return ""

    lines = ["\n## ABANDONED TASKS"]
    for task in stale:
        title = task["title"]
        phase = task["phase"]
        last = task.get("last_activity", "unknown")
        lines.append(f"- [{phase}] {title} (last activity: {last})")
    lines.append("\nYou can resume any of these tasks or discard them.")

    return "\n".join(lines)


# ─── Task Status ───────────────────────────────────────────

def get_running_tasks() -> list[dict]:
    """Get all currently running background tasks."""
    return [
        {"task_id": tid, **info}
        for tid, info in _running_tasks.items()
    ]


def cancel_task(task_id: str) -> bool:
    """Cancel a running or pending task."""
    task = get_task(task_id)
    if not task:
        return False

    update_task(task_id, status="cancelled")
    _running_tasks.pop(task_id, None)
    return True
