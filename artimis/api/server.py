"""
Artimis Agent — FastAPI Server
The API layer between the web UI and the Artimis engine.
"""

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from typing import Optional
from contextlib import closing
import secrets
from uuid import uuid4
import json
import os

from artimis.db.schema import init_db
from artimis.db import manager as db
from artimis.db.schema import get_db, now as db_now

app = FastAPI(title="Artimis Agent", version="0.1.0")


def _maybe_auto_name_background(session_id: str) -> None:
    """Auto-name a session after its first exchange, in a background thread.

    The frontend calls /api/sessions/{id}/auto-name explicitly, but sessions
    created via API (curl, scripts, other agents) never get named and pile up
    as "New Chat". This fires only when the session is still unnamed and has
    exactly one exchange, and never overwrites a name that already exists.
    """
    import threading

    def _run() -> None:
        try:
            session = db.get_session(session_id)
            if not session:
                return
            current = (session.get("name") or "").strip()
            if current and current != "New Chat":
                return
            messages = db.get_messages(session_id, limit=3)
            if len(messages) != 2:
                return  # only name right after the first exchange
            user_msg = next((m["content"] for m in messages if m["role"] == "user"), "")
            asst_msg = next((m["content"] for m in messages if m["role"] == "assistant"), "")
            if not user_msg or not asst_msg:
                return
            from artimis.engine.intelligence import auto_name_session
            auto_name_session(session_id, user_msg, asst_msg)
        except Exception:
            pass  # naming is best-effort; never break the response path

    threading.Thread(target=_run, daemon=True).start()


def _get_allowed_origins() -> list[str]:
    """Allowed browser origins for API access.

    Defaults cover local development plus the current Tailscale-hosted Artimis UI.
    Override with ARTIMIS_ALLOWED_ORIGINS as a comma-separated list if deploying
    behind a different hostname.
    """
    configured = os.getenv("ARTIMIS_ALLOWED_ORIGINS", "")
    if configured.strip():
        return [origin.strip().rstrip("/") for origin in configured.split(",") if origin.strip()]
    return [
        "http://localhost:7002",
        "http://127.0.0.1:7002",
        "http://100.95.117.9:7002",
    ]


_ALLOWED_ORIGINS = _get_allowed_origins()

