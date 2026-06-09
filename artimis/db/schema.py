"""
Artimis Agent — Database Schema
SQLite. Single-file. Zero dependencies beyond Python stdlib + sqlite3.
Designed for laptop-grade hardware: 500MB idle budget, no external services.
"""

import sqlite3
import os
import json
from datetime import datetime, timezone

DB_PATH = os.path.join(
    os.environ.get("ARTIMIS_HOME", os.path.expanduser("~/.artimis")),
    "artimis.db",
)


def get_db() -> sqlite3.Connection:
    """Get a connection to the Artimis database. Creates if not exists."""
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


SCHEMA = """
-- Sessions and Messages
CREATE TABLE IF NOT EXISTS sessions (
    id              TEXT PRIMARY KEY,
    name            TEXT NOT NULL DEFAULT 'New Chat',
    mode            TEXT NOT NULL DEFAULT 'agent' CHECK(mode IN ('agent', 'chat')),
    model           TEXT,
    status          TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'archived', 'background')),
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS messages (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id      TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    role            TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'tool', 'system')),
    content         TEXT,
    tool_calls      TEXT,  -- JSON array of tool call objects
    tool_call_id    TEXT,  -- For tool results
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id, id);

-- Brain: Memories
CREATE TABLE IF NOT EXISTS memories (
    id              TEXT PRIMARY KEY,
    content         TEXT NOT NULL,
    tags            TEXT NOT NULL DEFAULT '[]',  -- JSON array
    pinned          INTEGER NOT NULL DEFAULT 0 CHECK(pinned IN (0, 1)),
    use_count       INTEGER NOT NULL DEFAULT 0,
    source          TEXT NOT NULL DEFAULT 'auto' CHECK(source IN ('auto', 'manual')),
    active          INTEGER NOT NULL DEFAULT 0 CHECK(active IN (0, 1)),
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_memories_tags ON memories(tags);
CREATE INDEX IF NOT EXISTS idx_memories_active ON memories(active);

-- Brain: Skills (auto-updating, versioned)
CREATE TABLE IF NOT EXISTS skills (
    id              TEXT PRIMARY KEY,
    name            TEXT NOT NULL,
    version         INTEGER NOT NULL DEFAULT 1,
    content         TEXT NOT NULL,
    file_path       TEXT,
    tags            TEXT NOT NULL DEFAULT '[]',
    use_count       INTEGER NOT NULL DEFAULT 0,
    pinned          INTEGER NOT NULL DEFAULT 0 CHECK(pinned IN (0, 1)),
    auto_updated    INTEGER NOT NULL DEFAULT 0 CHECK(auto_updated IN (0, 1)),
    active          INTEGER NOT NULL DEFAULT 0 CHECK(active IN (0, 1)),
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS skill_versions (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    skill_id        TEXT NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
    version         INTEGER NOT NULL,
    content         TEXT NOT NULL,
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_skill_versions_skill ON skill_versions(skill_id, version DESC);

-- Tasks (multi-phase, autonomous)
CREATE TABLE IF NOT EXISTS tasks (
    id              TEXT PRIMARY KEY,
    session_id      TEXT REFERENCES sessions(id) ON DELETE SET NULL,
    title           TEXT NOT NULL,
    description     TEXT,
    status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK(status IN ('pending','in_progress','paused','completed','cancelled')),
    phase           TEXT NOT NULL DEFAULT 'triage'
                    CHECK(phase IN ('triage','research','execution','review','complete')),
    phase_data      TEXT,  -- JSON: partial results per phase
    priority        TEXT NOT NULL DEFAULT 'medium' CHECK(priority IN ('low','medium','high')),
    research_gated  INTEGER NOT NULL DEFAULT 0 CHECK(research_gated IN (0, 1)),
    retry_count     INTEGER NOT NULL DEFAULT 0,
    max_retries     INTEGER NOT NULL DEFAULT 3,
    last_activity   TEXT,
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    completed_at    TEXT
);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_session ON tasks(session_id);
CREATE INDEX IF NOT EXISTS idx_tasks_stale ON tasks(status, last_activity);

-- Notes / Documents
CREATE TABLE IF NOT EXISTS notes (
    id              TEXT PRIMARY KEY,
    session_id      TEXT REFERENCES sessions(id) ON DELETE SET NULL,
    title           TEXT NOT NULL,
    content         TEXT NOT NULL DEFAULT '',
    version_count   INTEGER NOT NULL DEFAULT 1,
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Gallery (generated images)
CREATE TABLE IF NOT EXISTS gallery (
    id              TEXT PRIMARY KEY,
    session_id      TEXT REFERENCES sessions(id) ON DELETE SET NULL,
    prompt          TEXT NOT NULL,
    file_path       TEXT NOT NULL,
    thumbnail_path  TEXT,
    width           INTEGER,
    height          INTEGER,
    model           TEXT,
    quality_pass    INTEGER NOT NULL DEFAULT 0 CHECK(quality_pass IN (0, 1)),
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Cookbook: Prompt Templates
CREATE TABLE IF NOT EXISTS cookbook_templates (
    id              TEXT PRIMARY KEY,
    name            TEXT NOT NULL,
    description     TEXT,
    prompt          TEXT NOT NULL,
    variables       TEXT NOT NULL DEFAULT '[]',  -- JSON array of {variable_name}
    tags            TEXT NOT NULL DEFAULT '[]',
    use_count       INTEGER NOT NULL DEFAULT 0,
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Plug-in Registry
CREATE TABLE IF NOT EXISTS plugins (
    id              TEXT PRIMARY KEY,
    name            TEXT NOT NULL,
    description     TEXT,
    version         TEXT,
    installed       INTEGER NOT NULL DEFAULT 0 CHECK(installed IN (0, 1)),
    available       INTEGER NOT NULL DEFAULT 0 CHECK(available IN (0, 1)),
    capabilities    TEXT NOT NULL DEFAULT '[]',  -- JSON array
    install_path    TEXT,
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- User Patterns (for capability discovery)
CREATE TABLE IF NOT EXISTS user_patterns (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    pattern_type    TEXT NOT NULL,  -- 'task_frequency', 'tool_usage', 'domain'
    pattern_data    TEXT NOT NULL,  -- JSON
    detected_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Custom Agents (user-defined AI personalities)
CREATE TABLE IF NOT EXISTS custom_agents (
    id              TEXT PRIMARY KEY,
    name            TEXT NOT NULL,
    description     TEXT,
    model           TEXT NOT NULL DEFAULT 'deepseek-v4-pro',
    api_key         TEXT,
    system_prompt   TEXT,
    active          INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0, 1)),
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Uploaded Files
CREATE TABLE IF NOT EXISTS files (
    id              TEXT PRIMARY KEY,
    filename        TEXT NOT NULL,
    original_name   TEXT NOT NULL,
    mime_type       TEXT,
    size_bytes      INTEGER NOT NULL DEFAULT 0,
    storage_path    TEXT NOT NULL,
    session_id      TEXT REFERENCES sessions(id) ON DELETE SET NULL,
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_files_session ON files(session_id);

-- Harness Self-Improvement
CREATE TABLE IF NOT EXISTS harness_snapshots (
    id              TEXT PRIMARY KEY,
    version         INTEGER NOT NULL,
    component       TEXT NOT NULL,  -- 'system_prompt', 'tools', 'brain', 'skills'
    content         TEXT NOT NULL,
    diff_from_prev  TEXT,           -- unified diff from previous version
    source          TEXT NOT NULL DEFAULT 'manual' CHECK(source IN ('manual','auto','experiment')),
    metrics_json    TEXT,           -- JSON: critique_scores, test_results
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_harness_version ON harness_snapshots(version DESC);

CREATE TABLE IF NOT EXISTS harness_experiments (
    id              TEXT PRIMARY KEY,
    hypothesis      TEXT NOT NULL,
    component       TEXT NOT NULL,
    before_version  INTEGER NOT NULL,
    after_version   INTEGER,        -- NULL if rejected
    test_case_ids   TEXT,           -- JSON array of test case IDs used
    outcome         TEXT NOT NULL DEFAULT 'pending' CHECK(outcome IN ('pending','applied','rejected','error')),
    score_before    REAL,           -- avg critique score before
    score_after     REAL,           -- avg critique score after
    error_message   TEXT,
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    completed_at    TEXT
);

CREATE TABLE IF NOT EXISTS test_cases (
    id              TEXT PRIMARY KEY,
    input_message   TEXT NOT NULL,
    expected_traits TEXT NOT NULL,  -- JSON: {must_contain: [...], must_not_contain: [...], min_critique_score: int}
    source_session  TEXT,           -- session where this test case was created
    use_count       INTEGER NOT NULL DEFAULT 0,
    last_used_at    TEXT,
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_test_cases_used ON test_cases(last_used_at);

-- Critique Score Trend Tracking
CREATE TABLE IF NOT EXISTS critique_history (
    id TEXT PRIMARY KEY,
    session_id TEXT,
    score INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_critique_history_created ON critique_history(created_at);
"""


def init_db():
    """Initialize the database. Safe to call multiple times — only creates if needed."""
    conn = get_db()
    conn.executescript(SCHEMA)
    conn.commit()
    conn.close()


def generate_id() -> str:
    """Generate a unique ID. Uses Python's uuid4."""
    import uuid
    return str(uuid.uuid4())


def now() -> str:
    """ISO 8601 timestamp in UTC."""
    return datetime.now(timezone.utc).isoformat()
