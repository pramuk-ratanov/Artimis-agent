"""API-key / origin middleware matrix.

Threat model: the UI (browser, allowed origin) must keep working without a key.
Foreign browser origins are always rejected. Non-browser clients (curl, scripts)
must present ARTIMIS_API_KEY when one is configured.
"""
import sys
from pathlib import Path

from fastapi.testclient import TestClient

REPO_ROOT = Path(__file__).resolve().parents[1]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

ALLOWED = "http://100.95.117.9:7002"
EVIL = "http://evil.example.com"


def _client(monkeypatch, tmp_path, api_key=None):
    from artimis.db import schema
    from artimis.api import server

    monkeypatch.setattr(schema, "DB_PATH", str(tmp_path / "artimis.db"))
    monkeypatch.setattr(server, "_FILES_DIR", str(tmp_path / "files"))
    if api_key is None:
        monkeypatch.delenv("ARTIMIS_API_KEY", raising=False)
    else:
        monkeypatch.setenv("ARTIMIS_API_KEY", api_key)
    # Prevent the real ~/.artimis/.env from leaking a key into the test
    monkeypatch.setattr(server, "_read_env_file", lambda: {})
    schema.init_db()
    return TestClient(server.app, raise_server_exceptions=False)


def test_allowed_origin_browser_works_without_key(monkeypatch, tmp_path):
    c = _client(monkeypatch, tmp_path, api_key="test-secret-key")
    r = c.get("/api/memories", headers={"Origin": ALLOWED})
    assert r.status_code == 200, r.text


def test_foreign_origin_rejected_even_with_no_key_configured(monkeypatch, tmp_path):
    c = _client(monkeypatch, tmp_path, api_key=None)
    r = c.get("/api/memories", headers={"Origin": EVIL})
    assert r.status_code == 403


def test_foreign_origin_rejected_with_key_configured(monkeypatch, tmp_path):
    c = _client(monkeypatch, tmp_path, api_key="test-secret-key")
    r = c.get("/api/memories", headers={"Origin": EVIL, "X-API-Key": "test-secret-key"})
    assert r.status_code == 403


def test_non_browser_client_requires_key(monkeypatch, tmp_path):
    c = _client(monkeypatch, tmp_path, api_key="test-secret-key")
    assert c.get("/api/memories").status_code == 401
    assert c.get("/api/sessions").status_code == 401
    ok = c.get("/api/memories", headers={"X-API-Key": "test-secret-key"})
    assert ok.status_code == 200
    ok2 = c.get("/api/memories", headers={"Authorization": "Bearer test-secret-key"})
    assert ok2.status_code == 200


def test_non_browser_open_when_no_key_configured(monkeypatch, tmp_path):
    c = _client(monkeypatch, tmp_path, api_key=None)
    assert c.get("/api/memories").status_code == 200


def test_health_always_open(monkeypatch, tmp_path):
    c = _client(monkeypatch, tmp_path, api_key="test-secret-key")
    assert c.get("/api/health").status_code == 200