app.add_middleware(
    CORSMiddleware,
    allow_origins=_ALLOWED_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def api_key_auth_middleware(request: Request, call_next):
    """
    Secure all '/api' routes (excluding health check) if 'ARTIMIS_API_KEY' is configured.
    Supports standard 'X-API-Key' header and 'Authorization: Bearer <token>'.
    """
    path = request.url.path
    if path.startswith("/api") and path != "/api/health":
        origin = request.headers.get("Origin", "").rstrip("/")
        referer = request.headers.get("Referer", "")

        # Browsers always attach an Origin (or same-origin Referer) to API calls.
        # A browser Origin that is NOT the Artimis UI is a cross-site attempt: reject.
        # This applies even when no API key is configured.
        if origin and origin not in _ALLOWED_ORIGINS:
            return JSONResponse(
                status_code=403,
                content={"detail": "Origin not allowed"},
            )
        if not origin and referer:
            from urllib.parse import urlparse
            ref_origin = f"{urlparse(referer).scheme}://{urlparse(referer).netloc}".rstrip("/")
            if ref_origin not in _ALLOWED_ORIGINS:
                return JSONResponse(
                    status_code=403,
                    content={"detail": "Origin not allowed"},
                )

        # Non-browser clients (curl, scripts, server-to-server) carry no Origin.
        # When ARTIMIS_API_KEY is configured, those clients must authenticate.
        # The Artimis UI itself is exempt because its Origin was validated above.
        is_browser = bool(origin) or bool(referer)
        expected_key = os.getenv("ARTIMIS_API_KEY") or _read_env_file().get("ARTIMIS_API_KEY")

        if expected_key and not is_browser:
            api_key = request.headers.get("X-API-Key")

            # Check Bearer Authorization fallback
            if not api_key:
                auth_header = request.headers.get("Authorization")
                if auth_header and auth_header.startswith("Bearer "):
                    api_key = auth_header[len("Bearer "):]

            # Constant-time comparison to mitigate timing side-channel attacks
            if not api_key or not secrets.compare_digest(api_key, expected_key):
                return JSONResponse(
                    status_code=401,
                    content={"detail": "Invalid or missing API Key"}
                )
                
    response = await call_next(request)
    return response


def _read_env_file() -> dict:
    env_path = os.path.expanduser("~/.artimis/.env")
    if not os.path.exists(env_path):
        env_path = ".env"
    if not os.path.exists(env_path):
        return {}
    res = {}
    try:
        with open(env_path, "r") as f:
            for line in f:
                if "=" in line and not line.strip().startswith("#"):
                    k, v = line.strip().split("=", 1)
                    res[k.strip()] = v.strip().strip('"').strip("'")
    except Exception:
        pass
    return res



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

    # Start harness self-improvement runner
    try:
        from artimis.engine.harness_runner import start_harness_runner
        start_harness_runner(interval_seconds=60)
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


class UpdateSessionRequest(BaseModel):
    name: Optional[str] = None
    status: Optional[str] = None


@app.put("/api/sessions/{session_id}")
async def update_session(session_id: str, req: UpdateSessionRequest):
    """Update session name and/or status. Used by archive/frontend actions."""
    if req.name:
        db.rename_session(session_id, req.name)
    if req.status:
        conn = get_db()
        conn.execute(
            "UPDATE sessions SET status = ?, updated_at = ? WHERE id = ?",
            (req.status, db_now(), session_id)
        )
        conn.commit()
        conn.close()
    s = db.get_session(session_id)
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


def _build_context_history(session_id: str, session: dict) -> list:
    """
    Build conversation history for context, applying context distillation.
    If the session has a summary, prepend it. Limit to last 20 messages.
    """
    messages = db.get_messages(session_id, limit=20, desc=True)
    history = []
    
    # Inject distilled summary if available
    summary = session.get("summary")
    if summary:
        history.append({
            "role": "system", 
            "content": f"## PREVIOUS CONVERSATION SUMMARY\nThe earlier part of this conversation was distilled into this summary:\n{summary}"
        })
        
    for msg in messages:
        if msg["role"] in ("user", "assistant"):
            history.append({"role": msg["role"], "content": msg["content"]})
            
    # Trigger background distillation if we have exactly 20 messages and no recent summary
    # (Simplified check: if we retrieved 20, maybe it's time to summarize)
    if len(messages) >= 20:
        from artimis.engine.task_runner import run_task_background
        from artimis.engine.intelligence import distill_session_context
        # We can fire and forget a distillation task
        run_task_background(lambda: distill_session_context(session_id))
            
    return history


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

    # Build history
    history = _build_context_history(session_id, session)

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
    _maybe_auto_name_background(session_id)

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
    history = _build_context_history(session_id, session)

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


@app.post("/api/agent/stream")
async def agent_stream_endpoint(req: AgentRequest):
    """
    Streaming agent endpoint. Returns Server-Sent Events.
    Tool-calling phase runs synchronously, then the final response streams as tokens.
    """
    from artimis.engine.agent import run_agent_streaming

    session_id: str = req.session_id or ""

    full_response = []
    tool_calls = []

    async def generate():
        nonlocal session_id
        session = None

        if session_id:
            session = db.get_session(session_id)

        if not session:
            session = db.create_session()
            session_id = session["id"]

        db.add_message(session_id, "user", req.message)

        history = _build_context_history(session_id, session)

        full_response = []
        tool_calls = []

        try:
            for sse_chunk in run_agent_streaming(
                user_message=req.message,
                session_id=session_id,
                conversation_history=history[:-1],
                model=session.get("model"),
            ):
                # Accumulate full response from tokens
                if "token" in sse_chunk or "tool" in sse_chunk:
                    try:
                        data = json.loads(sse_chunk.replace("data: ", "", 1))
                        if data.get("type") == "token":
                            full_response.append(data.get("content", ""))
                        elif data.get("type") == "tool":
                            tool_calls.append({
                                "id": f"call_{uuid4().hex[:8]}",
                                "type": "function",
                                "function": {
                                    "name": data.get("name"),
                                    "arguments": json.dumps(data.get("args", {}))
                                }
                            })
                    except json.JSONDecodeError:
                        pass

                yield sse_chunk

            # Save the full assistant response
            complete = "".join(full_response)
            if complete or tool_calls:
                db.add_message(
                    session_id,
                    "assistant",
                    complete if complete else None,
                    tool_calls=tool_calls if tool_calls else None
                )
                _maybe_auto_name_background(session_id)

        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'content': str(e)})}\n\n"

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


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
    type: str = "logic"

