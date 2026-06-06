"""
Artimis Agent — Plug-in Manager

Tracks installed and available plug-ins. The agent can suggest relevant plug-ins
based on user task patterns (plug-in awareness).
"""

import json
import os
from typing import Optional
from artimis.db.schema import get_db, generate_id, now


PLUGIN_REGISTRY = [
    {
        "name": "stable-diffusion",
        "description": "High-quality photorealistic image generation via Stability AI",
        "capabilities": ["image_generation", "photorealism"],
        "install_cmd": "pip install stability-sdk",
    },
    {
        "name": "ollama-local",
        "description": "Run language models locally via Ollama — fully private, no API keys",
        "capabilities": ["local_llm", "privacy"],
        "install_cmd": "curl -fsSL https://ollama.com/install.sh | sh",
    },
    {
        "name": "whisper-stt",
        "description": "Local speech-to-text via OpenAI Whisper — no internet needed",
        "capabilities": ["speech_to_text", "voice"],
        "install_cmd": "pip install openai-whisper",
    },
    {
        "name": "browser-automation",
        "description": "Full browser control via Playwright — extract data, fill forms, take screenshots",
        "capabilities": ["browser", "automation", "scraping"],
        "install_cmd": "pip install playwright && playwright install chromium",
    },
    {
        "name": "email-client",
        "description": "Send and receive emails directly from Artimis",
        "capabilities": ["email", "communication"],
        "install_cmd": "pip install aiosmtplib",
    },
    {
        "name": "pdf-tools",
        "description": "Read, create, and edit PDF documents",
        "capabilities": ["document", "pdf"],
        "install_cmd": "pip install pymupdf reportlab",
    },
    {
        "name": "data-analysis",
        "description": "Pandas, numpy, matplotlib — analyze data and create charts",
        "capabilities": ["data", "analysis", "charts"],
        "install_cmd": "pip install pandas numpy matplotlib",
    },
]


def init_plugin_registry():
    """Populate the plugin registry table with known plugins."""
    conn = get_db()
    for plugin in PLUGIN_REGISTRY:
        existing = conn.execute(
            "SELECT id FROM plugins WHERE name = ?", (plugin["name"],)
        ).fetchone()
        if not existing:
            conn.execute(
                """INSERT INTO plugins (id, name, description, version, installed, available, capabilities)
                   VALUES (?, ?, ?, ?, 0, 1, ?)""",
                (generate_id(), plugin["name"], plugin["description"],
                 plugin.get("version", "1.0.0"),
                 json.dumps(plugin["capabilities"]))
            )
    conn.commit()
    conn.close()


def list_plugins(installed_only: bool = False) -> list[dict]:
    """List all plugins, optionally filtering to installed only."""
    conn = get_db()
    if installed_only:
        rows = conn.execute(
            "SELECT * FROM plugins WHERE installed = 1 ORDER BY name"
        ).fetchall()
    else:
        rows = conn.execute("SELECT * FROM plugins ORDER BY installed DESC, name").fetchall()
    conn.close()
    return [dict(r) for r in rows]


def install_plugin(plugin_name: str) -> Optional[dict]:
    """Mark a plugin as installed and return its info."""
    conn = get_db()
    row = conn.execute(
        "SELECT * FROM plugins WHERE name = ?", (plugin_name,)
    ).fetchone()
    if not row:
        conn.close()
        return None

    conn.execute(
        "UPDATE plugins SET installed = 1 WHERE name = ?", (plugin_name,)
    )
    conn.commit()
    conn.close()
    return dict(row)


def get_install_command(plugin_name: str) -> Optional[str]:
    """Get the install command for a plugin."""
    for p in PLUGIN_REGISTRY:
        if p["name"] == plugin_name:
            return p["install_cmd"]
    return None


def suggest_plugins(user_message: str) -> list[dict]:
    """
    Suggest relevant plugins based on user's message/task.
    This is the 'plug-in awareness' feature.
    """
    msg_lower = user_message.lower()

    capability_map = {
        "image": ["image_generation"],
        "generate": ["image_generation"],
        "photo": ["image_generation"],
        "picture": ["image_generation"],
        "private": ["local_llm", "privacy"],
        "offline": ["local_llm", "privacy"],
        "local model": ["local_llm"],
        "voice": ["speech_to_text"],
        "speech": ["speech_to_text"],
        "transcribe": ["speech_to_text"],
        "browser": ["browser"],
        "scrape": ["browser", "automation"],
        "extract": ["browser", "automation"],
        "email": ["email"],
        "mail": ["email"],
        "pdf": ["pdf", "document"],
        "document": ["pdf", "document"],
        "data": ["data", "analysis"],
        "chart": ["data", "charts"],
        "analyze": ["data", "analysis"],
        "graph": ["data", "charts"],
    }

    needed_capabilities = set()
    for keyword, caps in capability_map.items():
        if keyword in msg_lower:
            needed_capabilities.update(caps)

    if not needed_capabilities:
        return []

    # Find plugins that match needed capabilities and are not yet installed
    conn = get_db()
    all_plugins = conn.execute(
        "SELECT * FROM plugins WHERE installed = 0 AND available = 1"
    ).fetchall()
    conn.close()

    suggestions = []
    for plugin in all_plugins:
        plugin = dict(plugin)
        caps = json.loads(plugin.get("capabilities", "[]"))
        if any(c in needed_capabilities for c in caps):
            suggestions.append(plugin)

    return suggestions[:3]
