"""
Artimis Agent — FastAPI Server
The API layer between the web UI and the Artimis engine.
"""

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from typing import Optional
import json
import os

from artimis.db.schema import init_db
from artimis.db import manager as db

app = FastAPI(title="Artimis Agent", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ─── Request Models ────────────────────────────────────────

class CreateSessionRequest(BaseModel):
    mode: str = "agent"
    model: Optional[str] = None


class SendMessageRequest(BaseModel):
    content: str


class AgentRequest(BaseModel):
    message: str
    session_id: Optional[str] = None


class DeepResearchRequest(BaseModel):
    task: str
    session_id: Optional[str] = None
    max_iterations: int = 2


class CreateMemoryRequest(BaseModel):
    content: str
    tags: Optional[list[str]] = None
    source: str = "auto"


class UpdateMemoryRequest(BaseModel):
    content: Optional[str] = None
    tags: Optional[list[str]] = None
    pinned: Optional[bool] = None


class CreateTaskRequest(BaseModel):
    title: str
    description: Optional[str] = None
    session_id: Optional[str] = None
    priority: str = "medium"


class SubmitTaskRequest(BaseModel):
    title: str
    description: str = ""
    session_id: Optional[str] = None
    priority: str = "medium"
    run_immediately: bool = False


class CreateNoteRequest(BaseModel):
    title: str
    content: str = ""
    session_id: Optional[str] = None


class UpdateNoteRequest(BaseModel):
    title: Optional[str] = None
    content: Optional[str] = None


class CreateTemplateRequest(BaseModel):
    name: str
    prompt: str
    description: Optional[str] = None
    variables: Optional[list[str]] = None
    tags: Optional[list[str]] = None


# ─── Startup ──────────────────────────────────────────────

@app.on_event("startup")
async def startup():
    init_db()
    # Start background notification poller
    try:
        from artimis.engine.notifications import start_polling
        start_polling(interval_seconds=30)
    except Exception:
        pass  # Non-critical


# ─── Sessions ─────────────────────────────────────────────

@app.get("/api/sessions")
async def list_sessions():
    return db.list_sessions()


@app.post("/api/sessions")
async def create_session(req: CreateSessionRequest):
    return db.create_session(mode=req.mode, model=req.model)


@app.get("/api/sessions/{session_id}")
async def get_session(session_id: str):
    s = db.get_session(session_id)
    if not s:
        raise HTTPException(404, "Session not found")
    return s


@app.patch("/api/sessions/{session_id}")
async def rename_session(session_id: str, name: str):
    s = db.rename_session(session_id, name)
    if not s:
        raise HTTPException(404, "Session not found")
    return s


@app.delete("/api/sessions/{session_id}")
async def delete_session(session_id: str):
    db.delete_session(session_id)
    return {"deleted": True}


@app.get("/api/sessions/{session_id}/messages")
async def get_session_messages(session_id: str, limit: int = 100, offset: int = 0):
    return db.get_messages(session_id, limit=limit, offset=offset)


@app.post("/api/sessions/{session_id}/messages")
async def send_message(session_id: str, req: SendMessageRequest):
    """
    Send a message to a session. Runs the Artimis agent loop.
    Returns the final response after tool calling.
    """
    session = db.get_session(session_id)
    if not session:
        raise HTTPException(404, "Session not found")

    # Save user message
    db.add_message(session_id, "user", req.content)

    # Build conversation history from previous messages
    messages = db.get_messages(session_id, limit=50)
    history = []
    for msg in messages:
        if msg["role"] in ("user", "assistant"):
            entry = {"role": msg["role"], "content": msg["content"]}
            history.append(entry)

    # Run the Artimis agent
    from artimis.engine.agent import run_agent
    result = run_agent(
        user_message=req.content,
        session_id=session_id,
        conversation_history=history[:-1],  # exclude the message we just saved
        model=session.get("model"),
    )

    response_content = result["response"]
    if result.get("error"):
        response_content = f"[Error: {result['error']}]\n\n{response_content}"

    # Save assistant response
    db.add_message(session_id, "assistant", response_content)

    return {
        "session_id": session_id,
        "role": "assistant",
        "content": response_content,
        "tool_calls_made": result["tool_calls_made"],
        "iterations": result["iterations"],
        "model_used": result["model_used"],
    }


@app.post("/api/agent")
async def agent_endpoint(req: AgentRequest):
    """
    Simplified agent endpoint for the Web UI.
    Auto-creates or reuses sessions. Returns {response, session_id}.
    """
    from artimis.engine.agent import run_agent

    session_id: str = req.session_id or ""
    session = None

    if session_id:
        session = db.get_session(session_id)

    if not session:
        session = db.create_session()
        session_id = session["id"]

    # Save user message
    db.add_message(session_id, "user", req.message)

    # Build history
    messages = db.get_messages(session_id, limit=50)
    history = []
    for msg in messages:
        if msg["role"] in ("user", "assistant"):
            history.append({"role": msg["role"], "content": msg["content"]})

    result = run_agent(
        user_message=req.message,
        session_id=session_id,
        conversation_history=history[:-1],
        model=session.get("model"),
    )

    response_text = result["response"]
    if result.get("error"):
        response_text = f"[Error: {result['error']}]\n\n{response_text}"

    db.add_message(session_id, "assistant", response_text)

    return {
        "response": response_text,
        "session_id": session_id,
        "tool_calls_made": result.get("tool_calls_made", 0),
        "model_used": result.get("model_used"),
    }


@app.post("/api/deep-research")
async def deep_research_endpoint(req: DeepResearchRequest):
    """
    Run the full deep research pipeline: plan → retrieve → verify → synthesize.
    Returns a research memo with citations and confidence assessment.
    """
    from artimis.engine.deep_research import deep_research

    result = deep_research(
        task=req.task,
        session_id=req.session_id,
        max_iterations=req.max_iterations,
    )

    return {
        "task": result["task"],
        "synthesis": result["synthesis"],
        "confidence": result["confidence"],
        "iterations": result["iterations"],
        "retrieval_count": result["retrieval_count"],
        "gaps": result["gaps"],
    }


# ─── Memories ──────────────────────────────────────────────

@app.get("/api/memories")
async def list_memories(
    pinned: Optional[bool] = None,
    active: Optional[bool] = None,
    tag: Optional[str] = None,
    search: Optional[str] = None
):
    return db.list_memories(pinned=pinned, active=active, tag=tag, search=search)


@app.get("/api/memories/active")
async def get_active_memories():
    return db.list_memories(active=True)


@app.post("/api/memories")
async def create_memory(req: CreateMemoryRequest):
    return db.create_memory(content=req.content, tags=req.tags, source=req.source)


@app.patch("/api/memories/{memory_id}")
async def update_memory(memory_id: str, req: UpdateMemoryRequest):
    m = db.update_memory(memory_id, content=req.content, tags=req.tags, pinned=req.pinned)
    if not m:
        raise HTTPException(404, "Memory not found")
    return m


@app.delete("/api/memories/{memory_id}")
async def delete_memory(memory_id: str):
    db.delete_memory(memory_id)
    return {"deleted": True}


@app.post("/api/memories/{memory_id}/pin")
async def toggle_memory_pin(memory_id: str):
    m = db.get_memory(memory_id)
    if not m:
        raise HTTPException(404, "Memory not found")
    return db.update_memory(memory_id, pinned=not m["pinned"])


# ─── Tasks ─────────────────────────────────────────────────

@app.get("/api/tasks")
async def list_tasks(status: Optional[str] = None):
    return db.list_tasks(status=status)


@app.post("/api/tasks")
async def create_task(req: CreateTaskRequest):
    return db.create_task(
        title=req.title,
        description=req.description,
        session_id=req.session_id,
        priority=req.priority
    )


@app.get("/api/tasks/stale")
async def get_stale_tasks(hours: int = 48):
    """Silence detection: tasks in progress with no activity."""
    return db.get_stale_tasks(stale_hours=hours)


@app.get("/api/tasks/running")
async def get_running_tasks():
    """Get all currently running background tasks."""
    from artimis.engine.task_runner import get_running_tasks
    return get_running_tasks()


@app.get("/api/tasks/silence-report")
async def get_silence_report(hours: int = 48):
    """Get a report of abandoned tasks (silence detection)."""
    from artimis.engine.task_runner import get_silence_report
    return {"report": get_silence_report()}


@app.post("/api/tasks/submit")
async def submit_task(req: SubmitTaskRequest):
    """Submit a task. Optionally starts background execution immediately."""
    from artimis.engine.task_runner import submit_task as runner_submit
    return runner_submit(
        title=req.title, description=req.description,
        session_id=req.session_id, priority=req.priority,
        run_immediately=req.run_immediately,
    )


@app.post("/api/tasks/{task_id}/execute")
async def execute_task_endpoint(task_id: str):
    """Start executing a task in the background."""
    from artimis.engine.task_runner import run_task_background
    task = db.get_task(task_id)
    if not task:
        raise HTTPException(404, "Task not found")
    if task["status"] not in ("pending", "paused"):
        raise HTTPException(400, f"Task is {task['status']}, not pending or paused")
    user_message = task["description"] or task["title"]
    run_task_background(task_id, user_message, task.get("session_id"))
    return {"task_id": task_id, "status": "running"}


@app.post("/api/tasks/{task_id}/cancel")
async def cancel_task_endpoint(task_id: str):
    """Cancel a running or pending task."""
    from artimis.engine.task_runner import cancel_task
    if not cancel_task(task_id):
        raise HTTPException(404, "Task not found")
    return {"task_id": task_id, "status": "cancelled"}


@app.get("/api/tasks/{task_id}")
async def get_task(task_id: str):
    t = db.get_task(task_id)
    if not t:
        raise HTTPException(404, "Task not found")
    return t


@app.patch("/api/tasks/{task_id}")
async def update_task(
    task_id: str,
    status: Optional[str] = None,
    phase: Optional[str] = None
):
    t = db.update_task(task_id, status=status, phase=phase)
    if not t:
        raise HTTPException(404, "Task not found")
    return t


# ─── Notes ─────────────────────────────────────────────────

@app.get("/api/notes")
async def list_notes(session_id: Optional[str] = None):
    return db.list_notes(session_id=session_id)


@app.post("/api/notes")
async def create_note(req: CreateNoteRequest):
    return db.create_note(title=req.title, content=req.content, session_id=req.session_id)


@app.get("/api/notes/{note_id}")
async def get_note(note_id: str):
    n = db.get_note(note_id)
    if not n:
        raise HTTPException(404, "Note not found")
    return n


@app.patch("/api/notes/{note_id}")
async def update_note(note_id: str, req: UpdateNoteRequest):
    n = db.update_note(note_id, title=req.title, content=req.content)
    if not n:
        raise HTTPException(404, "Note not found")
    return n


@app.delete("/api/notes/{note_id}")
async def delete_note(note_id: str):
    db.delete_note(note_id)
    return {"deleted": True}


# ─── Gallery ───────────────────────────────────────────────

@app.get("/api/gallery")
async def list_gallery(limit: int = 50, offset: int = 0):
    return db.list_gallery(limit=limit, offset=offset)


@app.delete("/api/gallery/{image_id}")
async def delete_gallery_image(image_id: str):
    db.delete_gallery_image(image_id)
    return {"deleted": True}


# ─── Brain: Skills ─────────────────────────────────────────

@app.get("/api/skills")
async def list_skills(tag: Optional[str] = None, search: Optional[str] = None):
    """List all skills. Optionally filter by tag or search term."""
    conn = db.get_db()
    query = "SELECT * FROM skills WHERE 1=1"
    params = []
    if tag:
        query += " AND tags LIKE ?"
        params.append(f'%{tag}%')
    if search:
        query += " AND (name LIKE ? OR content LIKE ?)"
        params.extend([f'%{search}%', f'%{search}%'])
    query += " ORDER BY pinned DESC, updated_at DESC"
    rows = conn.execute(query, params).fetchall()
    conn.close()
    return [dict(r) for r in rows]


class CreateSkillRequest(BaseModel):
    name: str
    content: str
    tags: Optional[list[str]] = None


@app.post("/api/skills")
async def create_skill(req: CreateSkillRequest):
    from artimis.engine.brain import create_skill as brain_create_skill
    return brain_create_skill(name=req.name, content=req.content, tags=req.tags)


@app.get("/api/skills/{skill_id}")
async def get_skill(skill_id: str):
    conn = db.get_db()
    row = conn.execute("SELECT * FROM skills WHERE id = ?", (skill_id,)).fetchone()
    conn.close()
    if not row:
        raise HTTPException(404, "Skill not found")
    return dict(row)


class UpdateSkillRequest(BaseModel):
    content: str


@app.patch("/api/skills/{skill_id}")
async def update_skill(skill_id: str, req: UpdateSkillRequest):
    from artimis.engine.brain import update_skill_content
    s = update_skill_content(skill_id, req.content)
    if not s:
        raise HTTPException(404, "Skill not found or is pinned")
    return s


@app.post("/api/skills/{skill_id}/pin")
async def toggle_skill_pin(skill_id: str):
    conn = db.get_db()
    row = conn.execute("SELECT * FROM skills WHERE id = ?", (skill_id,)).fetchone()
    if not row:
        conn.close()
        raise HTTPException(404, "Skill not found")
    new_pinned = 0 if row["pinned"] else 1
    conn.execute("UPDATE skills SET pinned = ?, updated_at = ? WHERE id = ?",
                 (new_pinned, db.now(), skill_id))
    conn.commit()
    conn.close()
    return {"id": skill_id, "pinned": bool(new_pinned)}


@app.get("/api/skills/{skill_id}/versions")
async def get_skill_versions(skill_id: str):
    from artimis.engine.brain import get_skill_versions
    return get_skill_versions(skill_id)


@app.post("/api/skills/{skill_id}/rollback")
async def rollback_skill(skill_id: str, version: int):
    from artimis.engine.brain import rollback_skill
    s = rollback_skill(skill_id, version)
    if not s:
        raise HTTPException(404, "Skill or version not found")
    return s


@app.get("/api/skills/relevant")
async def get_relevant_skills(q: str):
    from artimis.engine.brain import get_relevant_skills
    return get_relevant_skills(q)


# ─── Cookbook Templates ────────────────────────────────────

@app.get("/api/cookbook/templates")
async def list_templates(tag: Optional[str] = None, search: Optional[str] = None):
    return db.list_templates(tag=tag, search=search)


@app.post("/api/cookbook/templates")
async def create_template(req: CreateTemplateRequest):
    return db.create_template(
        name=req.name,
        prompt=req.prompt,
        description=req.description,
        variables=req.variables,
        tags=req.tags
    )


@app.post("/api/cookbook/templates/{template_id}/use")
async def use_template(template_id: str):
    db.increment_template_use(template_id)
    return {"used": True}


# ─── Plugins ───────────────────────────────────────────────

@app.get("/api/plugins")
async def list_plugins(installed_only: bool = False):
    from artimis.engine.plugins import list_plugins as plist, init_plugin_registry
    init_plugin_registry()
    return plist(installed_only=installed_only)


@app.post("/api/plugins/{name}/install")
async def install_plugin(name: str):
    from artimis.engine.plugins import install_plugin, get_install_command
    p = install_plugin(name)
    if not p:
        raise HTTPException(404, "Plugin not found")
    cmd = get_install_command(name)
    return {"installed": True, "name": name, "install_command": cmd}


@app.get("/api/plugins/suggest")
async def suggest_plugins(q: str):
    from artimis.engine.plugins import suggest_plugins
    return suggest_plugins(q)


# ─── Local Model Manager ───────────────────────────────────

@app.get("/api/models/hardware")
async def get_hardware():
    from artimis.engine.model_manager import detect_hardware
    return detect_hardware()


@app.get("/api/models/recommend")
async def get_model_recommendations():
    from artimis.engine.model_manager import recommend_models
    return recommend_models()


@app.get("/api/models/installed")
async def get_installed_models():
    from artimis.engine.model_manager import list_installed_models, check_ollama
    return {
        "ollama_installed": check_ollama(),
        "models": list_installed_models(),
    }


class DownloadModelRequest(BaseModel):
    model_name: str
    method: str = "ollama"


@app.post("/api/models/download")
async def download_model(req: DownloadModelRequest):
    from artimis.engine.model_manager import download_model
    return download_model(req.model_name, req.method)


# ─── Intelligence Layer ────────────────────────────────────

@app.post("/api/sessions/{session_id}/auto-name")
async def auto_name_session(session_id: str):
    """Generate a name for a session from its first exchange."""
    from artimis.engine.intelligence import auto_name_session
    messages = db.get_messages(session_id, limit=2)
    if len(messages) < 2:
        raise HTTPException(400, "Need at least one exchange to auto-name")
    user_msg = next((m["content"] for m in messages if m["role"] == "user"), "")
    asst_msg = next((m["content"] for m in messages if m["role"] == "assistant"), "")
    name = auto_name_session(session_id, user_msg, asst_msg)
    return {"session_id": session_id, "name": name}


@app.get("/api/sessions/{session_id}/orientation")
async def get_session_orientation(session_id: str, q: str = ""):
    from artimis.engine.intelligence import get_session_orientation
    return {"orientation": get_session_orientation(session_id, q)}


# ─── Notifications ──────────────────────────────────────────

class WebhookRequest(BaseModel):
    url: str


@app.get("/api/notifications")
async def get_notifications():
    """Return recent notifications for the Web UI."""
    from artimis.engine.notifications import (
        check_task_completions, check_stale_tasks, check_silence
    )
    notifications = []
    notifications.extend(check_task_completions())
    notifications.extend(check_stale_tasks())
    notifications.extend(check_silence())
    return sorted(notifications, key=lambda n: n.get("timestamp", ""), reverse=True)[:20]


@app.post("/api/notifications/webhooks")
async def add_webhook(req: WebhookRequest):
    """Register a webhook URL for notifications."""
    from artimis.engine.notifications import add_webhook as add_hook
    add_hook(req.url)
    return {"webhooks": "registered"}


@app.delete("/api/notifications/webhooks")
async def remove_webhook(req: WebhookRequest):
    """Remove a webhook URL."""
    from artimis.engine.notifications import remove_webhook as rm_hook
    rm_hook(req.url)
    return {"webhooks": "removed"}


# ─── Health ───────────────────────────────────────────────

@app.get("/api/health")
async def health():
    return {"status": "ok", "version": "0.1.0"}


# ─── Web UI (static files, served after API routes) ─────────

WEB_DIST = os.path.join(os.path.dirname(__file__), "..", "..", "web", "dist")

if os.path.isdir(WEB_DIST):
    # Mount assets at /assets/
    assets_dir = os.path.join(WEB_DIST, "assets")
    if os.path.isdir(assets_dir):
        app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")

    # Serve index.html for root and SPA fallback
    @app.get("/")
    async def serve_spa():
        return FileResponse(os.path.join(WEB_DIST, "index.html"))

    @app.get("/{full_path:path}")
    async def serve_spa_fallback(full_path: str):
        # Only serve static files for non-API paths
        file_path = os.path.join(WEB_DIST, full_path)
        if os.path.isfile(file_path):
            return FileResponse(file_path)
        return FileResponse(os.path.join(WEB_DIST, "index.html"))