class IngestSkillRequest(BaseModel):
    url: str

@app.post("/api/skills")
async def create_skill(req: CreateSkillRequest):
    from artimis.engine.brain import create_skill as brain_create_skill
    return brain_create_skill(name=req.name, content=req.content, tags=req.tags, skill_type=req.type)

@app.post("/api/skills/ingest")
async def ingest_skill(req: IngestSkillRequest):
    """Clone a GitHub repo and extract SKILL.md profiles."""
    import tempfile
    import subprocess
    import os
    import glob
    from artimis.engine.brain import create_skill as brain_create_skill
    
    if not req.url.startswith("https://github.com/"):
        raise HTTPException(400, "Only github.com URLs are supported")
        
    with tempfile.TemporaryDirectory() as tmpdir:
        try:
            subprocess.run(["git", "clone", "--depth", "1", req.url, tmpdir], check=True, capture_output=True)
        except subprocess.CalledProcessError as e:
            raise HTTPException(400, f"Git clone failed: {e.stderr.decode()}")
            
        # Find SKILL.md files
        skill_files = []
        for root, _, files in os.walk(tmpdir):
            for file in files:
                if file == "SKILL.md":
                    skill_files.append(os.path.join(root, file))
                    
        if not skill_files:
            raise HTTPException(404, "No SKILL.md files found in repository")
            
        ingested = []
        for file in skill_files:
            with open(file, 'r', encoding='utf-8') as f:
                content = f.read()
                
            # Attempt to parse name from frontmatter or filename path
            name = "ingested-skill"
            if "name:" in content[:500]:
                for line in content[:500].split('\n'):
                    if line.startswith("name:"):
                        name = line.replace("name:", "").strip().strip('\'"')
                        break
            if name == "ingested-skill":
                parts = file.replace(tmpdir, "").strip("/").split("/")
                if len(parts) > 1:
                    name = parts[-2] # folder name
                else:
                    name = req.url.split("/")[-1].replace(".git", "")
            
            # create_skill expects specific args, let's just pass tags=["design"] to mark them
            try:
                skill = brain_create_skill(name=name, content=content, tags=["design", "ingested"], skill_type="design")
                ingested.append(skill)
            except Exception as e:
                pass # skip duplicates
                
        return {"ingested": len(ingested), "skills": ingested}



@app.get("/api/skills/relevant")
async def get_relevant_skills(q: str):
    from artimis.engine.brain import get_relevant_skills
    return get_relevant_skills(q)


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


# ─── Config ───────────────────────────────────────────────

_ARTIMIS_DIR = os.environ.get("ARTIMIS_HOME", os.path.expanduser("~/.artimis"))
_ENV_FILE = os.path.join(_ARTIMIS_DIR, ".env")

_CONFIG_KEYS = [
    "ARTIMIS_MODEL",
    "DEEPSEEK_API_KEY",
    "OPENAI_API_KEY",
    "GPT_API_KEY",
    "OPENROUTER_API_KEY",
    "ANTHROPIC_API_KEY",
    "SAKANA_API_KEY",
]


def _mask(value: str) -> str:
    """Show first 4 and last 4 chars, mask the middle."""
    if not value or len(value) <= 8:
        return "****"
    return value[:4] + "*" * (len(value) - 8) + value[-4:]


def _read_env_file() -> dict:
    """Read ~/.artimis/.env and return a dict of key→value."""
    data: dict = {}
    if not os.path.exists(_ENV_FILE):
        return data
    with open(_ENV_FILE) as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                key, _, val = line.partition("=")
                key = key.strip()
                val = val.strip().strip('"').strip("'")
                if key:
                    data[key] = val
    return data


def _write_env_file(data: dict) -> None:
    """Write a dict of key→value to ~/.artimis/.env (KEY=VALUE lines)."""
    os.makedirs(_ARTIMIS_DIR, exist_ok=True)
    existing = _read_env_file()
    existing.update({k: v for k, v in data.items() if v is not None})
    # Remove keys explicitly set to empty string
    existing = {k: v for k, v in existing.items() if v != ""}
    with open(_ENV_FILE, "w") as f:
        for key, val in existing.items():
            f.write(f"{key}={val}\n")


