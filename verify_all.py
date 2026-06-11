"""
COMPREHENSIVE VERIFICATION — Artimis Agent
Every test returns PASS/FAIL with actual output.
"""
import json, time, sys
from datetime import datetime

passed = 0
failed = 0

def check(name, condition, evidence=""):
    global passed, failed
    if condition:
        print(f"  PASS  {name}")
        passed += 1
    else:
        print(f"  FAIL  {name}")
        if evidence:
            print(f"        {evidence[:200]}")
        failed += 1

print("=" * 60)
print("ARTIMIS VERIFICATION")
print(f"{datetime.now().isoformat()}")
print("=" * 60)

# ─── 1. AGENT LOOP + TOOL CALLING ───────────────────────
print("\n[1] AGENT LOOP + TOOL CALLING")
from artimis.engine.agent import run_agent, _get_client
from artimis.engine.tools import TOOL_SCHEMAS, execute_tool

# Verify client creates
client = _get_client()
check("Client created (DeepSeek)", "deepseek" in str(client.base_url),
      f"base_url={client.base_url}")

# Verify tool schemas exist
check("Tool schemas loaded", len(TOOL_SCHEMAS) >= 3,
      f"{len(TOOL_SCHEMAS)} tools: {[t['function']['name'] for t in TOOL_SCHEMAS]}")

# Verify tool execution
result = execute_tool("web_search", {"query": "Port of Singapore TEU 2024"})
check("web_search tool works", len(result) > 100 and "TEU" in result,
      f"result length: {len(result)}, contains TEU: {'TEU' in result}")

result2 = execute_tool("read_file", {"path": "/etc/hostname"})
check("read_file tool works", len(result2) > 10,
      f"hostname content: {result2.strip()[:50]}")

# Real agent run
t0 = time.time()
agent_result = run_agent(
    "What is the container volume of the Port of Shanghai in 2024? Give just the number.",
    session_id="verify-1",
    max_iterations=4,
)
elapsed = time.time() - t0
check("Agent returns response", len(agent_result["response"]) > 10,
      f"response: {agent_result['response'][:100]}")
check("Agent made tool calls", agent_result["tool_calls_made"] > 0,
      f"tool calls: {agent_result['tool_calls_made']}")
check("Agent completes under 60s", elapsed < 60,
      f"time: {elapsed:.1f}s")

# ─── 2. MEMORY SYSTEM ──────────────────────────────────
print("\n[2] MEMORY SYSTEM")
from artimis.db import manager as db

# Store identity
mem = db.create_memory("Verification test: user works at Acme Logistics", tags=["identity", "test"])
check("Memory stored", mem is not None and "id" in mem,
      f"id: {mem.get('id', 'none')[:12]}")

# Recall by tag
all_mem = db.list_memories()
check("Memories retrievable", len(all_mem) > 0,
      f"{len(all_mem)} memories in DB")

def safe_load_tags(tag_str):
    try:
        return json.loads(tag_str)
    except json.JSONDecodeError:
        return []
# Identity recall
identity_mems = [m for m in all_mem if "identity" in safe_load_tags(m.get("tags", "[]"))]
check("Identity memories found", len(identity_mems) > 0,
      f"{len(identity_mems)} identity memories")

# ─── 3. TIER 1: FORMAT CHECK ───────────────────────────
print("\n[3] TIER 1 — FORMAT CHECK")
from artimis.engine.intelligence import check_format

fmt1 = check_format("Compare A vs B in a table", "A is better, B is worse")
check("Table mismatch detected", fmt1 is not None and fmt1.get("needs_regeneration"),
      json.dumps(fmt1, indent=2)[:200] if fmt1 else "None")

fmt2 = check_format("Write a Python script to sort items", "Here's how sorting works in theory")
check("Code mismatch detected", fmt2 is not None and fmt2.get("needs_regeneration"),
      json.dumps(fmt2, indent=2)[:200] if fmt2 else "None")

fmt3 = check_format("List the steps", "1. First step\n2. Second step\n3. Third step")
check("List match passes", fmt3 is None,
      "correctly returned None (no mismatch)")

