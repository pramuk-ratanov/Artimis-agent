#!/usr/bin/env python3
"""
Artimis CLI — Terminal Agent Interface

Usage:
    python cli.py                  # Start a new session
    python cli.py --session <id>   # Resume a session
    python cli.py --list           # List past sessions

Commands inside REPL:
    /new          Start a new session
    /sessions     List past sessions
    /resume <id>  Resume a session
    /memory       Show active memories
    /skills       Show available skills
    /help         Show this help
    /quit or /q   Exit
"""

import os
import sys
import json
import readline
import time
from datetime import datetime
from pathlib import Path

# ─── Terminal colours (ANSI) ──────────────────────────────────

class c:
    RESET   = "\033[0m"
    BOLD    = "\033[1m"
    DIM     = "\033[2m"
    RED     = "\033[31m"
    GREEN   = "\033[32m"
    YELLOW  = "\033[33m"
    BLUE    = "\033[34m"
    MAGENTA = "\033[35m"
    CYAN    = "\033[36m"
    WHITE   = "\033[37m"
    GRAY    = "\033[90m"
    BG_RED  = "\033[41m"

# Ensure project is on path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from artimis.db.schema import init_db, get_db, generate_id, now
from artimis.db.manager import (
    create_session, get_session, list_sessions, rename_session,
    add_message, get_messages,
)
from artimis.engine.agent import run_agent


# ─── Session Management ───────────────────────────────────────

def start_new_session():
    """Create a new session in the database."""
    s = create_session()
    return s["id"]


def list_past_sessions():
    """Return recent sessions."""
    sessions = list_sessions()
    if not sessions:
        print(f"{c.DIM}  No past sessions found.{c.RESET}")
    else:
        print(f"\n{c.BOLD}Past sessions:{c.RESET}")
        for s in sessions[:15]:
            name = s["name"] or "untitled"
            updated = s.get("updated_at", "")[:16]
            active = f"{c.GREEN} *" if s.get("status") == "active" else "  "
            print(f"  {c.CYAN}{s['id'][:8]}{c.RESET}  {name[:50]:50s}  {c.DIM}{updated}{c.RESET}{active}")
    print()


def load_session_history(session_id):
    """Load past messages from a session as conversation history for the agent."""
    msgs = get_messages(session_id, limit=50)
    if not msgs:
        return []
    history = []
    for m in msgs:
        history.append({
            "role": m["role"],
            "content": m["content"],
        })
    return history


# ─── Display Helpers ──────────────────────────────────────────

def print_banner():
    print(f"""
{c.MAGENTA}{c.BOLD}   ╔════════════════════════════════════════════╗
   ║           A R T I M I S   A G E N T          ║
   ║         Terminal Edition  v0.1.0             ║
   ╚════════════════════════════════════════════╝{c.RESET}

{c.DIM}  Type /help for commands. /q to exit.{c.RESET}
""")

def print_tool_call(tool_name, args):
    clean_args = args[:80] + ("..." if len(args) > 80 else "")
    print(f"\n  {c.YELLOW}{c.BOLD}[TOOL]{c.RESET} {c.DIM}{tool_name}{c.RESET} {c.GRAY}{clean_args}{c.RESET}")

def print_intelligence(notes):
    if not notes:
        return
    for note in notes:
        if "Quality notes" in note:
            print(f"  {c.RED}{c.BOLD}[!]{c.RESET} {note}")
        elif "Format note" in note:
            print(f"  {c.BLUE}{c.BOLD}[FMT]{c.RESET} {note}")
        elif "Drift note" in note:
            print(f"  {c.YELLOW}{c.BOLD}[DRIFT]{c.RESET} {note}")

def print_memory_list():
    """Show active memories."""
    from artimis.db.manager import list_memories
    memories = list_memories(active=True)
    pinned = list_memories(pinned=True)
    all_ids = {m["id"] for m in memories}
    print(f"\n{c.BOLD}Active memories ({len(memories)}):{c.RESET}")
    for m in memories[:20]:
        pin = f"{c.RED}[PIN] " if m.get("pinned") else ""
        tags = json.loads(m.get("tags", "[]"))
        tag_str = f" {c.DIM}[{', '.join(tags)}]" if tags else ""
        print(f"  {pin}{m['content'][:100]}{tag_str}")
    print()

def print_skills_list():
    """Show available skills."""
    from artimis.db.manager import list_skills_db
    skills = list_skills_db()
    if not skills:
        print(f"\n{c.DIM}  No skills saved yet.{c.RESET}\n")
        return
    print(f"\n{c.BOLD}Skills ({len(skills)}):{c.RESET}")
    for s in skills[:20]:
        pinned = f"{c.RED}[PIN] " if s.get("pinned") else ""
        tags = json.loads(s.get("tags", "[]"))
        tag_str = f" {c.DIM}[{', '.join(tags)}]" if tags else ""
        print(f"  {pinned}{s['name']} (v{s['version']}){tag_str}")
    print()