class ConfigRequest(BaseModel):
    model: Optional[str] = None
    DEEPSEEK_API_KEY: Optional[str] = None
    OPENAI_API_KEY: Optional[str] = None
    GPT_API_KEY: Optional[str] = None
    OPENROUTER_API_KEY: Optional[str] = None
    ANTHROPIC_API_KEY: Optional[str] = None
    SAKANA_API_KEY: Optional[str] = None


@app.get("/api/config")
async def get_config():
    """Return the current model and stored provider keys (secrets masked)."""
    stored = _read_env_file()
    result: dict = {
        "model": os.getenv("ARTIMIS_MODEL") or stored.get("ARTIMIS_MODEL", "deepseek-v4-pro"),
        "keys": {},
    }
    key_names = [k for k in _CONFIG_KEYS if k != "ARTIMIS_MODEL"]
    for key in key_names:
        raw = os.getenv(key) or stored.get(key, "")
        result["keys"][key] = _mask(raw) if raw else ""
    return result


@app.post("/api/config")
async def save_config(req: ConfigRequest):
    """Save API keys and/or default model to ~/.artimis/.env."""
    updates: dict = {}
    if req.model is not None:
        updates["ARTIMIS_MODEL"] = req.model
        os.environ["ARTIMIS_MODEL"] = req.model
    for key in _CONFIG_KEYS:
        if key == "ARTIMIS_MODEL":
            continue
        val = getattr(req, key, None)
        if val is not None:
            updates[key] = val
            if val:
                os.environ[key] = val
    _write_env_file(updates)
    return {"saved": True, "keys_updated": list(updates.keys())}


# ─── Statistics ───────────────────────────────────────────

@app.get("/api/stats")
async def get_statistics():
    """Return user statistics: focus areas, skill development, session patterns."""
    with closing(get_db()) as conn:
        # Counts
        total_sessions = conn.execute("SELECT COUNT(*) FROM sessions").fetchone()[0]
        total_messages = conn.execute("SELECT COUNT(*) FROM messages").fetchone()[0]
        total_memories = conn.execute("SELECT COUNT(*) FROM memories").fetchone()[0]
        total_skills = conn.execute("SELECT COUNT(*) FROM skills").fetchone()[0]

        # Focus areas: analyze message content for keyword clusters
        focus_keywords = {
            "Coding/Development": ["code", "function", "api", "build", "component", "react", "python", "typescript", "error", "fix", "implement", "refactor"],
            "AI/Prompting": ["prompt", "model", "llm", "agent", "generat", "ai", "gpt", "claude", "deepseek", "openrouter"],
            "Design/UI": ["design", "ui", "ux", "css", "style", "layout", "color", "button", "sidebar", "card", "theme"],
            "Business/Marketing": ["marketing", "lead", "client", "sales", "campaign", "freight", "logistics", "shipping"],
            "Infrastructure": ["server", "deploy", "docker", "database", "api", "endpoint", "config", "port", "sqlite"],
        }
        
        # Count messages per focus area (Fully Parameterized - Safe from SQLi)
        focus_sessions: dict = {}
        for area, keywords in focus_keywords.items():
            pattern = " OR ".join(["content LIKE ?" for _ in keywords])
            params = [f"%{kw}%" for kw in keywords]
            
            count = conn.execute(f"SELECT COUNT(DISTINCT session_id) FROM messages WHERE {pattern}", params).fetchone()[0]
            msg_count = conn.execute(f"SELECT COUNT(*) FROM messages WHERE {pattern}", params).fetchone()[0]
            if count > 0:
                focus_sessions[area] = {"sessions": count, "messages": msg_count}

        # Top skills: from memories tags
        tags_raw = conn.execute("SELECT tags FROM memories WHERE tags != '[]'").fetchall()
        tag_counts: dict = {}
        for (tags_str,) in tags_raw:
            try:
                for tag in json.loads(tags_str):
                    tag_counts[tag] = tag_counts.get(tag, 0) + 1
            except (json.JSONDecodeError, TypeError):
                pass

        top_skills = [{"name": k, "value": v} for k, v in tag_counts.items() if v >= 2][:8]
        if not top_skills:
            top_skills = [{"name": "Start chatting to build stats", "value": 1}]

        # Critique score trend
        critique_trend = []
        try:
            rows = conn.execute(
                "SELECT date(created_at) as day, AVG(score) as avg_score, COUNT(*) as count "
                "FROM critique_history GROUP BY day ORDER BY day DESC LIMIT 30"
            ).fetchall()
            critique_trend = [
                {"day": r["day"], "avg_score": round(r["avg_score"], 2), "count": r["count"]}
                for r in rows
            ]
            critique_trend.reverse()  # chronological order
        except Exception:
            pass

    # Calculate percentages for focus areas
    focus_areas = []
    if focus_sessions:
        total_focus_msgs = sum(f["messages"] for f in focus_sessions.values())
        for area, data in focus_sessions.items():
            pct = round((data["messages"] / total_focus_msgs) * 100) if total_focus_msgs > 0 else 0
            focus_areas.append({"topic": area, "sessions": data["sessions"], "messages": data["messages"], "percentage": pct})
        focus_areas.sort(key=lambda x: x["messages"], reverse=True)

    return {
        "totalSessions": total_sessions,
        "totalMessages": total_messages,
        "totalMemories": total_memories,
        "totalSkills": total_skills,
        "topSkills": top_skills,
        "focusAreas": focus_areas or [{"topic": "No data yet", "sessions": 1, "messages": 0, "percentage": 100}],
        "critiqueTrend": critique_trend,
    }