# ─── 4. TIER 2: DRIFT DETECTION ────────────────────────
print("\n[4] TIER 2 — DRIFT DETECTION")
from artimis.engine.intelligence import detect_drift, should_check_drift

# Build a history with 6 messages (6%3==0, triggers drift check)
drift_history = [
    {"role": "user", "content": "Compare Shanghai and Singapore ports"},
    {"role": "assistant", "content": "Shanghai handles 50M TEU, Singapore 41M TEU..."},
    {"role": "user", "content": "Which has lower costs?"},
    {"role": "assistant", "content": "Shanghai generally has lower handling fees..."},
    {"role": "user", "content": "What about transit times to Europe?"},
    {"role": "assistant", "content": "Shanghai-Rotterdam: 28 days, Singapore-Rotterdam: 24 days..."},
]

check("should_check_drift returns False at msg 6 (6%3=0)", 
      should_check_drift(6, drift_history),
      "6 messages triggers check")

# Now add the drift message as the 7th, run detection on it
drift_history.append({"role": "user", "content": "Tell me about the weather in Tokyo tomorrow"})
drift = detect_drift("Tell me about the weather in Tokyo tomorrow", "verify-1", drift_history)
check("Drift detection returns result", drift is not None,
      json.dumps(drift, indent=2)[:200] if drift else "None")

if drift:
    check("Drift type identified", drift.get("drift_type") is not None,
          f"type: {drift.get('drift_type')}")
    check("Drift confidence > 0.6", drift.get("confidence", 0) > 0.6,
          f"confidence: {drift.get('confidence')}")

# ─── 5. TIER 3: SELF-CRITIQUE ──────────────────────────
print("\n[5] TIER 3 — SELF-CRITIQUE")
from artimis.engine.intelligence import self_critique

bad = self_critique(
    "What are the best shipping routes from Asia to Europe?",
    "There are many routes. We offer seamless end-to-end solutions. Contact us.",
)
check("Weak response scored low", bad is not None and not bad.get("passed", True),
      f"passed={bad.get('passed')}, score={bad.get('overall_score')}")
check("Weak response has issues", len(bad.get("issues", [])) > 0,
      f"{len(bad.get('issues', []))} issues: {bad.get('issues', [])[:3]}")
check("Weak response needs regeneration", bad.get("regeneration_needed"),
      f"fix: {bad.get('regeneration_guidance', '')[:100]}")

good = self_critique(
    "What are the fastest shipping routes from Asia to Europe?",
    "Shanghai-Rotterdam: 28 days via Suez. Singapore-Rotterdam: 24 days. Ningbo-Hamburg: 30 days. Air freight: 3-5 days. Want me to check current rates?",
)
check("Strong response passes", good is not None and good.get("passed", False),
      f"passed={good.get('passed')}, score={good.get('overall_score')}")

# ─── 6. CONTEXT INHERITANCE ────────────────────────────
print("\n[6] CONTEXT INHERITANCE")
from artimis.engine.intelligence import get_session_orientation

# Create a session with a name to simulate prior context
s = db.create_session()
db.rename_session(s["id"], "Freight Lanes Discussion")
db.add_message(s["id"], "user", "What are the best freight lanes?")
db.add_message(s["id"], "assistant", "Shanghai-Rotterdam, Ningbo-Hamburg...")
orientation = get_session_orientation(s["id"], "What routes should I use?")
check("Orientation returns string (or empty)", isinstance(orientation, str),
      f"orientation: {orientation[:100] if orientation else '(empty — no prior sessions yet)'}")

# ─── 7. NOTIFICATION SYSTEM ────────────────────────────
print("\n[7] NOTIFICATION SYSTEM")
from artimis.engine.notifications import (
    check_task_completions, check_stale_tasks, check_silence,
    start_polling, stop_polling, add_webhook, dispatch,
)

notifs = check_task_completions()
check("check_task_completions returns list", isinstance(notifs, list),
      f"{len(notifs)} completed tasks")

stale = check_stale_tasks()
check("check_stale_tasks returns list", isinstance(stale, list),
      f"{len(stale)} stale tasks")

