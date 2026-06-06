#!/usr/bin/env python3
"""
Artimis Agent — Entry Point

Usage:
    python run.py                  # Start Web UI server
    python run.py --cli            # Terminal REPL mode
    python run.py --host 0.0.0.0   # Bind to specific host
    python run.py --port 8080      # Use specific port
"""

import os
import sys
import argparse

# Ensure project root is on path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from artimis.db.schema import init_db


def main():
    parser = argparse.ArgumentParser(description="Artimis Agent")
    parser.add_argument("--cli", action="store_true", help="Run in terminal REPL mode")
    parser.add_argument("--host", type=str, default="0.0.0.0", help="Host to bind (default: 0.0.0.0)")
    parser.add_argument("--port", type=int, default=7001, help="Port to bind (default: 7001)")
    parser.add_argument("--reload", action="store_true", help="Enable auto-reload (dev mode)")
    args = parser.parse_args()

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
        uvicorn.run(
            "artimis.api.server:app",
            host=args.host,
            port=args.port,
            reload=args.reload,
            log_level="info",
        )


if __name__ == "__main__":
    main()