# Topic taxonomy reused for node coloring + relevance scoring
_GRAPH_TOPICS = {
    "coding": ["code", "function", "api", "build", "component", "react", "python", "typescript", "error", "fix", "implement", "refactor", "bug", "deploy"],
    "ai": ["prompt", "model", "llm", "agent", "generat", "gpt", "claude", "deepseek", "openrouter", "harness"],
    "design": ["design", "ui", "ux", "css", "style", "layout", "color", "button", "sidebar", "card", "theme", "palette"],
    "business": ["marketing", "lead", "client", "sales", "campaign", "freight", "logistics", "shipping", "brand"],
    "infra": ["server", "deploy", "docker", "database", "endpoint", "config", "port", "sqlite", "container", "volume"],
}

# Words ignored when computing session-to-session relevance overlap
_GRAPH_STOPWORDS = set("""
the a an and or but if then else for to of in on at by with from into is are was were be been being
this that these those it its as so not no yes do does did can could should would will just like get got
i you he she we they me him her us them my your our their what which who when where why how all any some
""".split())


@app.get("/api/stats/graph")
async def get_conversation_graph(limit: int = 60):
    """
    Conversation constellation: each session is a node, edges connect sessions
    that share significant vocabulary (topic relevance). Returns:
      nodes: [{id, label, topic, size, messages}]
      edges: [{source, target, weight, reason}]
    The frontend renders nodes as a star-field and sweeps an ember pulse along
    each edge to show node-to-node relevance.
    """
    db = get_db()
    rows = db.execute(
        "SELECT id, name, created_at FROM sessions ORDER BY created_at DESC LIMIT ?",
        (limit,),
    ).fetchall()

    import re

    nodes = []
    session_words: dict[str, set] = {}     # session_id -> significant word set
    session_topic: dict[str, str] = {}     # session_id -> dominant topic

    for r in rows:
        sid = r["id"]
        msgs = db.execute(
            "SELECT content FROM messages WHERE session_id=? AND role IN ('user','assistant')",
            (sid,),
        ).fetchall()
        text = " ".join((m["content"] or "") for m in msgs).lower()
        msg_count = len(msgs)

        # Significant words (>=4 chars, not stopwords) for overlap scoring
        words = {
            w for w in re.findall(r"[a-z][a-z0-9]{3,}", text)
            if w not in _GRAPH_STOPWORDS
        }
        session_words[sid] = words

        # Dominant topic by keyword hits → node color
        best_topic, best_hits = "general", 0
        for topic, kws in _GRAPH_TOPICS.items():
            hits = sum(text.count(kw) for kw in kws)
            if hits > best_hits:
                best_topic, best_hits = topic, hits
        session_topic[sid] = best_topic

        nodes.append({
            "id": sid,
            "label": r["name"] or "Untitled",
            "topic": best_topic,
            "messages": msg_count,
            "size": min(1.0, 0.25 + msg_count / 20.0),  # 0.25..1.0 for radius scaling
        })

    # Edges: Jaccard-style overlap of significant vocab between session pairs
    ids = list(session_words.keys())
    edges = []
    for i in range(len(ids)):
        for j in range(i + 1, len(ids)):
            a, b = session_words[ids[i]], session_words[ids[j]]
            if not a or not b:
                continue
            shared = a & b
            if len(shared) < 3:
                continue
            union = len(a | b) or 1
            weight = round(len(shared) / union, 3)
            if weight < 0.06:   # prune weak links to keep the graph readable
                continue
            top_shared = sorted(shared, key=lambda w: -(len(w)))[:3]
            edges.append({
                "source": ids[i],
                "target": ids[j],
                "weight": weight,
                "reason": ", ".join(top_shared),
            })

    # Keep the strongest edges only (avoid hairball)
    edges.sort(key=lambda e: -e["weight"])
    edges = edges[: max(40, len(nodes) * 2)]

    return {"nodes": nodes, "edges": edges}


