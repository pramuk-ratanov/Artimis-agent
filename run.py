#!/usr/bin/env python3
"""
Artimis Agent — Entry Point

Usage:
    python run.py                  # Start Web UI server
    python run.py --cli            # Terminal REPL mode
    python run.py --host 0.0.0.0   # Bind to specific host
    python run.py --port 8080      # Use specific port
    python run.py --version        # Print version and exit
    python run.py --check          # Health check: verifies setup, prints status
"""

import os
import sys
import argparse
import signal

# Ensure project root is on path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from artimis.db.schema import init_db

VERSION = "0.1.0"


def _check_setup():
    """Verify the installation is healthy. Returns (ok, messages)."""
    messages = []
    status = True

    # Check .env
    env_file = os.path.expanduser("~/.artimis/.env")
    if os.path.exists(env_file):
        with open(env_file) as f:
            has_key = any(
                line.strip() and not line.strip().startswith("#") and "=" in line
                for line in f
            )
        if has_key:
            messages.append("[ok] .env file found with configuration")
        else:
            messages.append("[warn] .env file exists but no keys configured")
            status = False
    else:
        messages.append("[error] No .env file at ~/.artimis/.env — create one with your API key")
        status = False

    # Check DB
    try:
        init_db()
        messages.append("[ok] Database initialized")
    except Exception as e:
        messages.append(f"[error] Database init failed: {e}")
        status = False

    # Check can import engine
    try:
        from artimis.engine.agent import run_agent
        messages.append("[ok] Agent engine importable")
    except Exception as e:
        messages.append(f"[warn] Agent engine import failed: {e}")
        status = False

    return status, messages


def main():
    parser = argparse.ArgumentParser(description="Artimis Agent")
    parser.add_argument("--cli", action="store_true", help="Run in terminal REPL mode")
    parser.add_argument("--host", type=str, default="0.0.0.0", help="Host to bind (default: 0.0.0.0)")
    parser.add_argument("--port", type=int, default=7001, help="Port to bind (default: 7001)")
    parser.add_argument("--reload", action="store_true", help="Enable auto-reload (dev mode)")
    parser.add_argument("--version", action="store_true", help="Print version and exit")
    parser.add_argument("--check", action="store_true", help="Health check: verify setup and exit")
    args = parser.parse_args()

    if args.version:
        print(f"Artimis Agent v{VERSION}")
        return

    if args.check:
        ok, messages = _check_setup()
        for msg in messages:
            print(f"  {msg}")
        if ok:
            print("\n  All checks passed.")
        else:
            print("\n  Some checks failed. Fix the issues above before starting.")
        return

    # Signal handling for graceful shutdown
    _shutdown_flag = False

    def _on_shutdown(signum, frame):
        nonlocal _shutdown_flag
        if _shutdown_flag:
            return  # Already shutting down
        _shutdown_flag = True
        print("\n  Shutting down gracefully...")
        sys.exit(0)

    signal.signal(signal.SIGTERM, _on_shutdown)
    signal.signal(signal.SIGINT, _on_shutdown)

    # Initialize database
    init_db()
    print(f"  Database initialized at ~/.artimis/artimis.db")

    if args.cli:
        from cli import repl
        print("  Starting terminal REPL...")
        repl()
    else:
        import uvicorn
        print(f"  Starting Web UI on http://{args.host}:{args.port}")
        try:
            uvicorn.run(
                "artimis.api.server:app",
                host=args.host,
                port=args.port,
                reload=args.reload,
                log_level="info",
            )
        except OSError as e:
            if "address already in use" in str(e).lower() or "address in use" in str(e).lower():
                print(f"\n  ERROR: Port {args.port} is already in use.", file=sys.stderr)
                print(f"  Another process is already running on {args.host}:{args.port}.", file=sys.stderr)
                print(f"  To find it:  ss -tlnp | grep {args.port}", file=sys.stderr)
                print(f"  To kill it:  fuser -k {args.port}/tcp", file=sys.stderr)
                sys.exit(1)
            raise


if __name__ == "__main__":
    main()
