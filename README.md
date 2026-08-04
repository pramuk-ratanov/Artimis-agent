# Artimis Agent

A local-first, self-hosted AI agent that grows with you. Learns from every interaction, critiques its own output, regenerates weak responses, and surfaces cross-session patterns automatically.

**Not a chatbot. A thinking partner.**

## What makes Artimis different

- **Self-improving** — critiques every response, regenerates if score < 6/10, saves learnings as persistent memories
- **Cross-session awareness** — scans past sessions, memories, tasks, and skills to surface patterns you haven't noticed
- **Self-prompting** — doesn't wait to be asked; proactively flags abandoned tasks, learning patterns, and relevant skills
- **Multi-phase task execution** — triage -> research -> execution -> review -> complete, with checkpoint/resume
- **Deep research pipeline** — Planner -> Retriever -> Verifier -> Synthesizer with claim-level verification and citations
- **Three-tier intelligence** — format checking, drift detection, and LLM self-critique on every message

## Quick start

```bash
git clone https://github.com/pramuk-ratanov/Artimis-agent.git
cd Artimis-agent
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # add your API keys
python run.py --check  # verify setup
python run.py          # Web UI on http://localhost:7001
```

Or run the terminal version:

```bash
python run.py --cli
```

## Configuration

Copy `.env.example` to `.env` and fill in your keys:

| Variable | Purpose |
|----------|---------|
| `DEEPSEEK_API_KEY` | Your DeepSeek API key (model provider) |
| `ARTIMIS_API_KEY` | Any random string — used to authenticate API calls |
| `ARTIMIS_HOME` | Where data lives. Default `~/.artimis`, set `.` for project folder |
| `ARTIMIS_ALLOWED_ORIGINS` | CORS origins for the web UI (comma-separated) |

Your database, memories, skills, and uploaded files live in `ARTIMIS_HOME` (`artimis.db`, `files/`, `skills/`).

## Requirements

- Python 3.11+
- A DeepSeek API key (or configure another provider in `.env`)
- SQLite (built-in, no external database needed)

## Running

```bash
# Web UI (default)
python run.py                     # http://localhost:7001 (prints the exact URL)
python run.py --port 8080         # custom port
python run.py --host 127.0.0.1    # localhost only

# Terminal REPL
python run.py --cli

# Health check
python run.py --check
```

## Architecture

```
artimis/
  engine/
    agent.py          # Core agent loop with regeneration
    intelligence.py   # Three-tier critique + auto-memory learning
    brain.py          # Memory & skill retrieval
    curiosity.py      # Cross-session pattern detection
    deep_research.py  # Planner → Retriever → Verifier → Synthesizer
    task_runner.py    # Multi-phase background task execution
    tools.py          # Tool schemas & execution
  api/
    server.py         # FastAPI server
  db/
    schema.py         # SQLite schema
    manager.py        # CRUD operations
  web/                # React + Tailwind v4 Web UI
```

## CLI commands

```bash
python cli.py                  # New session
python cli.py --session <id>   # Resume session
python cli.py --list           # List past sessions
```

Inside the REPL: `/new`, `/sessions`, `/resume <id>`, `/memory`, `/skills`, `/help`, `/quit`.

## License

MIT