# ─── Custom Agents ─────────────────────────────────────────

@app.get("/api/agents")
async def list_agents():
    with closing(get_db()) as conn:
        rows = conn.execute("SELECT * FROM custom_agents ORDER BY created_at DESC").fetchall()
    return [dict(r) for r in rows]


@app.post("/api/agents")
async def create_agent(req: Request):
    body = await req.json()
    agent_id = str(uuid4())
    with closing(get_db()) as conn:
        conn.execute(
            "INSERT INTO custom_agents (id, name, description, model, api_key, system_prompt) VALUES (?,?,?,?,?,?)",
            (agent_id, body["name"], body.get("description"), body["model"],
             body.get("api_key"), body.get("system_prompt"))
        )
        conn.commit()
        row = conn.execute("SELECT * FROM custom_agents WHERE id=?", (agent_id,)).fetchone()
    return dict(row)


@app.patch("/api/agents/{agent_id}")
async def update_agent(agent_id: str, req: Request):
    body = await req.json()
    fields = []
    values = []
    for k in ["name", "description", "model", "api_key", "system_prompt", "active"]:
        if k in body:
            fields.append(f"{k}=?")
            values.append(body[k])
    with closing(get_db()) as conn:
        if fields:
            values.append(agent_id)
            conn.execute(f"UPDATE custom_agents SET {', '.join(fields)} WHERE id=?", tuple(values))
            conn.commit()
        row = conn.execute("SELECT * FROM custom_agents WHERE id=?", (agent_id,)).fetchone()
    return dict(row) if row else JSONResponse(status_code=404, content={"error": "Not found"})


@app.delete("/api/agents/{agent_id}")
async def delete_agent(agent_id: str):
    with closing(get_db()) as conn:
        conn.execute("DELETE FROM custom_agents WHERE id=?", (agent_id,))
        conn.commit()
    return {"deleted": True}


# ─── Files ──────────────────────────────────────────────────

_FILES_DIR = os.path.join(
    os.environ.get("ARTIMIS_HOME", os.path.expanduser("~/.artimis")), "files"
)


@app.post("/api/files/upload")
async def upload_file(request: Request):
    """Upload one or more files. Returns list of file records."""
    os.makedirs(_FILES_DIR, exist_ok=True)

    form = await request.form()
    uploaded = []

    for field_name in form:
        field = form[field_name]
        if not hasattr(field, "filename"):
            continue

        file_id = str(uuid4())
        original_name = field.filename or "unknown"
        ext = os.path.splitext(original_name)[1] or ""
        storage_name = f"{file_id}{ext}"
        storage_path = os.path.join(_FILES_DIR, storage_name)

        content = await field.read()
        with open(storage_path, "wb") as f:
            f.write(content)

        conn = get_db()
        conn.execute(
            "INSERT INTO files (id, filename, original_name, mime_type, size_bytes, storage_path) VALUES (?,?,?,?,?,?)",
            (file_id, storage_name, original_name, field.content_type, len(content), storage_path)
        )
        conn.commit()
        conn.close()

        uploaded.append({
            "id": file_id,
            "original_name": original_name,
            "mime_type": field.content_type,
            "size_bytes": len(content),
        })

    return {"uploaded": uploaded, "count": len(uploaded)}


@app.get("/api/files")
async def list_files():
    """List all uploaded files."""
    conn = get_db()
    rows = conn.execute("SELECT * FROM files ORDER BY created_at DESC").fetchall()
    conn.close()
    return [dict(r) for r in rows]


