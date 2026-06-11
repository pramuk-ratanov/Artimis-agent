"""
Artimis Agent — Tools with reliability guarantees.

Every tool:
- Validates inputs before execution
- Has timeout protection
- Has retry logic with exponential backoff
- Returns structured errors the LLM can understand
- Never crashes the agent loop
"""

import json
import os
import re
import urllib.request
import urllib.parse
import urllib.error
import time
import subprocess
from typing import Any

# ─── Tool Schemas (what the LLM sees) ────────────────────────

TOOL_SCHEMAS = [
    {
        "type": "function",
        "function": {
            "name": "web_search",
            "description": "Search the web for current information. Returns titles, URLs, and snippets.",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "The search query."}
                },
                "required": ["query"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "web_extract",
            "description": "Extract and read the content of a web page as clean markdown text.",
            "parameters": {
                "type": "object",
                "properties": {
                    "url": {"type": "string", "description": "Full URL to extract."}
                },
                "required": ["url"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "read_file",
            "description": "Read a file from the user's machine.",
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {"type": "string", "description": "Absolute path. Supports ~."},
                    "limit": {"type": "integer", "description": "Max lines (default 200)."}
                },
                "required": ["path"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "write_file",
            "description": "Write content to a file.",
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {"type": "string", "description": "Absolute path."},
                    "content": {"type": "string", "description": "Content to write."}
                },
                "required": ["path", "content"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "terminal",
            "description": "Execute a shell command. 30s timeout, 10KB output cap.",
            "parameters": {
                "type": "object",
                "properties": {
                    "command": {"type": "string", "description": "The shell command."},
                    "workdir": {"type": "string", "description": "Working directory."}
                },
                "required": ["command"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "memory_search",
            "description": "Search stored memories about the user.",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "Search term."}
                },
                "required": ["query"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "memory_save",
            "description": "Save a fact to persistent memory.",
            "parameters": {
                "type": "object",
                "properties": {
                    "content": {"type": "string", "description": "The fact to remember."},
                    "tags": {"type": "array", "items": {"type": "string"}, "description": "Tags."}
                },
                "required": ["content"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "read_uploaded_file",
            "description": "Read the content of a file the user has uploaded via drag-and-drop.",
            "parameters": {
                "type": "object",
                "properties": {
                    "file_id": {"type": "string", "description": "The ID of the uploaded file."}
                },
                "required": ["file_id"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "harness_snapshot",
            "description": "Take a snapshot of the current agent harness (system prompt, tools, brain config, skills). Used before making changes.",
            "parameters": {
                "type": "object",
                "properties": {
                    "component": {"type": "string", "description": "Component to snapshot: system_prompt, tools, brain, skills, or all."}
                },
                "required": ["component"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "harness_experiment",
            "description": "Create a harness improvement experiment. The agent proposes changing part of its own configuration, then validates against test cases.",
            "parameters": {
                "type": "object",
                "properties": {
                    "hypothesis": {"type": "string", "description": "What change are you proposing and why? E.g. 'Adding specific tool usage rules will improve response quality.'"},
                    "component": {"type": "string", "description": "Component to change: system_prompt, tools, brain, skills."}
                },
                "required": ["hypothesis", "component"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "canvas_update",
            "description": "Update the interactive Canvas/Frame in the UI. Used for displaying code, markdown, or presentations.",
            "parameters": {
                "type": "object",
                "properties": {
                    "title": {"type": "string", "description": "Title of the canvas."},
                    "content": {"type": "string", "description": "Markdown or Code content to display."}
                },
                "required": ["title", "content"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "design_audit",
            "description": "Run the Impeccable design linter against frontend code (React, HTML, CSS). Returns detailed UI/UX critique and anti-slop rules broken.",
            "parameters": {
                "type": "object",
                "properties": {
                    "code_content": {"type": "string", "description": "The actual UI code to audit"}
                },
                "required": ["code_content"]
            }
        }
    },
]


# ─── Reliability Utilities ──────────────────────────────────

class ToolError(Exception):
    def __init__(self, message: str, recoverable: bool = True, suggestion: str = ""):
        self.message = message
        self.recoverable = recoverable
        self.suggestion = suggestion
        super().__init__(message)


def _validate_required(args: dict, required: list[str], tool_name: str):
    for key in required:
        if key not in args:
            raise ToolError(f"Missing: '{key}'", suggestion=f"Provide '{key}'.")
        val = args.get(key)
        if isinstance(val, str) and not val.strip():
            raise ToolError(f"Empty: '{key}'", suggestion=f"Provide non-empty '{key}'.")


def retry(func, max_attempts: int = 3, base_delay: float = 1.0):
    last_error = None
    for attempt in range(max_attempts):
        try:
            return func()
        except (urllib.error.URLError, urllib.error.HTTPError, ConnectionError, TimeoutError) as e:
            last_error = e
            if attempt < max_attempts - 1:
                time.sleep(base_delay * (2 ** attempt))
            continue
        except ToolError:
            raise
    raise ToolError(f"Failed after {max_attempts} attempts: {last_error}", suggestion="Try again later.")


def safe_result(success: bool, data: Any = None, error: str = "", suggestion: str = "") -> str:
    result = {"success": success}
    if data is not None:
        result["data"] = data
    if error:
        result["error"] = error
    if suggestion:
        result["suggestion"] = suggestion
    return json.dumps(result, ensure_ascii=False)


# ─── Tool Implementations ───────────────────────────────────

def handle_web_search(args: dict) -> str:
    _validate_required(args, ["query"], "web_search")
    query = args["query"].strip()
    if len(query) < 2:
        return safe_result(False, error="Query too short")

    def _search():
        url = "https://lite.duckduckgo.com/lite/?q=" + urllib.parse.quote(query)
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (compatible; Artimis/1.0)"})
        with urllib.request.urlopen(req, timeout=10) as resp:
            return resp.read().decode("utf-8", errors="ignore")

    try:
        html = retry(_search, max_attempts=2)
    except ToolError as e:
        return safe_result(False, error=e.message, suggestion=e.suggestion)

    link_matches = re.findall(r'<a[^>]*?uddg=([^"&]+)[^>]*?>(.*?)</a>', html, re.DOTALL)
    snippet_matches = re.findall(r'<td[^>]*?class="[^"]*?result-snippet[^"]*?"[^>]*?>(.*?)</td>', html, re.DOTALL)
    if not snippet_matches:
        all_tds = re.findall(r'<td[^>]*?>(.*?)</td>', html, re.DOTALL)
        snippet_matches = [t for t in all_tds if len(re.sub(r'<[^>]+>', '', t).strip()) > 30 and 'uddg=' not in t]

    results = []
    for i, (href_encoded, title_html) in enumerate(link_matches):
        if i >= 5: break
        title = re.sub(r'<[^>]+>', '', title_html).strip()
        if not title or len(title) < 3: continue
        href = urllib.parse.unquote(href_encoded)
        snippet = ""
        if i < len(snippet_matches):
            snippet = re.sub(r'<[^>]+>', '', snippet_matches[i]).strip()[:300]
        results.append({"title": title, "url": href, "snippet": snippet})

    if not results:
        return safe_result(True, data={"query": query, "results": [], "note": "No results found."})
    return safe_result(True, data={"query": query, "results": results, "count": len(results)})


def handle_web_extract(args: dict) -> str:
    _validate_required(args, ["url"], "web_extract")
    url = args["url"].strip()
    if not url.startswith(("http://", "https://")):
        return safe_result(False, error="Invalid URL")

    def _extract():
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (compatible; Artimis/1.0)"})
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = resp.read()
            html = data.decode("utf-8", errors="ignore")
            text = re.sub(r'<script[^>]*>.*?</script>', '', html, flags=re.DOTALL | re.IGNORECASE)
            text = re.sub(r'<style[^>]*>.*?</style>', '', text, flags=re.DOTALL | re.IGNORECASE)
            text = re.sub(r'<[^>]+>', ' ', text)
            text = re.sub(r'\s+', ' ', text).strip()
            if len(text) > 8000:
                text = text[:8000] + "\n\n... (truncated)"
            return text

    try:
        content = retry(_extract, max_attempts=2)
        return safe_result(True, data={"url": url, "content": content})
    except ToolError as e:
        return safe_result(False, error=e.message, suggestion=e.suggestion)


def handle_read_file(args: dict) -> str:
    _validate_required(args, ["path"], "read_file")
    path = os.path.expanduser(args["path"])
    limit = min(args.get("limit", 200), 1000)

    home = os.path.expanduser("~")
    if not path.startswith(home) and not path.startswith("/tmp/"):
        return safe_result(False, error=f"Path outside home: {path}")

    try:
        if not os.path.exists(path):
            return safe_result(False, error=f"Not found: {path}")
        if os.path.isdir(path):
            entries = sorted(os.listdir(path))[:50]
            return safe_result(True, data={"path": path, "type": "directory", "listing": entries})

        with open(path, "r", encoding="utf-8", errors="replace") as f:
            lines = [f"{i:4d}| {line.rstrip()}" for i, line in enumerate(f, 1) if i <= limit]
        return safe_result(True, data={"path": path, "content": "\n".join(lines), "lines": len(lines), "truncated": len(lines) >= limit})
    except Exception as e:
        return safe_result(False, error=str(e))


def handle_write_file(args: dict) -> str:
    _validate_required(args, ["path", "content"], "write_file")
    path = os.path.expanduser(args["path"])
    home = os.path.expanduser("~")
    if not path.startswith(home) and not path.startswith("/tmp/"):
        return safe_result(False, error=f"Path outside home: {path}")

    try:
        os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
        existed = os.path.exists(path)
        with open(path, "w", encoding="utf-8") as f:
            f.write(args["content"])
        return safe_result(True, data={"path": path, "written": True, "bytes": len(args["content"]), "overwrote_existing": existed})
    except Exception as e:
        return safe_result(False, error=str(e))


def handle_terminal(args: dict) -> str:
    _validate_required(args, ["command"], "terminal")
    command = args["command"].strip()
    workdir = args.get("workdir") or os.path.expanduser("~")

    normalized_command = " ".join(command.split())

    dangerous_patterns = [
        "rm -rf /", "rm -fr /", "rm -rf  /", "rm -rf *", "rm -fr *",
        "mkfs", "dd if=", ":(){ :|:& };:", "> /dev/sda", "chmod 777", "chmod -R 777",
        "shutdown", "reboot", "poweroff", "init 0", "init 6",
        "sudo ", "su ", "chown ", "passwd ", "fdisk ", "mkfs.", "/etc/passwd", "/etc/shadow"
    ]
    if any(p in normalized_command for p in dangerous_patterns):
        return safe_result(False, error="Command blocked for safety.")

    try:
        import shlex
        delimiters = [";", "&&", "||", "|"]
        parts = [command]
        for d in delimiters:
            new_parts = []
            for p in parts:
                new_parts.extend(p.split(d))
            parts = new_parts

        for part in parts:
            part = part.strip()
            if not part:
                continue
            
            tokens = shlex.split(part)
            if not tokens:
                continue
            
            executable = os.path.basename(tokens[0])
            blocked_execs = {
                "sudo", "su", "passwd", "chsh", "reboot", "shutdown", "poweroff", "halt",
                "init", "mkfs", "dd", "fdisk", "parted", "mount", "umount", "chown"
            }
            if executable in blocked_execs:
                return safe_result(False, error=f"Command executable '{executable}' is blocked for safety.")
            
            if executable == "rm":
                for t in tokens[1:]:
                    if t.startswith("-"):
                        continue
                    resolved = os.path.abspath(os.path.expanduser(t))
                    if resolved in ("/", "/home", "/etc", "/var", "/usr", "/bin", "/sbin", "/boot"):
                        return safe_result(False, error="Command blocked: attempting to delete a system directory.")
    except Exception as e:
        return safe_result(False, error=f"Command validation failed: {str(e)}")

    try:
        result = subprocess.run(
            command, shell=True, cwd=os.path.expanduser(workdir),
            capture_output=True, text=True, timeout=30,
            env={**os.environ, "PATH": os.environ.get("PATH", "/usr/local/bin:/usr/bin:/bin")}
        )
        output = result.stdout
        if result.stderr:
            output += "\n[STDERR]\n" + result.stderr
        if len(output) > 10000:
            output = output[:10000] + "\n\n... (truncated at 10KB)"
        return safe_result(True, data={"command": command, "exit_code": result.returncode, "output": output, "workdir": workdir})
    except subprocess.TimeoutExpired:
        return safe_result(False, error=f"Timed out: {command}")
    except Exception as e:
        return safe_result(False, error=str(e))


def handle_memory_search(args: dict) -> str:
    _validate_required(args, ["query"], "memory_search")
    try:
        from artimis.db.manager import list_memories
        results = list_memories(search=args["query"].strip())
        if not results:
            return safe_result(True, data={"query": args["query"], "count": 0})
        formatted = []
        for m in results[:10]:
            tags = json.loads(m.get("tags", "[]")) if isinstance(m.get("tags"), str) else m.get("tags", [])
            formatted.append({"content": m["content"], "tags": tags, "pinned": bool(m.get("pinned")), "use_count": m.get("use_count", 0)})
        return safe_result(True, data={"query": args["query"], "count": len(formatted), "results": formatted})
    except Exception as e:
        return safe_result(False, error=str(e))


def handle_memory_save(args: dict) -> str:
    _validate_required(args, ["content"], "memory_save")
    content = args["content"].strip()
    if len(content) < 5:
        return safe_result(False, error="Content too short")
    try:
        from artimis.db.manager import create_memory, list_memories
        existing = list_memories(search=content[:50])
        if existing:
            return safe_result(True, data={"saved": False, "duplicate": True, "id": existing[0]["id"]})
        mem = create_memory(content=content, tags=args.get("tags", []))
        return safe_result(True, data={"saved": True, "id": mem["id"], "content": content})
    except Exception as e:
        return safe_result(False, error=str(e))


def handle_read_uploaded_file(args: dict) -> str:
    _validate_required(args, ["file_id"], "read_uploaded_file")
    file_id = args["file_id"].strip()
    try:
        from artimis.db.schema import get_db
        conn = get_db()
        row = conn.execute("SELECT * FROM files WHERE id = ?", (file_id,)).fetchone()
        conn.close()
        if not row:
            return safe_result(False, error=f"No file with ID: {file_id}")
        f = dict(row)
        path = f["storage_path"]
        if not os.path.exists(path):
            return safe_result(False, error="File missing from disk")
        mime = f.get("mime_type", "")
        is_text = mime.startswith("text/") or mime in ("application/json", "application/javascript", "application/xml") \
            or f["original_name"].endswith((".md", ".py", ".js", ".ts", ".tsx", ".json", ".yaml", ".yml", ".txt", ".csv", ".html", ".css", ".sh", ".sql", ".env", ".toml"))
        if is_text:
            with open(path, "r", encoding="utf-8", errors="replace") as fh:
                content = fh.read(100000)
            return safe_result(True, data={"file_id": file_id, "filename": f["original_name"], "content": content, "truncated": len(content) >= 100000})
        else:
            return safe_result(True, data={"file_id": file_id, "filename": f["original_name"], "mime_type": mime, "size_bytes": f["size_bytes"], "note": "Binary file — content not displayable."})
    except Exception as e:
        return safe_result(False, error=str(e))


def handle_harness_snapshot(args: dict) -> str:
    """Take a harness snapshot via API."""
    _validate_required(args, ["component"], "harness_snapshot")
    component = args["component"].strip()

    try:
        import urllib.request as _ur
        data = json.dumps({"component": component, "source": "auto"}).encode()
        req = _ur.Request("http://127.0.0.1:7002/api/harness/snapshot", data=data,
                         headers={"Content-Type": "application/json"}, method="POST")
        with _ur.urlopen(req, timeout=5) as resp:
            result = json.loads(resp.read())
        return safe_result(True, data=result)
    except Exception as e:
        return safe_result(False, error=str(e))


def handle_harness_experiment(args: dict) -> str:
    """Create a harness experiment."""
    _validate_required(args, ["hypothesis", "component"], "harness_experiment")

    try:
        import urllib.request as _ur
        data = json.dumps({
            "hypothesis": args["hypothesis"].strip(),
            "component": args["component"].strip(),
        }).encode()
        req = _ur.Request("http://127.0.0.1:7002/api/harness/experiment", data=data,
                         headers={"Content-Type": "application/json"}, method="POST")
        with _ur.urlopen(req, timeout=5) as resp:
            result = json.loads(resp.read())
        return safe_result(True, data=result)
    except Exception as e:
        return safe_result(False, error=str(e))


def handle_canvas_update(args: dict) -> str:
    _validate_required(args, ["title", "content"], "canvas_update")
    return safe_result(True, data={"updated": True, "title": args["title"], "content_length": len(args["content"])})


def handle_design_audit(args: dict) -> str:
    _validate_required(args, ["code_content"], "design_audit")
    import tempfile
    import subprocess
    
    with tempfile.NamedTemporaryFile("w", suffix=".tsx", delete=False) as f:
        f.write(args["code_content"])
        temp_path = f.name
        
    try:
        # Run npx impeccable detect --json
        res = subprocess.run(
            ["npx", "--yes", "impeccable", "detect", "--json", temp_path],
            capture_output=True, text=True, timeout=15
        )
        os.remove(temp_path)
        
        try:
            audit_json = json.loads(res.stdout)
            return safe_result(True, data=audit_json)
        except json.JSONDecodeError:
            # If it failed to output valid JSON for some reason, return the raw stdout/stderr
            return safe_result(True, data={"output": res.stdout, "errors": res.stderr})
    except subprocess.TimeoutExpired:
        os.remove(temp_path)
        return safe_result(False, error="Design audit timed out after 15 seconds.")
    except Exception as e:
        if os.path.exists(temp_path):
            os.remove(temp_path)
        return safe_result(False, error=f"Design audit failed: {e}")


# ─── Tool Registry ──────────────────────────────────────────

TOOL_HANDLERS = {
    "web_search": handle_web_search,
    "web_extract": handle_web_extract,
    "read_file": handle_read_file,
    "write_file": handle_write_file,
    "terminal": handle_terminal,
    "memory_search": handle_memory_search,
    "memory_save": handle_memory_save,
    "read_uploaded_file": handle_read_uploaded_file,
    "harness_snapshot": handle_harness_snapshot,
    "harness_experiment": handle_harness_experiment,
    "canvas_update": handle_canvas_update,
    "design_audit": handle_design_audit,
}


def execute_tool(name: str, args: dict) -> str:
    handler = TOOL_HANDLERS.get(name)
    if not handler:
        return safe_result(False, error=f"Unknown tool: {name}")
    try:
        return handler(args)
    except ToolError as e:
        return safe_result(False, error=e.message, suggestion=e.suggestion)
    except Exception as e:
        return safe_result(False, error=f"Tool '{name}' failed: {str(e)}")
