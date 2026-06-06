import re, os

api_ts = open("web/src/lib/api.ts").read()
server_py = open("artimis/api/server.py").read()

calls = []
for line in api_ts.split("\n"):
    m = re.search(r'fetchJSON.*?"([^"]+)"', line)
    if m:
        url = m.group(1)
        method_match = re.search(r"method:\s*'([^']+)'", line) or re.search(r'method:\s*"([^"]+)"', line)
        method = method_match.group(1) if method_match else "GET"
        calls.append({"method": method, "url": url})

routes = []
for line in server_py.split("\n"):
    m = re.search(r'@\w+\.(get|post|patch|delete|put)\s*\(\s*"([^"]+)"', line)
    if m:
        routes.append({"method": m.group(1).upper(), "path": m.group(2)})

issues = 0
for c in calls:
    found = False
    base = c["url"].split("?")[0]
    for r in routes:
        pattern = "^" + re.sub(r"\{[^}]+\}", r"[^/]+", r["path"]) + "$"
        if re.match(pattern, base) and r["method"] == c["method"]:
            found = True
            break
    if not found:
        print(f"MISMATCH: {c['method']} {c['url']}")
        issues += 1

for r in routes:
    used = any(
        re.match("^" + re.sub(r"\{[^}]+\}", r"[^/]+", r["path"]) + "$", c["url"].split("?")[0])
        and c["method"] == r["method"]
        for c in calls
    )
    if not used:
        print(f"UNUSED: {r['method']:6s} {r['path']}")

print(f"Frontend calls: {len(calls)}")
print(f"Backend routes: {len(routes)}")
print(f"Mismatches: {issues}")

files = [
    "web/src/components/panels/intelligence-panel.tsx",
    "web/src/components/panels/memories-panel.tsx",
    "web/src/components/panels/deep-research-panel.tsx",
    "web/src/components/panels/gallery-panel.tsx",
    "web/src/components/panels/notes-panel.tsx",
    "web/src/components/panels/tasks-panel.tsx",
    "web/src/components/panels/skills-panel.tsx",
    "web/src/components/panels/theme-panel.tsx",
    "web/src/components/panels/settings-modal.tsx",
    "web/src/components/living-signal.tsx",
    "web/src/components/artimis-sidebar.tsx",
    "web/src/components/home-state.tsx",
    "web/src/components/intro-screen.tsx",
    "web/src/components/command-palette.tsx",
    "web/src/components/ui/chat-ui.tsx",
    "web/src/lib/api.ts",
]
missing = [f for f in files if not os.path.exists(f)]
if missing:
    print(f"MISSING: {missing}")
else:
    print("All 16 required files present")

# Check ChatUI features
chatui = open("web/src/components/ui/chat-ui.tsx").read()
app_tsx = open("web/src/App.tsx").read()

checks = [
    ("Streaming simulation", "StreamingMessage" in chatui),
    ("Markdown rendering", "renderMarkdown" in chatui),
    ("Tool call blocks", "tool_calls" in chatui),
    ("Hover affordances", "group-hover" in chatui),
    ("Loading state", "Thinking" in chatui),
    ("Cmd+K handler", "metaKey" in app_tsx),
    ("Notification polling", "getNotifications" in app_tsx and "setInterval" in app_tsx),
    ("Offline detection", "navigator.onLine" in app_tsx),
    ("Settings modal", "SettingsModal" in app_tsx),
    ("Intro persistence", "sessionStorage" in app_tsx),
]
for name, ok in checks:
    print(f"[{'PASS' if ok else 'FAIL'}] {name}")
