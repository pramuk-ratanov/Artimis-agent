#!/usr/bin/env python3
"""Functional audit for Artimis. Real requests, pass/fail with evidence."""
import json, os, sqlite3, time, urllib.request, urllib.error

BASE = "http://localhost:7002"
results = []

def rec(name, ok, evidence):
    results.append((name, ok, evidence))
    print(f"[{'PASS' if ok else 'FAIL'}] {name}: {evidence}")

def req(method, path, body=None, timeout=30):
    url = BASE + path
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(url, data=data, method=method)
    if data:
        r.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(r, timeout=timeout) as resp:
            raw = resp.read().decode()
            return resp.status, raw
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()
    except Exception as e:
        return -1, str(e)

# 1. Health
st, raw = req("GET", "/api/health")
rec("health", st == 200, f"status={st} body={raw[:80]}")

# 2. Sessions list
st, raw = req("GET", "/api/sessions")
sess_ok = st == 200
try:
    sessions = json.loads(raw)
    rec("sessions_list", sess_ok and isinstance(sessions, list), f"status={st} count={len(sessions) if isinstance(sessions,list) else 'n/a'}")
except Exception as e:
    sessions = []
    rec("sessions_list", False, f"status={st} parse_error={e}")

# 3. Config endpoint (settings/API keys)
st, raw = req("GET", "/api/config")
rec("config_get", st == 200, f"status={st} body={raw[:120]}")

# 4. Memories list
st, raw = req("GET", "/api/memories")
mem_ok = st == 200
try:
    mems = json.loads(raw)
    rec("memories_list", mem_ok, f"status={st} count={len(mems) if isinstance(mems,list) else 'obj'}")
except Exception as e:
    rec("memories_list", False, f"status={st} parse_error={e}")

# 5. Active memories (intelligence panel)
st, raw = req("GET", "/api/memories/active")
rec("memories_active", st == 200, f"status={st} len={len(raw)}")

# 6. Stats endpoint
st, raw = req("GET", "/api/stats")
rec("stats", st == 200, f"status={st} body={raw[:120]}")

# 7. Stats graph
st, raw = req("GET", "/api/stats/graph")
rec("stats_graph", st == 200, f"status={st} len={len(raw)}")

# 8. Tasks
st, raw = req("GET", "/api/tasks")
rec("tasks_list", st == 200, f"status={st} len={len(raw)}")

# 9. Skills
st, raw = req("GET", "/api/skills")
rec("skills_list", st == 200, f"status={st} len={len(raw)}")

# 10. Notes
st, raw = req("GET", "/api/notes")
rec("notes_list", st == 200, f"status={st} len={len(raw)}")

# 11. Gallery
st, raw = req("GET", "/api/gallery")
rec("gallery_list", st == 200, f"status={st} len={len(raw)}")

# 12. Streaming agent — the core flow
print("\n--- Testing streaming agent (core flow) ---")
url = BASE + "/api/agent/stream"
body = json.dumps({"message": "reply with exactly: audit-ok", "session_id": None}).encode()
r = urllib.request.Request(url, data=body, method="POST")
r.add_header("Content-Type", "application/json")
stream_ok = False
got_token = False
got_done = False
done_session_id = None
critique_present = False
tokens = []
t0 = time.time()
try:
    with urllib.request.urlopen(r, timeout=120) as resp:
        for line in resp:
            line = line.decode().strip()
            if not line.startswith("data:"):
                continue
            payload = line[5:].strip()
            if not payload:
                continue
            try:
                evt = json.loads(payload)
            except Exception:
                continue
            t = evt.get("type")
            if t == "token":
                got_token = True
                tokens.append(evt.get("content", ""))
            elif t == "done":
                got_done = True
                done_session_id = evt.get("session_id")
                if "critique_score" in evt:
                    critique_present = True
            elif t == "error":
                rec("stream_error_event", False, f"error event: {evt}")
    stream_ok = got_token and got_done
except Exception as e:
    rec("stream_exception", False, str(e))
elapsed = round(time.time() - t0, 1)
full = "".join(tokens)
rec("stream_tokens", got_token, f"received {len(tokens)} token events in {elapsed}s")
rec("stream_done", got_done, f"done event received")
rec("stream_session_id", bool(done_session_id), f"done.session_id={done_session_id}")
rec("stream_critique", critique_present, f"critique_score in done event={critique_present}")
rec("stream_content", "audit-ok" in full.lower(), f"content snippet={full[:120]!r}")

# 13. Verify the streamed session persisted messages
if done_session_id:
    st, raw = req("GET", f"/api/sessions/{done_session_id}/messages?limit=100&offset=0")
    try:
        msgs = json.loads(raw)
        has_user = any(m.get("role") == "user" for m in msgs)
        has_asst = any(m.get("role") == "assistant" for m in msgs)
        rec("stream_persist", st == 200 and has_user and has_asst, f"status={st} msgs={len(msgs)} user={has_user} asst={has_asst}")
    except Exception as e:
        rec("stream_persist", False, f"status={st} parse_error={e}")

# 14. DB integrity — ghost sessions
dbp = os.path.expanduser("~/.artimis/artimis.db")
try:
    conn = sqlite3.connect(dbp)
    conn.row_factory = sqlite3.Row
    total = conn.execute("SELECT COUNT(*) c FROM sessions").fetchone()["c"]
    ghosts = conn.execute("SELECT COUNT(*) c FROM sessions WHERE id NOT IN (SELECT DISTINCT session_id FROM messages WHERE session_id IS NOT NULL)").fetchone()["c"]
    empty_named = conn.execute("SELECT COUNT(*) c FROM sessions WHERE name IS NULL OR name=''").fetchone()["c"]
    rec("db_ghost_sessions", ghosts == 0, f"total={total} ghosts(no msgs)={ghosts} empty_name={empty_named}")
    # table list
    tables = [r["name"] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()]
    rec("db_tables", True, f"tables={tables}")
    conn.close()
except Exception as e:
    rec("db_integrity", False, str(e))

# Summary
print("\n===== AUDIT SUMMARY =====")
passed = sum(1 for _, ok, _ in results if ok)
failed = [n for n, ok, _ in results if not ok]
print(f"PASSED: {passed}/{len(results)}")
if failed:
    print("FAILED:", ", ".join(failed))
else:
    print("All checks passed.")