# ─── Main REPL ────────────────────────────────────────────────

def repl(session_id=None, resume=False):
    """Run the Artimis terminal REPL."""

    if not session_id:
        session_id = start_new_session()
    elif resume:
        session = get_session(session_id)
        if not session:
            print(f"{c.RED}Session {session_id} not found. Starting new.{c.RESET}")
            session_id = start_new_session()

    history = load_session_history(session_id) if resume else []
    session = get_session(session_id)
    session_name = session.get("name", "Terminal Chat") if session else "Terminal Chat"

    print_banner()
    print(f"{c.DIM}Session: {session_name} ({session_id[:12]}...){c.RESET}")

    if history:
        print(f"{c.DIM}Loaded {len(history)} messages from history.{c.RESET}")
        # Show last exchange
        for msg in history[-2:]:
            prefix = f"{c.CYAN}You:{c.RESET} " if msg["role"] == "user" else f"{c.MAGENTA}Artimis:{c.RESET} "
            print(f"{prefix}{msg['content'][:200]}{'...' if len(msg['content']) > 200 else ''}")

    while True:
        try:
            user_input = input(f"\n{c.CYAN}{c.BOLD}You>{c.RESET} ").strip()
        except (KeyboardInterrupt, EOFError):
            print(f"\n{c.DIM}Exiting. Session saved.{c.RESET}")
            break

        if not user_input:
            continue

        # Handle commands
        if user_input.startswith("/"):
            parts = user_input.split()
            cmd = parts[0].lower()

            if cmd in ("/q", "/quit", "/exit"):
                print(f"{c.DIM}Exiting. Session saved.{c.RESET}")
                break

            elif cmd == "/new":
                session_id = start_new_session()
                history = []
                print(f"{c.GREEN}New session: {session_id[:12]}...{c.RESET}")

            elif cmd == "/sessions":
                list_past_sessions()

            elif cmd == "/resume" and len(parts) > 1:
                target_id = parts[1]
                s = get_session(target_id)
                if s:
                    session_id = target_id
                    history = load_session_history(session_id)
                    print(f"{c.GREEN}Resumed: {s.get('name', 'untitled')} ({target_id[:12]}...){c.RESET}")
                else:
                    print(f"{c.RED}Session not found.{c.RESET}")

            elif cmd == "/memory":
                print_memory_list()

            elif cmd == "/skills":
                print_skills_list()

            elif cmd == "/help":
                print(f"""
{c.BOLD}Commands:{c.RESET}
  /new          Start a new session
  /sessions     List past sessions
  /resume <id>  Resume a session
  /memory       Show active memories
  /skills       Show available skills
  /help         Show this help
  /quit, /q     Exit
""")
            else:
                print(f"{c.RED}Unknown command. Type /help for available commands.{c.RESET}")
            continue

        # ─── Run the agent ────────────────────────────────────
        add_message(session_id, "user", user_input)

        print()  # blank line before response

        start_time = time.time()
        result = run_agent(
            user_message=user_input,
            session_id=session_id,
            conversation_history=history,
        )

        elapsed = time.time() - start_time

        # Display response
        response_text = result["response"]
        print(f"{c.MAGENTA}{c.BOLD}Artimis:{c.RESET}")
        print(response_text)

        # Display metadata
        meta_parts = []
        if result.get("tool_calls_made"):
            meta_parts.append(f"{result['tool_calls_made']} tools")
        meta_parts.append(f"{elapsed:.1f}s")
        meta_parts.append(f"{result.get('model_used', '?')}")
        print(f"\n{c.DIM}  [{', '.join(meta_parts)}]{c.RESET}")

        # Display intelligence notes
        if result.get("intelligence"):
            print_intelligence(result["intelligence"])

        # Auto-name session on first exchange
        if len(history) == 0:
            try:
                from artimis.engine.intelligence import auto_name_session
                name = auto_name_session(session_id, user_input, response_text)
                print(f"\n{c.DIM}  Session named: \"{name}\"{c.RESET}")
            except Exception:
                pass

        # Save to history
        history.append({"role": "user", "content": user_input})
        history.append({"role": "assistant", "content": response_text})
        add_message(session_id, "assistant", response_text)

        # Trim history to last 30 messages
        if len(history) > 60:
            history = history[-60:]


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Artimis Agent — Terminal Interface")
    parser.add_argument("--session", type=str, help="Resume a session by ID")
    parser.add_argument("--list", action="store_true", help="List past sessions and exit")
    args = parser.parse_args()

    # Ensure DB is initialised
    init_db()

    if args.list:
        list_past_sessions()
        sys.exit(0)

    repl(session_id=args.session, resume=bool(args.session))
