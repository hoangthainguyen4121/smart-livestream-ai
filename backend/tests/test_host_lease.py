from __future__ import annotations

from datetime import datetime, timedelta, timezone
from pathlib import Path
import sys
from uuid import UUID

import pytest
from fastapi.testclient import TestClient

BACKEND_ROOT = Path(__file__).resolve().parents[1]
PROJECT_ROOT = BACKEND_ROOT.parent

for path in (BACKEND_ROOT, PROJECT_ROOT):
    path_text = str(path)
    if path_text not in sys.path:
        sys.path.insert(0, path_text)

from app.main import app  # noqa: E402
from app.services.host_lease import (  # noqa: E402
    HOST_LAST_SEEN_KEY,
    HOST_LEASE_EXPIRED_REASON,
    HOST_TOKEN_HASH_KEY,
)
from app.services.memory_live_sessions import get_memory_live_session_store  # noqa: E402
from app.settings import clear_settings_cache  # noqa: E402


@pytest.fixture()
def client(memory_mode_env: None, monkeypatch: pytest.MonkeyPatch) -> TestClient:
    monkeypatch.setenv("HOST_LEASE_GRACE_SECONDS", "180")
    clear_settings_cache()
    get_memory_live_session_store().clear()
    return TestClient(app)


def test_create_returns_host_token_once(client: TestClient) -> None:
    created = client.post(
        "/api/live-sessions",
        json={"name": "Lease Room", "room_type": "chat"},
    ).json()
    assert "host_resume_token" in created
    assert created["host_present"] is True
    listed = client.get("/api/live-sessions?status=active").json()
    assert "host_resume_token" not in listed[0]
    assert HOST_TOKEN_HASH_KEY not in listed[0]["metadata"]


def test_heartbeat_updates_media_live(client: TestClient) -> None:
    created = client.post(
        "/api/live-sessions",
        json={"name": "Heartbeat Room", "room_type": "general"},
    ).json()
    token = created["host_resume_token"]
    beat = client.post(
        f"/api/live-sessions/{created['id']}/host-heartbeat",
        json={"host_token": token, "media_live": True},
    )
    assert beat.status_code == 200
    assert beat.json()["media_live"] is True
    assert beat.json()["is_host"] is True


def test_reclaim_within_grace(client: TestClient) -> None:
    created = client.post(
        "/api/live-sessions",
        json={"name": "Reclaim Room", "room_type": "karaoke"},
    ).json()
    token = created["host_resume_token"]
    store = get_memory_live_session_store()
    session = store.get_session(UUID(created["id"]))
    assert session is not None
    stale = (datetime.now(timezone.utc) - timedelta(seconds=60)).isoformat()
    metadata = dict(session.metadata_json)
    metadata[HOST_LAST_SEEN_KEY] = stale
    store.update_metadata(session.id, metadata)

    reclaim = client.post(
        f"/api/live-sessions/by-room/{created['room_id']}/reclaim-host",
        json={"host_token": token},
    )
    assert reclaim.status_code == 200
    assert reclaim.json()["is_host"] is True
    assert reclaim.json()["host_present"] is True
    assert reclaim.json()["grace_remaining_seconds"] is not None


def test_lease_expired_reaped_from_directory(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("HOST_LEASE_GRACE_SECONDS", "30")
    clear_settings_cache()
    created = client.post(
        "/api/live-sessions",
        json={"name": "Expire Room", "room_type": "chat"},
    ).json()
    store = get_memory_live_session_store()
    session = store.get_session(UUID(created["id"]))
    assert session is not None
    expired = (datetime.now(timezone.utc) - timedelta(seconds=120)).isoformat()
    metadata = dict(session.metadata_json)
    metadata[HOST_LAST_SEEN_KEY] = expired
    store.update_metadata(session.id, metadata)

    listed = client.get("/api/live-sessions?status=active").json()
    assert listed == []
    ended = store.get_session(session.id)
    assert ended is not None
    assert ended.status.value == "ended"
    assert ended.metadata_json.get("ended_reason") == HOST_LEASE_EXPIRED_REASON


def test_invalid_token_rejected(client: TestClient) -> None:
    created = client.post(
        "/api/live-sessions",
        json={"name": "Bad Token", "room_type": "karaoke"},
    ).json()
    response = client.post(
        f"/api/live-sessions/{created['id']}/host-heartbeat",
        json={"host_token": "definitely-not-the-real-token-value"},
    )
    assert response.status_code == 403


def test_host_resume_token_can_end_session_but_uuid_alone_cannot(client: TestClient) -> None:
    created = client.post(
        "/api/live-sessions",
        json={"name": "Token End Room", "room_type": "general"},
    ).json()
    assert client.post(f"/api/live-sessions/{created['id']}/end").status_code == 401
    ended = client.post(
        f"/api/live-sessions/{created['id']}/end",
        headers={"X-Host-Token": created["host_resume_token"]},
    )
    assert ended.status_code == 200
    assert ended.json()["status"] == "ended"


def test_reclaim_after_expiry_rejected(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("HOST_LEASE_GRACE_SECONDS", "30")
    clear_settings_cache()
    created = client.post(
        "/api/live-sessions",
        json={"name": "Late Reclaim", "room_type": "general"},
    ).json()
    token = created["host_resume_token"]
    store = get_memory_live_session_store()
    session = store.get_session(UUID(created["id"]))
    assert session is not None
    expired = (datetime.now(timezone.utc) - timedelta(seconds=120)).isoformat()
    metadata = dict(session.metadata_json)
    metadata[HOST_LAST_SEEN_KEY] = expired
    store.update_metadata(session.id, metadata)

    reclaim = client.post(
        f"/api/live-sessions/by-room/{created['room_id']}/reclaim-host",
        json={"host_token": token},
    )
    assert reclaim.status_code == 404
