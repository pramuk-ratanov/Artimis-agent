# What Is Artimis

## In one line

Artimis is a local-first, self-hosted AI agent that runs entirely on your own machine, learns from every interaction, critiques and regenerates its own output, and proactively surfaces patterns across your past sessions.

**Not a chatbot. A thinking partner.**

---

## The core idea

Most AI tools are reactive. You ask, they answer, they forget. Artimis is built on the opposite premise: an agent should accumulate context about you over time, judge the quality of its own work before handing it back, and notice things you haven't asked about yet.

It combines two things that usually live in separate products:

- A **persistent agent loop** (the kind of always-on, tool-using reasoning engine found in agents like Hermes)
- A **rich workspace UI** (sessions, notes, a gallery, prompt templates, tasks — the kind of structured environment found in workspaces like Odysseus)

Everything runs on a laptop. One command to install. Zero external services. SQLite only. No system files modified, no launch agents installed, no PATH changes. All data lives in `~/.artimis/`.

---

## What makes it different

### 1. It is self-improving

After every response, Artimis runs a self-critique pass. The response is scored 1–10 and any issues are classified as critical, major, or minor. **If the score falls below 6/10, the agent regenerates the response** instead of handing back weak work. Lessons it learns get saved as persistent memories so the same mistake isn't repeated.

### 2. It is cross-session aware

Artimis continuously scans past sessions, saved memories, open tasks, and learned skills to **surface patterns you haven't noticed yourself** — recurring themes, abandoned work, connections between separate conversations.

### 3. It self-prompts

It doesn't sit and wait to be asked. It proactively flags:
- Tasks you started and abandoned
- Learning patterns it has detected in how you work
- Skills that are relevant to what you're currently doing

### 4. It executes multi-phase tasks

Background tasks move through a structured pipeline — **triage → research → execution → review → complete** — with checkpoint and resume support so work survives restarts. Tasks idle for more than 48 hours get flagged automatically.

### 5. It does deep research properly

The research pipeline is **Planner → Retriever → Verifier → Synthesizer**, with claim-level verification and citations rather than a single unchecked answer.

### 6. It has three-tier intelligence

Every message passes through layered quality control:
- **Tier 1 — Format check** (rule-based, runs on every message): validates tables, lists, code, JSON, email, and short-answer formats.
- **Tier 2 — Drift detection** (LLM, runs every 3rd message): catches topic shift, contradiction, goal change, and repetition.
- **Tier 3 — Self-critique** (LLM, runs on final output): the scoring + regeneration pass described above.

---

## How it works under the hood

### The server

- **FastAPI + Uvicorn**, running on port **7001**
- No auth — it's local-first and single-user, so there's no login screen
- Serves a static React build at the root
- 60+ API endpoints

### The database

SQLite in WAL mode at `~/.artimis/artimis.db`. Eleven tables, all UUID4 string IDs, foreign keys with CASCADE/SET NULL:

| Table | Purpose |
|-------|---------|
| `sessions` | Chat / agent sessions |
| `messages` | Conversation turns |
| `memories` | Persistent memory (pinnable, usage-tracked) |
| `skills` | Procedural knowledge (versioned) |
| `skill_versions` | Skill history for rollback |
| `tasks` | Background task execution with phase tracking |
| `notes` | Documents |
| `gallery` | Generated images |
| `cookbook_templates` | Reusable prompt templates |
| `plugins` | Plugin registry |
| `user_patterns` | Behaviour analytics |

### The agent loop

1. Select provider (DeepSeek → OpenAI → Anthropic fallback)
2. Load the system prompt
3. Inject **brain context** — relevant memories and skills are scored, sorted, and appended to the system prompt
4. Build the conversation (system + history + user message)
5. Loop, up to 10 iterations: call the model with tool access; if it calls tools, execute them and continue; if it produces a final answer, run the intelligence pipeline and return
6. Run the three-tier intelligence pipeline
7. Auto-name the session from the first exchange

### The brain (memory + skill retrieval)