@app.get("/api/files/{file_id}")
async def get_file(file_id: str):
    """Download/view a file. For text files, returns content. For binaries, returns raw."""
    conn = get_db()
    row = conn.execute("SELECT * FROM files WHERE id = ?", (file_id,)).fetchone()
    conn.close()
    if not row:
        raise HTTPException(404, "File not found")

    f = dict(row)
    path = f["storage_path"]
    if not os.path.exists(path):
        raise HTTPException(404, "File missing from disk")

    return FileResponse(path, filename=f["original_name"], media_type=f.get("mime_type"))


@app.delete("/api/files/{file_id}")
async def delete_file(file_id: str):
    """Delete an uploaded file."""
    conn = get_db()
    row = conn.execute("SELECT * FROM files WHERE id = ?", (file_id,)).fetchone()
    if row:
        path = dict(row)["storage_path"]
        if os.path.exists(path):
            os.remove(path)
        conn.execute("DELETE FROM files WHERE id = ?", (file_id,))
        conn.commit()
    conn.close()
    return {"deleted": True}


# ─── Harness Self-Improvement ──────────────────────────────

class CreateSnapshotRequest(BaseModel):
    component: str  # 'system_prompt', 'tools', 'brain', 'skills', 'all'
    source: str = "manual"

class CreateExperimentRequest(BaseModel):
    hypothesis: str
    component: str
    test_case_ids: Optional[list[str]] = None

class CreateTestCaseRequest(BaseModel):
    input_message: str
    expected_traits: dict  # {must_contain: [...], must_not_contain: [...], min_critique_score: int}


@app.post("/api/harness/snapshot")
async def create_snapshot(req: CreateSnapshotRequest):
    """Take a snapshot of current harness state."""
    components = ["system_prompt", "tools", "brain", "skills"] if req.component == "all" else [req.component]
    snapshots = []

    conn = get_db()
    latest = conn.execute("SELECT MAX(version) FROM harness_snapshots").fetchone()[0] or 0

    for comp in components:
        content = ""
        if comp == "system_prompt":
            from artimis.engine.system_prompt import SYSTEM_PROMPT
            content = SYSTEM_PROMPT
        elif comp == "tools":
            import json as _json
            from artimis.engine.tools import TOOL_SCHEMAS
            content = _json.dumps(TOOL_SCHEMAS, indent=2)
        elif comp == "brain":
            from artimis.engine.brain import MAX_CONTEXT_CHARS
            content = f"MAX_CONTEXT_CHARS={MAX_CONTEXT_CHARS}"
        elif comp == "skills":
            rows = conn.execute("SELECT name, version, content FROM skills ORDER BY name").fetchall()
            content = "\n\n".join(f"# {r['name']} v{r['version']}\n{r['content']}" for r in rows)

        latest += 1
        sid = str(uuid4())
        conn.execute(
            "INSERT INTO harness_snapshots (id, version, component, content, source) VALUES (?,?,?,?,?)",
            (sid, latest, comp, content, req.source)
        )
        snapshots.append({"id": sid, "version": latest, "component": comp})

    conn.commit()
    conn.close()
    return {"snapshots": snapshots, "count": len(snapshots), "latest_version": latest}


