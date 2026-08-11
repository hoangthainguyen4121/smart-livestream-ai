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


def _violation_payload(**overrides):
    payload = {
        "code": "sharp_object_detected",
        "label": "knife",
        "confidence": 0.84,
        "evidence_count": 3,
        "window_ms": 5000,
        "detected_at": datetime.now(timezone.utc).isoformat(),
    }
    payload.update(overrides)
    return payload


def test_active_session_ends_with_visual_moderation_reason(client: TestClient) -> None:
    started = client.post("/api/live-sessions/start", json={"room_id": f"room-{uuid4()}"}).json()
    assert started["status"] == "active"

    ended = client.post(
        f"/api/live-sessions/{started['id']}/moderation-violations",
        json=_violation_payload(),
    )
    assert ended.status_code == 200
    body = ended.json()
    assert body["status"] == "ended"
    assert body["ended_reason"] == VISUAL_MODERATION_ENDED_REASON
    assert body["already_ended"] is False
    assert body["metadata"]["moderation_events"][0]["code"] == "sharp_object_detected"


def test_moderation_violation_is_idempotent(client: TestClient) -> None:
    started = client.post("/api/live-sessions/start", json={"room_id": f"room-{uuid4()}"}).json()
    first = client.post(
        f"/api/live-sessions/{started['id']}/moderation-violations",
        json=_violation_payload(),
    ).json()
    second = client.post(
        f"/api/live-sessions/{started['id']}/moderation-violations",
        json=_violation_payload(label="scissors"),
    ).json()

    assert first["status"] == "ended"
    assert second["status"] == "ended"
    assert second["already_ended"] is True
    assert second["ended_reason"] == VISUAL_MODERATION_ENDED_REASON


def test_invalid_violation_code_is_rejected(client: TestClient) -> None:
    started = client.post("/api/live-sessions/start", json={"room_id": f"room-{uuid4()}"}).json()
    response = client.post(
        f"/api/live-sessions/{started['id']}/moderation-violations",
        json=_violation_payload(code="violence_detected"),
    )
    assert response.status_code == 422


def test_other_room_session_not_affected(client: TestClient) -> None:
    first = client.post("/api/live-sessions/start", json={"room_id": "room-a"}).json()
    second = client.post("/api/live-sessions/start", json={"room_id": "room-b"}).json()

    client.post(
        f"/api/live-sessions/{first['id']}/moderation-violations",
        json=_violation_payload(),
    )

    current_b = client.get("/api/live-sessions/by-room/room-b/current")
    assert current_b.status_code == 200
    assert current_b.json()["id"] == second["id"]
    assert current_b.json()["status"] == "active"


def test_broadcasts_live_session_ended(client: TestClient) -> None:
    room_id = f"room-{uuid4()}"
    started = client.post("/api/live-sessions/start", json={"room_id": room_id}).json()

    with client.websocket_connect(f"/ws/chat/{room_id}") as websocket:
        websocket.receive_json()  # history
        client.post(
            f"/api/live-sessions/{started['id']}/moderation-violations",
            json=_violation_payload(),
        )
        event = websocket.receive_json()

    assert event["type"] == "live_session_ended"
    assert event["reason"] == VISUAL_MODERATION_ENDED_REASON
    assert event["session_id"] == started["id"]


def test_unknown_session_returns_404(client: TestClient) -> None:
    response = client.post(
        f"/api/live-sessions/{uuid4()}/moderation-violations",
        json=_violation_payload(),
    )
    assert response.status_code == 404
