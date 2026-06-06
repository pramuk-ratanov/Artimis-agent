"""
Artimis Agent — Notification System

Lightweight polling-based notification engine.
- Monitors background tasks for completion, stalling, and silence
- Supports webhook callbacks for external integrations
- Feeds the Web UI via SSE-friendly polling endpoints
- Zero external dependencies

Architecture:
    NotificationManager (polling loop)
    ├── check_task_completions()  → "Task X completed"
    ├── check_stale_tasks()       → "Task X has stalled"
    ├── check_silence()           → "No activity on Task X"
    └── dispatch()                → DB + webhook + SSE event
"""

import json
import logging
import threading
import time
from typing import Optional, Callable
from datetime import datetime, timezone

logger = logging.getLogger("artimis.notifications")

# Registry of callbacks (webhooks, SSE push functions, etc.)
_callbacks: list[Callable] = []
_poller: Optional[threading.Thread] = None
_running = False


def register_callback(fn: Callable[[dict], None]):
    """Register a function to receive notification events."""
    _callbacks.append(fn)


def unregister_callback(fn: Callable[[dict], None]):
    """Remove a notification callback."""
    if fn in _callbacks:
        _callbacks.remove(fn)


def dispatch(notification: dict):
    """Send a notification to all registered callbacks."""
    for fn in _callbacks:
        try:
            fn(notification)
        except Exception:
            pass  # Best-effort delivery


# ═══════════════════════════════════════════════════════════════
# Notification Checks
# ═══════════════════════════════════════════════════════════════

def check_task_completions() -> list[dict]:
    """Find tasks that just completed and generate notifications."""
    from artimis.db.schema import get_db

    conn = get_db()
    rows = conn.execute(
        """SELECT id, title, status, phase, completed_at, last_activity
           FROM tasks
           WHERE status = 'completed'
           AND completed_at > datetime('now', '-5 minutes')
           ORDER BY completed_at DESC"""
    ).fetchall()
    conn.close()

    notifications = []
    for row in rows:
        notifications.append({
            "type": "task_completed",
            "task_id": row["id"],
            "title": row["title"],
            "message": f"Task completed: {row['title']}",
            "timestamp": row["completed_at"] or row["last_activity"],
        })

    return notifications


def check_stale_tasks() -> list[dict]:
    """Find tasks that have stalled (no updates in >10 minutes while running)."""
    from artimis.db.schema import get_db

    conn = get_db()
    rows = conn.execute(
        """SELECT id, title, status, phase, last_activity
           FROM tasks
           WHERE status = 'running'
           AND last_activity < datetime('now', '-10 minutes')
           ORDER BY last_activity ASC"""
    ).fetchall()
    conn.close()

    notifications = []
    for row in rows:
        notifications.append({
            "type": "task_stalled",
            "task_id": row["id"],
            "title": row["title"],
            "phase": row["phase"],
            "message": f"Task stalled: {row['title']} (phase: {row['phase']})",
            "timestamp": datetime.now(timezone.utc).isoformat(),
        })

    return notifications


def check_silence(threshold_minutes: int = 15) -> list[dict]:
    """Find running tasks where the user hasn't interacted in a while."""
    from artimis.db.schema import get_db

    conn = get_db()
    rows = conn.execute(
        """SELECT id, title, status, phase, last_activity
           FROM tasks
           WHERE status = 'running'
           AND last_activity < datetime('now', ?)
           ORDER BY last_activity ASC""",
        (f'-{threshold_minutes} minutes',)
    ).fetchall()
    conn.close()

    notifications = []
    for row in rows:
        notifications.append({
            "type": "silence_warning",
            "task_id": row["id"],
            "title": row["title"],
            "message": f"No activity on task: {row['title']} (silent for {threshold_minutes}+ min)",
            "timestamp": datetime.now(timezone.utc).isoformat(),
        })

    return notifications


# ═══════════════════════════════════════════════════════════════
# Polling Loop
# ═══════════════════════════════════════════════════════════════

def _poll_loop(interval_seconds: int = 30):
    """Internal polling loop. Runs in a daemon thread."""
    global _running
    while _running:
        try:
            notifications = []

            # Check for completed tasks
            completed = check_task_completions()
            notifications.extend(completed)

            # Check for stalled tasks
            stalled = check_stale_tasks()
            notifications.extend(stalled)

            # Check for silence (every other cycle, less urgent)
            if int(time.time()) % (interval_seconds * 2) < interval_seconds:
                silent = check_silence(threshold_minutes=15)
                notifications.extend(silent)

            # Dispatch all
            for n in notifications:
                dispatch(n)

        except Exception as e:
            logger.warning(f"Notification poll error: {e}")

        time.sleep(interval_seconds)


def start_polling(interval_seconds: int = 30):
    """Start the background notification poller."""
    global _poller, _running
    if _poller and _poller.is_alive():
        return  # Already running

    _running = True
    _poller = threading.Thread(
        target=_poll_loop,
        args=(interval_seconds,),
        daemon=True,
        name="artimis-notifier",
    )
    _poller.start()
    logger.info(f"Notification poller started (interval: {interval_seconds}s)")


def stop_polling():
    """Stop the background notification poller."""
    global _running
    _running = False
    logger.info("Notification poller stopping")


# ═══════════════════════════════════════════════════════════════
# Webhook Support
# ═══════════════════════════════════════════════════════════════

_webhook_urls: list[str] = []


def add_webhook(url: str):
    """Register a webhook URL for notifications."""
    if url not in _webhook_urls:
        _webhook_urls.append(url)


def remove_webhook(url: str):
    """Remove a webhook URL."""
    if url in _webhook_urls:
        _webhook_urls.remove(url)


def _webhook_callback(notification: dict):
    """Dispatch notification to all registered webhooks."""
    import urllib.request

    for url in _webhook_urls:
        try:
            data = json.dumps(notification).encode("utf-8")
            req = urllib.request.Request(
                url,
                data=data,
                headers={"Content-Type": "application/json"},
                method="POST",
            )
            urllib.request.urlopen(req, timeout=5)
        except Exception:
            pass  # Best-effort, don't let one webhook block others


# Register the webhook dispatcher on import
register_callback(_webhook_callback)