Memory relevance is scored, not guessed:
- Exact phrase match: +0.4
- Word overlap: up to +0.3 (proportional)
- Pinned: +0.2
- Use count: +0.01 per use, capped at +0.1
- Recency: +0.1 with linear decay over 7 days

Identity questions ("who am I") pull all identity / fact / preference / project memories. Memories used in context are marked `active` so the UI can highlight them. New memories are created automatically via pattern matching for identity, fact, preference, project, and explicit "remember this" commands. Skills are versioned, can be rolled back, can be pinned to lock them, and are keyword-matched for relevance.

### The tools

The agent has five tools:

| Tool | What it does |
|------|-------------|
| `web_search` | DuckDuckGo Lite scraping, 5 results max |
| `read_file` | Local filesystem read (5000-char cap) |
| `write_file` | Create files, including parent directories |
| `memory_search` | Keyword search across stored memories |
| `memory_save` | Save a memory with optional tags |

---

## The web UI

A React + Tailwind v4 interface. Dark "signal" theme, Share Tech Mono typeface, 200px sidebar, tool panels, and a Cmd+K command palette.

**Design lineage:** Artimis is a sub-brand of Vital Signals. It inherits the charcoal + sky-blue "signal" DNA — sky-blue is treated as a signal, not decoration. The intended personality is a thinking partner, not a yes-machine: precise, quietly confident, a little warm. Never cute, never corporate-bland, never a cold terminal.

Start the server:

```bash
python -m uvicorn artimis.api.server:app --host 127.0.0.1 --port 7001
```

Then open `http://127.0.0.1:7001`.

---

## The intended user

A power-operator running multiple businesses (freight-forwarding logistics marketing and a web studio), who values systematic frameworks and practical outcomes, and who uses an agent to **think**, not just to execute.

---

## Installing it

One-line install:

```bash
curl -fsSL https://raw.githubusercontent.com/pramuk-ratanov/Artimis-agent/main/install.sh | bash
```

Or manually:

```bash
git clone https://github.com/pramuk-ratanov/Artimis-agent.git
cd Artimis-agent
pip install -r requirements.txt
cp .env.example .env   # add your API key
python cli.py
```

**Requirements:** Python 3.11+, a DeepSeek / OpenAI / Anthropic API key, and SQLite (built in).

### Using the CLI

```bash
python cli.py                  # new session
python cli.py --session <id>   # resume a session
python cli.py --list           # list past sessions
```

### Uninstalling

```bash
bash uninstall.sh --yes         # full removal (agent + all data)
bash uninstall.sh --keep-data   # remove agent, keep memories/skills/db
```

---

## Architecture at a glance

```
artimis/
  engine/
    agent.py          # Core agent loop with regeneration
    intelligence.py   # Three-tier critique + auto-memory learning
    brain.py          # Memory & skill retrieval
    curiosity.py      # Cross-session pattern detection
    deep_research.py  # Planner -> Retriever -> Verifier -> Synthesizer
    task_runner.py    # Multi-phase background task execution
    tools.py          # Tool schemas & execution
  api/
    server.py         # FastAPI server (60+ endpoints)
  db/
    schema.py         # SQLite schema
    manager.py        # CRUD operations
  web/                # React + Tailwind v4 Web UI
```

---

## Known design constraints

These are real limitations the system was built around, worth knowing:

- **No streaming.** Agent responses arrive as one complete JSON payload after the full loop finishes. The UI simulates a streaming feel.
- **No WebSocket.** All real-time behaviour is polling-based (30s notification interval).
- **The agent is synchronous.** A single request can take 5–60 seconds for complex queries; deep research can take 60–180 seconds. The UI must show meaningful thinking/loading states.
- **No auth by design.** Local-first, single-user — there's deliberately no login.

---

## The short version

Artimis is what you get when you stop treating an AI as a stateless question-answering box and start treating it as a long-running partner that remembers you, grades its own work, finishes what it starts, and tells you things before you ask. It runs on your hardware, owns its own data, and gets better the longer you use it.

**License:** MIT
