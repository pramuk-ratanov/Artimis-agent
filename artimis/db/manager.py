"""Artimis Agent — Database Manager. CRUD operations for all tables."""

import json
from typing import Optional
from artimis.db.schema import get_db, generate_id, now


# ─── Sessions ─────────────────────────────────────────────

def create_session(mode: str = "agent", model: Optional[str] = None) -> dict:
    conn = get_db()
    sid = generate_id()
    conn.execute(
        "INSERT INTO sessions (id, mode, model) VALUES (?, ?, ?)",
        (sid, mode, model)
    )
    conn.commit()
    conn.close()
    return get_session(sid)


def get_session(session_id: str) -> Optional[dict]:
    conn = get_db()
    row = conn.execute("SELECT * FROM sessions WHERE id = ?", (session_id,)).fetchone()
    conn.close()
    return dict(row) if row else None


def list_sessions(status: Optional[str] = None) -> list[dict]:
    conn = get_db()
    if status:
        rows = conn.execute(
            "SELECT * FROM sessions WHERE status = ? ORDER BY updated_at DESC", (status,)
        ).fetchall()
    else:
        rows = conn.execute("SELECT * FROM sessions ORDER BY updated_at DESC").fetchall()
    conn.close()
    return [dict(r) for r in rows]


def rename_session(session_id: str, name: str) -> Optional[dict]:
    conn = get_db()
    conn.execute(
        "UPDATE sessions SET name = ?, updated_at = ? WHERE id = ?",
        (name, now(), session_id)
    )
    conn.commit()
    conn.close()
    return get_session(session_id)


def delete_session(session_id: str):
    conn = get_db()
    conn.execute("DELETE FROM sessions WHERE id = ?", (session_id,))
    conn.commit()
    conn.close()


# ─── Messages ──────────────────────────────────────────────

def add_message(session_id: str, role: str, content: Optional[str] = None,
                tool_calls: Optional[list] = None, tool_call_id: Optional[str] = None) -> dict:
    conn = get_db()
    tc_json = json.dumps(tool_calls) if tool_calls else None
    conn.execute(
        "INSERT INTO messages (session_id, role, content, tool_calls, tool_call_id) VALUES (?, ?, ?, ?, ?)",
        (session_id, role, content, tc_json, tool_call_id)
    )
    conn.execute("UPDATE sessions SET updated_at = ? WHERE id = ?", (now(), session_id))
    conn.commit()
    msg_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.close()
    return {"id": msg_id, "session_id": session_id, "role": role, "content": content}


