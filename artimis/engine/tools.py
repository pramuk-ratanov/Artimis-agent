import json, os, urllib.request, urllib.parse, re

TOOL_SCHEMAS = [
    {"type": "function", "function": {"name": "web_search", "description": "Search the web for current information.", "parameters": {"type": "object", "properties": {"query": {"type": "string", "description": "The search query"}}, "required": ["query"]}}},
    {"type": "function", "function": {"name": "read_file", "description": "Read a file.", "parameters": {"type": "object", "properties": {"path": {"type": "string", "description": "Absolute path"}}, "required": ["path"]}}},
    {"type": "function", "function": {"name": "write_file", "description": "Write to a file.", "parameters": {"type": "object", "properties": {"path": {"type": "string", "description": "Absolute path"}, "content": {"type": "string", "description": "Content"}}, "required": ["path", "content"]}}},
    {"type": "function", "function": {"name": "memory_search", "description": "Search memories.", "parameters": {"type": "object", "properties": {"query": {"type": "string", "description": "Search term"}}, "required": ["query"]}}},
    {"type": "function", "function": {"name": "memory_save", "description": "Save a memory.", "parameters": {"type": "object", "properties": {"content": {"type": "string", "description": "Fact to remember"}, "tags": {"type": "array", "items": {"type": "string"}, "description": "Tags"}}, "required": ["content"]}}},
]

def _ddg_search(query, max_results=5):
    results = []
    try:
        url = "https://lite.duckduckgo.com/lite/?q=" + urllib.parse.quote(query)
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=10) as resp:
            html = resp.read().decode("utf-8", errors="ignore")
        link_matches = re.findall('<a[^>]*?uddg=([^"&]+)[^>]*?>(.*?)</a>', html, re.DOTALL)
        snippet_matches = re.findall('<td[^>]*?class="[^"]*?result-snippet[^"]*?"[^>]*?>(.*?)</td>', html, re.DOTALL)
        if not snippet_matches:
            all_tds = re.findall('<td[^>]*?>(.*?)</td>', html, re.DOTALL)
            snippet_matches = [t for t in all_tds if len(re.sub('<[^>]+>', '', t).strip()) > 30 and 'uddg=' not in t]
        for i, (href_encoded, title_html) in enumerate(link_matches):
            if i >= max_results: break
            title = re.sub('<[^>]+>', '', title_html).strip()
            if not title or len(title) < 3: continue
            href = urllib.parse.unquote(href_encoded)
            snippet = ""
            if i < len(snippet_matches): snippet = re.sub('<[^>]+>', '', snippet_matches[i]).strip()[:400]
            results.append({"title": title, "url": href, "snippet": snippet})
    except Exception: pass
    return results

def handle_web_search(args):
    query = args.get("query", "")
    if not query: return json.dumps({"error": "No query provided"})
    results = _ddg_search(query)
    if not results: return json.dumps({"query": query, "results": [], "note": "No results found."})
    return json.dumps({"query": query, "results": results})

def handle_read_file(args):
    path = args.get("path", "")
    if not path: return json.dumps({"error": "No path provided"})
    try:
        with open(os.path.expanduser(path), "r") as f:
            content = f.read(5000)
            truncated = len(content) == 5000 and f.read(1) != ""
        return json.dumps({"path": path, "content": content, "truncated": truncated})
    except FileNotFoundError: return json.dumps({"error": "File not found: " + path})
    except Exception as e: return json.dumps({"error": str(e)})

def handle_write_file(args):
    path = args.get("path", ""); content = args.get("content", "")
    if not path: return json.dumps({"error": "No path provided"})
    try:
        expanded = os.path.expanduser(path)
        os.makedirs(os.path.dirname(expanded) or ".", exist_ok=True)
        with open(expanded, "w") as f: f.write(content)
        return json.dumps({"path": path, "written": True, "bytes": len(content)})
    except Exception as e: return json.dumps({"error": str(e)})

def handle_memory_search(args):
    try:
        from artimis.db.manager import list_memories
        results = list_memories(search=args.get("query", ""))
        return json.dumps({"query": args.get("query"), "count": len(results), "results": [{"content": m["content"], "tags": m["tags"]} for m in results[:10]]})
    except Exception as e: return json.dumps({"error": str(e)})

def handle_memory_save(args):
    try:
        from artimis.db.manager import create_memory
        mem = create_memory(content=args.get("content", ""), tags=args.get("tags", []))
        return json.dumps({"saved": True, "id": mem["id"], "content": args.get("content")})
    except Exception as e: return json.dumps({"error": str(e)})

TOOL_HANDLERS = {"web_search": handle_web_search, "read_file": handle_read_file, "write_file": handle_write_file, "memory_search": handle_memory_search, "memory_save": handle_memory_save}

def execute_tool(name, args):
    handler = TOOL_HANDLERS.get(name)
    if not handler: return json.dumps({"error": "Unknown tool: " + name})
    try: return handler(args)
    except Exception as e: return json.dumps({"error": "Tool execution failed: " + str(e)})
