from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
import sys
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient


BACKEND_ROOT = Path(__file__).resolve().parents[1]
PROJECT_ROOT = BACKEND_ROOT.parent

for path in (BACKEND_ROOT, PROJECT_ROOT):
    path_text = str(path)
    if path_text not in sys.path:
        sys.path.insert(0, path_text)

from app.main import app  # noqa: E402
from app.services.memory_live_sessions import (  # noqa: E402
    VISUAL_MODERATION_ENDED_REASON,
    get_memory_live_session_store,
)


@pytest.fixture()
def client(memory_mode_env: None) -> TestClient:
    get_memory_live_session_store().clear()
    return TestClient(app)


def test_list_active_sessions_empty(client: TestClient) -> None:
    response = client.get("/api/live-sessions?status=active")
    assert response.status_code == 200
    assert response.json() == []


def test_create_session_valid(client: TestClient) -> None:
    response = client.post(
        "/api/live-sessions",
        json={"name": "Fashion Live", "room_type": "fashion"},
    )
    assert response.status_code == 201
    body = response.json()
    assert body["name"] == "Fashion Live"
    assert body["room_type"] == "fashion"
    assert body["status"] == "active"
    assert body["room_id"].startswith("fashion-live-")

    listed = client.get("/api/live-sessions?status=active").json()
    assert len(listed) == 1
    assert listed[0]["id"] == body["id"]


def test_ended_session_not_in_active_list(client: TestClient) -> None:
    created = client.post(
        "/api/live-sessions",
        json={"name": "Beauty Live", "room_type": "beauty"},
    ).json()

    ended = client.post(f"/api/live-sessions/{created['id']}/end")
    assert ended.status_code == 200
    assert ended.json()["status"] == "ended"

    listed = client.get("/api/live-sessions?status=active").json()
    assert listed == []


def test_invalid_room_type_rejected(client: TestClient) -> None:
    response = client.post(
        "/api/live-sessions",
        json={"name": "Weird Room", "room_type": "spaceship"},
    )
    assert response.status_code == 422


def test_empty_name_rejected(client: TestClient) -> None:
    response = client.post(
        "/api/live-sessions",
        json={"name": "   ", "room_type": "general"},
    )
    assert response.status_code == 422


def test_moderation_end_removes_from_active_list(client: TestClient) -> None:
    created = client.post(
        "/api/live-sessions",
        json={"name": "Knife Test", "room_type": "general"},
    ).json()

    ended = client.post(
        f"/api/live-sessions/{created['id']}/moderation-violations",
        json={
            "code": "sharp_object_detected",
            "label": "knife",
            "confidence": 0.9,
            "evidence_count": 3,
            "window_ms": 5000,
            "detected_at": datetime.now(timezone.utc).isoformat(),
        },
    )
    assert ended.status_code == 200
    assert ended.json()["ended_reason"] == VISUAL_MODERATION_ENDED_REASON
    assert client.get("/api/live-sessions?status=active").json() == []


def test_create_then_get_current_by_room(client: TestClient) -> None:
    created = client.post(
        "/api/live-sessions",
        json={"name": "Food Live", "room_type": "food"},
    ).json()
    current = client.get(f"/api/live-sessions/by-room/{created['room_id']}/current")
    assert current.status_code == 200
    assert current.json()["id"] == created["id"]
    assert current.json()["name"] == "Food Live"