@app.get("/api/harness/versions")
async def list_harness_versions(component: Optional[str] = None, limit: int = 20):
    """List harness snapshots, optionally filtered by component."""
    conn = get_db()
    if component:
        rows = conn.execute(
            "SELECT * FROM harness_snapshots WHERE component = ? ORDER BY version DESC LIMIT ?",
            (component, limit)
        ).fetchall()
    else:
        rows = conn.execute(
            "SELECT * FROM harness_snapshots ORDER BY version DESC LIMIT ?",
            (limit,)
        ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


@app.get("/api/harness/versions/{version}")
async def get_harness_version(version: int):
    """Get a specific harness version snapshot."""
    conn = get_db()
    row = conn.execute("SELECT * FROM harness_snapshots WHERE version = ?", (version,)).fetchone()
    conn.close()
    if not row:
        raise HTTPException(404, "Version not found")
    return dict(row)


@app.post("/api/harness/rollback")
async def rollback_harness(version: int):
    """Roll back to a previous harness version. Creates a new snapshot of current state first."""
    conn = get_db()
    target = conn.execute("SELECT * FROM harness_snapshots WHERE version = ?", (version,)).fetchone()
    if not target:
        conn.close()
        raise HTTPException(404, "Target version not found")

    t = dict(target)
    comp = t["component"]

    # Take a pre-rollback snapshot
    latest = conn.execute("SELECT MAX(version) FROM harness_snapshots").fetchone()[0] or 0
    current_content = ""
    if comp == "system_prompt":
        from artimis.engine.system_prompt import SYSTEM_PROMPT
        current_content = SYSTEM_PROMPT
    elif comp == "tools":
        from artimis.engine.tools import TOOL_SCHEMAS
        current_content = json.dumps(TOOL_SCHEMAS, indent=2)

    pre_sid = str(uuid4())
    conn.execute(
        "INSERT INTO harness_snapshots (id, version, component, content, source) VALUES (?,?,?,?,?)",
        (pre_sid, latest + 1, comp, current_content, "rollback")
    )

    # Apply rollback
    # Note: Runtime rollback requires modifying in-memory state, which is limited.
    # For system_prompt, we update the module variable.
    # For tools/brain, changes require server restart.
    applied = False
    if comp == "system_prompt":
        import artimis.engine.system_prompt as sp
        sp.SYSTEM_PROMPT = t["content"]
        applied = True

    conn.commit()
    conn.close()

    return {
        "rolled_back_to": version,
        "component": comp,
        "applied": applied,
        "note": "System prompt updated in memory. Tool/brain changes require server restart."
    }


@app.post("/api/harness/experiment")
async def run_experiment(req: CreateExperimentRequest):
    """Run a harness experiment: snapshot → propose change → validate → apply/reject."""
    conn = get_db()

    # Get current version
    current = conn.execute(
        "SELECT MAX(version) FROM harness_snapshots WHERE component = ?", (req.component,)
    ).fetchone()[0]

    exp_id = str(uuid4())
    conn.execute(
        """INSERT INTO harness_experiments (id, hypothesis, component, before_version, test_case_ids, outcome)
           VALUES (?,?,?,?,?,?)""",
        (exp_id, req.hypothesis, req.component, current or 0, json.dumps(req.test_case_ids or []), "pending")
    )
    conn.commit()
    conn.close()

    return {"experiment_id": exp_id, "status": "pending", "before_version": current}


@app.post("/api/harness/experiments/{exp_id}/apply")
async def apply_experiment(exp_id: str, version: int, score_before: float = 0, score_after: float = 0):
    """Mark an experiment as applied with its score delta."""
    conn = get_db()
    conn.execute(
        """UPDATE harness_experiments
           SET outcome = 'applied', after_version = ?, score_before = ?, score_after = ?, completed_at = ?
           WHERE id = ?""",
        (version, score_before, score_after, db_now(), exp_id)
    )
    conn.commit()
    conn.close()
    return {"experiment_id": exp_id, "outcome": "applied"}


@app.post("/api/harness/experiments/{exp_id}/reject")
async def reject_experiment(exp_id: str, error: Optional[str] = None):
    """Mark an experiment as rejected."""
    conn = get_db()
    conn.execute(
        "UPDATE harness_experiments SET outcome = 'rejected', error_message = ?, completed_at = ? WHERE id = ?",
        (error, db_now(), exp_id)
    )
    conn.commit()
    conn.close()
    return {"experiment_id": exp_id, "outcome": "rejected"}


@app.get("/api/harness/experiments")
async def list_experiments(limit: int = 20):
    """List harness experiments."""
    conn = get_db()
    rows = conn.execute("SELECT * FROM harness_experiments ORDER BY created_at DESC LIMIT ?", (limit,)).fetchall()
    conn.close()
    return [dict(r) for r in rows]


@app.post("/api/harness/test-cases")
async def create_test_case(req: CreateTestCaseRequest):
    """Create a test case for harness validation."""
    conn = get_db()
    tc_id = str(uuid4())
    conn.execute(
        "INSERT INTO test_cases (id, input_message, expected_traits) VALUES (?,?,?)",
        (tc_id, req.input_message, json.dumps(req.expected_traits))
    )
    conn.commit()
    conn.close()
    return {"id": tc_id, "input_message": req.input_message}


@app.get("/api/harness/test-cases")
async def list_test_cases():
    """List all test cases."""
    conn = get_db()
    rows = conn.execute("SELECT * FROM test_cases ORDER BY created_at DESC").fetchall()
    conn.close()
    return [dict(r) for r in rows]


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
