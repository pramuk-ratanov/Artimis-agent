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
curl -fsSL https://raw.githubusercontent.com/pramuk-ratanov/Artimis-agent/main/install.sh | bash
```

Or manually:

```bash
git clone https://github.com/pramuk-ratanov/Artimis-agent.git
cd Artimis-agent
pip install -r requirements.txt
cp .env.example .env  # add your API key
python cli.py
```

## Requirements

- Python 3.11+
- A DeepSeek, OpenAI, or Anthropic API key
- SQLite (built-in, no external database needed)

## Uninstall

```bash
# Full removal (agent + all data):
bash uninstall.sh --yes

# Remove agent, keep your memories, skills, and database:
bash uninstall.sh --keep-data
```

All Artimis files live in `~/.artimis/`. No system files are modified, no launch agents installed, no PATH changes.

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
    server.py         # FastAPI server (60+ endpoints)
  db/
    schema.py         # SQLite schema
    manager.py        # CRUD operations
  web/                # React + Tailwind v4 Web UI
```

## Web UI

Start the server:

```bash
python -m uvicorn artimis.api.server:app --host 127.0.0.1 --port 7001
```

Open `http://127.0.0.1:7001` — dark signal theme, Share Tech Mono, 200px sidebar, tool panels, Cmd+K palette.

## CLI

```bash
python cli.py                  # New session
python cli.py --session <id>   # Resume session
python cli.py --list           # List past sessions
```

## License

MIT
