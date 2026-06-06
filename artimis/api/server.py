"""
Artimis Agent — FastAPI Server
The API layer between the web UI and the Artimis engine.
"""

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional
import json

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
    Send a message to a session. Currently synchronous — will be upgraded
    to SSE streaming when the agent engine is wired in (Phase 5).
    """
    session = db.get_session(session_id)
    if not session:
        raise HTTPException(404, "Session not found")

    # Save user message
    db.add_message(session_id, "user", req.content)

    # Placeholder response — agent engine integration is next phase
    response_content = f"[Artimis engine not yet wired] Received: {req.content[:100]}..."

    # Save assistant response
    db.add_message(session_id, "assistant", response_content)

    return {
        "session_id": session_id,
        "role": "assistant",
        "content": response_content
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


# ─── Health ───────────────────────────────────────────────

@app.get("/api/health")
async def health():
    return {"status": "ok", "version": "0.1.0"}