def get_messages(session_id: str, limit: int = 100, offset: int = 0) -> list[dict]:
    conn = get_db()
    rows = conn.execute(
        "SELECT * FROM messages WHERE session_id = ? ORDER BY id LIMIT ? OFFSET ?",
        (session_id, limit, offset)
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


# ─── Memories ──────────────────────────────────────────────

def create_memory(content: str, tags: Optional[list] = None, source: str = "auto") -> dict:
    conn = get_db()
    mid = generate_id()
    tags_json = json.dumps(tags or [])
    conn.execute(
        "INSERT INTO memories (id, content, tags, source) VALUES (?, ?, ?, ?)",
        (mid, content, tags_json, source)
    )
    conn.commit()
    conn.close()
    return get_memory(mid)


def get_memory(memory_id: str) -> Optional[dict]:
    conn = get_db()
    row = conn.execute("SELECT * FROM memories WHERE id = ?", (memory_id,)).fetchone()
    conn.close()
    return dict(row) if row else None


def list_memories(pinned: Optional[bool] = None, active: Optional[bool] = None,
                  tag: Optional[str] = None, search: Optional[str] = None) -> list[dict]:
    conn = get_db()
    query = "SELECT * FROM memories WHERE 1=1"
    params = []
    if pinned is not None:
        query += " AND pinned = ?"
        params.append(1 if pinned else 0)
    if active is not None:
        query += " AND active = ?"
        params.append(1 if active else 0)
    if tag:
        query += " AND tags LIKE ?"
        params.append(f'%{tag}%')
    if search:
        query += " AND content LIKE ?"
        params.append(f'%{search}%')
    query += " ORDER BY pinned DESC, updated_at DESC"
    rows = conn.execute(query, params).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def update_memory(memory_id: str, content: Optional[str] = None, tags: Optional[list] = None,
                  pinned: Optional[bool] = None, active: Optional[bool] = None) -> Optional[dict]:
    conn = get_db()
    if content:
        conn.execute("UPDATE memories SET content = ?, updated_at = ? WHERE id = ?",
                     (content, now(), memory_id))
    if tags is not None:
        conn.execute("UPDATE memories SET tags = ?, updated_at = ? WHERE id = ?",
                     (json.dumps(tags), now(), memory_id))
    if pinned is not None:
        conn.execute("UPDATE memories SET pinned = ?, updated_at = ? WHERE id = ?",
                     (1 if pinned else 0, now(), memory_id))
    if active is not None:
        conn.execute("UPDATE memories SET active = ?, updated_at = ? WHERE id = ?",
                     (1 if active else 0, now(), memory_id))
    conn.commit()
    conn.close()
    return get_memory(memory_id)


def delete_memory(memory_id: str):
    conn = get_db()
    conn.execute("DELETE FROM memories WHERE id = ?", (memory_id,))
    conn.commit()
    conn.close()


def increment_memory_use(memory_id: str):
    conn = get_db()
    conn.execute(
        "UPDATE memories SET use_count = use_count + 1, updated_at = ? WHERE id = ?",
        (now(), memory_id)
    )
    conn.commit()
    conn.close()


# ─── Tasks ─────────────────────────────────────────────────

def create_task(title: str, description: Optional[str] = None, session_id: Optional[str] = None,
                priority: str = "medium", research_gated: bool = False) -> dict:
    conn = get_db()
    tid = generate_id()
    conn.execute(
        """INSERT INTO tasks (id, session_id, title, description, priority, research_gated, last_activity)
           VALUES (?, ?, ?, ?, ?, ?, ?)""",
        (tid, session_id, title, description, priority, 1 if research_gated else 0, now())
    )
    conn.commit()
    conn.close()
    return get_task(tid)


def get_task(task_id: str) -> Optional[dict]:
    conn = get_db()
    row = conn.execute("SELECT * FROM tasks WHERE id = ?", (task_id,)).fetchone()
    conn.close()
    return dict(row) if row else None


def list_tasks(status: Optional[str] = None, stale_hours: Optional[int] = None) -> list[dict]:
    conn = get_db()
    query = "SELECT * FROM tasks WHERE 1=1"
    params = []
    if status:
        query += " AND status = ?"
        params.append(status)
    if stale_hours:
        query += " AND status = 'in_progress' AND last_activity < datetime('now', ? || ' hours')"
        params.append(str(-stale_hours))
    query += " ORDER BY CASE priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END, created_at DESC"
    rows = conn.execute(query, params).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def update_task(task_id: str, status: Optional[str] = None, phase: Optional[str] = None,
                phase_data: Optional[dict] = None, retry_count: Optional[int] = None) -> Optional[dict]:
    conn = get_db()
    if status:
        completed = now() if status == "completed" else None
        conn.execute(
            "UPDATE tasks SET status = ?, last_activity = ?, completed_at = ? WHERE id = ?",
            (status, now(), completed, task_id)
        )
    if phase:
        conn.execute("UPDATE tasks SET phase = ?, last_activity = ? WHERE id = ?",
                     (phase, now(), task_id))
    if phase_data is not None:
        conn.execute("UPDATE tasks SET phase_data = ?, last_activity = ? WHERE id = ?",
                     (json.dumps(phase_data), now(), task_id))
    if retry_count is not None:
        conn.execute("UPDATE tasks SET retry_count = ?, last_activity = ? WHERE id = ?",
                     (retry_count, now(), task_id))
    conn.commit()
    conn.close()
    return get_task(task_id)


def get_stale_tasks(stale_hours: int = 48) -> list[dict]:
    """Tasks in progress with no activity for N hours — silence detection."""
    return list_tasks(status="in_progress", stale_hours=stale_hours)


# ─── Notes ─────────────────────────────────────────────────

def create_note(title: str, content: str = "", session_id: Optional[str] = None) -> dict:
    conn = get_db()
    nid = generate_id()
    conn.execute(
        "INSERT INTO notes (id, session_id, title, content) VALUES (?, ?, ?, ?)",
        (nid, session_id, title, content)
    )
    conn.commit()
    conn.close()
    return get_note(nid)


def get_note(note_id: str) -> Optional[dict]:
    conn = get_db()
    row = conn.execute("SELECT * FROM notes WHERE id = ?", (note_id,)).fetchone()
    conn.close()
    return dict(row) if row else None


def list_notes(session_id: Optional[str] = None) -> list[dict]:
    conn = get_db()
    if session_id:
        rows = conn.execute(
            "SELECT * FROM notes WHERE session_id = ? ORDER BY updated_at DESC", (session_id,)
        ).fetchall()
    else:
        rows = conn.execute("SELECT * FROM notes ORDER BY updated_at DESC").fetchall()
    conn.close()
    return [dict(r) for r in rows]


def update_note(note_id: str, title: Optional[str] = None, content: Optional[str] = None) -> Optional[dict]:
    conn = get_db()
    if title:
        conn.execute("UPDATE notes SET title = ?, updated_at = ? WHERE id = ?", (title, now(), note_id))
    if content is not None:
        conn.execute(
            "UPDATE notes SET content = ?, version_count = version_count + 1, updated_at = ? WHERE id = ?",
            (content, now(), note_id)
        )
    conn.commit()
    conn.close()
    return get_note(note_id)


def delete_note(note_id: str):
    conn = get_db()
    conn.execute("DELETE FROM notes WHERE id = ?", (note_id,))
    conn.commit()
    conn.close()


# ─── Gallery ───────────────────────────────────────────────

def add_gallery_image(session_id: Optional[str], prompt: str, file_path: str,
                      thumbnail_path: Optional[str] = None, width: Optional[int] = None,
                      height: Optional[int] = None, model: Optional[str] = None,
                      quality_pass: bool = False) -> dict:
    conn = get_db()
    gid = generate_id()
    conn.execute(
        """INSERT INTO gallery (id, session_id, prompt, file_path, thumbnail_path, width, height, model, quality_pass)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (gid, session_id, prompt, file_path, thumbnail_path, width, height, model, 1 if quality_pass else 0)
    )
    conn.commit()
    conn.close()
    return get_gallery_image(gid)


def get_gallery_image(image_id: str) -> Optional[dict]:
    conn = get_db()
    row = conn.execute("SELECT * FROM gallery WHERE id = ?", (image_id,)).fetchone()
    conn.close()
    return dict(row) if row else None


def list_gallery(limit: int = 50, offset: int = 0) -> list[dict]:
    conn = get_db()
    rows = conn.execute(
        "SELECT * FROM gallery ORDER BY created_at DESC LIMIT ? OFFSET ?", (limit, offset)
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def delete_gallery_image(image_id: str):
    conn = get_db()
    conn.execute("DELETE FROM gallery WHERE id = ?", (image_id,))
    conn.commit()
    conn.close()


# ─── Cookbook Templates ────────────────────────────────────

def create_template(name: str, prompt: str, description: Optional[str] = None,
                    variables: Optional[list] = None, tags: Optional[list] = None) -> dict:
    conn = get_db()
    tid = generate_id()
    conn.execute(
        "INSERT INTO cookbook_templates (id, name, description, prompt, variables, tags) VALUES (?, ?, ?, ?, ?, ?)",
        (tid, name, description, prompt, json.dumps(variables or []), json.dumps(tags or []))
    )
    conn.commit()
    conn.close()
    return get_template(tid)


def get_template(template_id: str) -> Optional[dict]:
    conn = get_db()
    row = conn.execute("SELECT * FROM cookbook_templates WHERE id = ?", (template_id,)).fetchone()
    conn.close()
    return dict(row) if row else None


def list_templates(tag: Optional[str] = None, search: Optional[str] = None) -> list[dict]:
    conn = get_db()
    query = "SELECT * FROM cookbook_templates WHERE 1=1"
    params = []
    if tag:
        query += " AND tags LIKE ?"
        params.append(f'%{tag}%')
    if search:
        query += " AND (name LIKE ? OR description LIKE ?)"
        params.extend([f'%{search}%', f'%{search}%'])
    query += " ORDER BY use_count DESC, updated_at DESC"
    rows = conn.execute(query, params).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def increment_template_use(template_id: str):
    conn = get_db()
    conn.execute(
        "UPDATE cookbook_templates SET use_count = use_count + 1, updated_at = ? WHERE id = ?",
        (now(), template_id)
    )
    conn.commit()
    conn.close()
