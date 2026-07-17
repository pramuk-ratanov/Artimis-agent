import sys
from pathlib import Path

from fastapi.testclient import TestClient

REPO_ROOT = Path(__file__).resolve().parents[1]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))


def _isolated_app(monkeypatch, tmp_path):
    from artimis.db import schema
    from artimis.api import server

    monkeypatch.setattr(schema, "DB_PATH", str(tmp_path / "artimis.db"))
    monkeypatch.setattr(server, "_FILES_DIR", str(tmp_path / "files"))
    schema.init_db()
    return server.app


def test_custom_agent_crud_does_not_500_or_lock_database(monkeypatch, tmp_path):
    app = _isolated_app(monkeypatch, tmp_path)
    client = TestClient(app, raise_server_exceptions=False)

    create = client.post(
        "/api/agents",
        json={
            "name": "Audit Agent",
            "description": "temporary test agent",
            "model": "deepseek-v4-pro",
            "system_prompt": "You are a test agent.",
        },
    )

    assert create.status_code == 200, create.text
    agent_id = create.json()["id"]

    update = client.patch(
        f"/api/agents/{agent_id}",
        json={"description": "updated test agent", "active": 0},
    )
    assert update.status_code == 200, update.text
    assert update.json()["description"] == "updated test agent"
    assert update.json()["active"] == 0

    # Proves the write transaction was committed/closed and did not lock SQLite.
    session = client.post("/api/sessions", json={"mode": "agent", "model": "deepseek-v4-pro"})
    assert session.status_code == 200, session.text

    delete = client.delete(f"/api/agents/{agent_id}")
    assert delete.status_code == 200, delete.text
    assert delete.json() == {"deleted": True}


def test_file_upload_download_delete_round_trip(monkeypatch, tmp_path):
    app = _isolated_app(monkeypatch, tmp_path)
    client = TestClient(app, raise_server_exceptions=False)

    upload = client.post(
        "/api/files/upload",
        files={"files": ("audit.txt", b"artimis audit file\n", "text/plain")},
    )

    assert upload.status_code == 200, upload.text
    body = upload.json()
    assert body["count"] == 1
    file_id = body["uploaded"][0]["id"]
    assert body["uploaded"][0]["original_name"] == "audit.txt"

    download = client.get(f"/api/files/{file_id}")
    assert download.status_code == 200, download.text
    assert download.content == b"artimis audit file\n"

    delete = client.delete(f"/api/files/{file_id}")
    assert delete.status_code == 200, delete.text
    assert delete.json() == {"deleted": True}

    missing = client.get(f"/api/files/{file_id}")
    assert missing.status_code == 404
