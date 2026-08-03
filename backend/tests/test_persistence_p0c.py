from __future__ import annotations

from pathlib import Path
import sys
from unittest.mock import patch
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient


BACKEND_ROOT = Path(__file__).resolve().parents[1]
PROJECT_ROOT = BACKEND_ROOT.parent

for path in (BACKEND_ROOT, PROJECT_ROOT):
    path_text = str(path)
    if path_text not in sys.path:
        sys.path.insert(0, path_text)

from app.settings import (  # noqa: E402
    ChatPersistenceMode,
    DURABLE_CHAT_DISABLED_CODE,
    clear_settings_cache,
    get_settings,
    load_settings,
)
from app.main import app  # noqa: E402


def unique_room_id() -> str:
    return f"room-{uuid4()}"


@pytest.fixture()
def client(memory_mode_env: None) -> TestClient:
    return TestClient(app)


def test_default_mode_is_memory(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("CHAT_PERSISTENCE_MODE", raising=False)
    monkeypatch.delenv("DATABASE_URL", raising=False)
    clear_settings_cache()

    settings = load_settings()
    assert settings.chat_persistence_mode == ChatPersistenceMode.MEMORY
    assert settings.database_url is None


def test_unknown_mode_fails_configuration(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("CHAT_PERSISTENCE_MODE", "forever")
    clear_settings_cache()

    with pytest.raises(ValueError, match="Invalid CHAT_PERSISTENCE_MODE"):
        load_settings()


def test_short_retention_missing_database_url_fails(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("CHAT_PERSISTENCE_MODE", "short_retention")
    monkeypatch.delenv("DATABASE_URL", raising=False)
    clear_settings_cache()

    with pytest.raises(ValueError, match="requires DATABASE_URL"):
        load_settings()


def test_timeout_must_be_positive(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("CHAT_PERSISTENCE_MODE", "memory")
    monkeypatch.setenv("COMMENT_PERSIST_TIMEOUT_SECONDS", "0")
    clear_settings_cache()

    with pytest.raises(ValueError, match="COMMENT_PERSIST_TIMEOUT_SECONDS"):
        load_settings()


def test_retention_hours_validation(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("CHAT_PERSISTENCE_MODE", "memory")
    monkeypatch.setenv("CHAT_RETENTION_HOURS", "999")
    clear_settings_cache()

    with pytest.raises(ValueError, match="CHAT_RETENTION_HOURS"):
        load_settings()


def test_memory_mode_websocket_broadcast(client: TestClient) -> None:
    room_id = unique_room_id()

    with client.websocket_connect(f"/ws/chat/{room_id}") as websocket:
        websocket.receive_json()
        websocket.send_json(
            {
                "type": "chat_message",
                "author": "guest",
                "text": "Memory mode",
            }
        )
        event = websocket.receive_json()

    assert event["type"] == "chat_message"
    assert event["text"] == "Memory mode"


def test_memory_mode_does_not_call_session_service(client: TestClient) -> None:
    room_id = unique_room_id()

    with patch("app.services.chat_persistence.SessionService") as session_service:
        with client.websocket_connect(f"/ws/chat/{room_id}") as websocket:
            websocket.receive_json()
            websocket.send_json(
                {
                    "type": "chat_message",
                    "author": "guest",
                    "text": "No session lookup",
                }
            )
            event = websocket.receive_json()

    assert event["type"] == "chat_message"
    session_service.assert_not_called()


def test_memory_mode_does_not_call_repository(client: TestClient) -> None:
    room_id = unique_room_id()

    with patch("app.services.chat_persistence.CommentRepository") as repository:
        with client.websocket_connect(f"/ws/chat/{room_id}") as websocket:
            websocket.receive_json()
            websocket.send_json(
                {
                    "type": "chat_message",
                    "author": "guest",
                    "text": "No repository",
                }
            )
            event = websocket.receive_json()

    assert event["type"] == "chat_message"
    repository.assert_not_called()


def test_memory_mode_does_not_dispatch_thread_persistence(client: TestClient) -> None:
    room_id = unique_room_id()

    with patch("app.services.chat_persistence.asyncio.to_thread") as to_thread:
        with client.websocket_connect(f"/ws/chat/{room_id}") as websocket:
            websocket.receive_json()
            websocket.send_json(
                {
                    "type": "chat_message",
                    "author": "guest",
                    "text": "No thread dispatch",
                }
            )
            event = websocket.receive_json()

    assert event["type"] == "chat_message"
    to_thread.assert_not_called()


def test_memory_mode_history_endpoint_contract(client: TestClient) -> None:
    response = client.get("/api/comments?room_id=demo")

    assert response.status_code == 503
    payload = response.json()
    assert payload["detail"]["code"] == DURABLE_CHAT_DISABLED_CODE
    assert payload["detail"]["durable_chat_history"] is False


def test_memory_mode_health_endpoint(client: TestClient) -> None:
    response = client.get("/api/health")

    assert response.status_code == 200
    payload = response.json()
    assert payload["chat_persistence_mode"] == "memory"
    assert payload["durable_chat_history"] is False
    assert payload["chat_retention_deletion_job"] == "not_implemented"


def test_memory_mode_does_not_require_database_url(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("DATABASE_URL", raising=False)
    monkeypatch.setenv("CHAT_PERSISTENCE_MODE", "memory")
    clear_settings_cache()

    settings = get_settings()
    assert settings.chat_persistence_mode == ChatPersistenceMode.MEMORY


@pytest.fixture()
def short_retention_client(persistence_env: str) -> TestClient:
    return TestClient(app)


def test_short_retention_persist_before_broadcast(
    short_retention_client: TestClient,
    db_session,
) -> None:
    from app.db.models import Comment

    room_id = unique_room_id()
    short_retention_client.post("/api/sessions/start", json={"room_id": room_id})

    with short_retention_client.websocket_connect(f"/ws/chat/{room_id}") as websocket:
        websocket.receive_json()
        websocket.send_json(
            {
                "type": "chat_message",
                "author": "guest",
                "text": "Persist me",
            }
        )
        event = websocket.receive_json()

    assert event["type"] == "chat_message"
    row = db_session.get(Comment, event["id"])
    assert row is not None
    assert row.text == "Persist me"


def test_short_retention_db_error_does_not_broadcast(short_retention_client: TestClient) -> None:
    room_id = unique_room_id()
    short_retention_client.post("/api/sessions/start", json={"room_id": room_id})

    with patch(
        "app.services.chat_persistence.CommentRepository.save_comment",
        side_effect=RuntimeError("db down"),
    ):
        with short_retention_client.websocket_connect(f"/ws/chat/{room_id}") as websocket:
            websocket.receive_json()
            websocket.send_json(
                {
                    "type": "chat_message",
                    "author": "guest",
                    "text": "Should not broadcast",
                }
            )
            event = websocket.receive_json()

    assert event["type"] == "error"
    assert event["code"] == "comment_persistence_failed"

    with short_retention_client.websocket_connect(f"/ws/chat/{room_id}") as websocket:
        history = websocket.receive_json()

    assert history["messages"] == []