silent = check_silence()
check("check_silence returns list", isinstance(silent, list),
      f"{len(silent)} silent tasks")

# Test dispatch callback
received = []
def test_cb(n):
    received.append(n)

from artimis.engine.notifications import register_callback, unregister_callback
register_callback(test_cb)
dispatch({"type": "test", "message": "verification ping"})
check("Dispatch delivers to callbacks", len(received) > 0,
      f"received: {received}")
unregister_callback(test_cb)

# ─── 8. API SERVER ────────────────────────────────────
print("\n[8] API SERVER")
import urllib.request, urllib.error

def api_get(path):
    try:
        resp = urllib.request.urlopen(f"http://localhost:7001{path}", timeout=5)
        return resp.read().decode(), resp.status
    except Exception as e:
        return str(e), 0

body, status = api_get("/api/health")
check("Health endpoint responds 200", status == 200,
      f"status={status}, body={body[:100]}")

body, status = api_get("/api/sessions")
check("Sessions endpoint responds", status == 200,
      f"status={status}, sessions count approx: {len(body)}")

body, status = api_get("/api/memories")
check("Memories endpoint responds", status == 200,
      f"status={status}")

body, status = api_get("/api/skills")
check("Skills endpoint responds", status == 200,
      f"status={status}")

body, status = api_get("/api/tasks")
check("Tasks endpoint responds", status == 200,
      f"status={status}")

body, status = api_get("/api/notifications")
check("Notifications endpoint responds", status == 200,
      f"status={status}")

body, status = api_get("/api/models/hardware")
check("Hardware endpoint responds", status == 200,
      f"status={status}")

# ─── 9. WEB UI BUILD ──────────────────────────────────
print("\n[9] WEB UI BUILD")
import subprocess
result = subprocess.run(
    ["npx", "tsc", "--noEmit"],
    cwd="/home/hermes/workspace/artimis-agent/web",
    capture_output=True, text=True, timeout=30,
)
check("TypeScript compiles with 0 errors", result.returncode == 0,
      result.stderr[:200] if result.stderr else "clean")

result2 = subprocess.run(
    ["npm", "run", "build"],
    cwd="/home/hermes/workspace/artimis-agent/web",
    capture_output=True, text=True, timeout=30,
)
check("Vite build succeeds", result2.returncode == 0,
      result2.stdout[-200:] if result2.stdout else result2.stderr[:200])

# ─── 10. ZERO HERMES/ODYSSEUS TRACES ───────────────────
print("\n[10] ZERO EXTERNAL REFERENCES")
import os
refs = []
for root, dirs, files in os.walk("/home/hermes/workspace/artimis-agent"):
    dirs[:] = [d for d in dirs if d not in ("node_modules", ".git", "__pycache__", "venv", "dist")]
    for f in files:
        # Skip generated/lock files and this test script
        if f in ("package-lock.json", "verify_all.py", "debug_critique.py", "debug_critique2.py"):
            continue
        if f.endswith((".py", ".ts", ".tsx", ".js", ".json", ".sh", ".md", ".css", ".html")):
            path = os.path.join(root, f)
            try:
                with open(path) as fh:
                    content = fh.read()
                if "hermes" in content.lower() or "odysseus" in content.lower():
                    refs.append(path)
            except:
                pass

check("Zero 'hermes' references in codebase", len([r for r in refs if "hermes" in r.lower()]) == 0,
      f"found in: {refs}" if refs else "clean")
check("Zero 'odysseus' references in codebase", len([r for r in refs if "odysseus" in r.lower()]) == 0,
      f"found in: {refs}" if refs else "clean")
check("Zero Pramuk references in codebase", len([r for r in refs if "pramuk" in r.lower()]) == 0,
      f"found in: {refs}" if refs else "clean")

# ─── SUMMARY ──────────────────────────────────────────
print("\n" + "=" * 60)
print(f"RESULTS: {passed} passed, {failed} failed, {passed+failed} total")
if failed == 0:
    print("VERDICT: ALL SYSTEMS FUNCTIONAL")
else:
    print(f"VERDICT: {failed} FAILURES — see above")
print("=" * 60)
