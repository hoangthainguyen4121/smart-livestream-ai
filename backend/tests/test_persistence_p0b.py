from __future__ import annotations

from pathlib import Path
import sys
from unittest.mock import patch
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlmodel import select


BACKEND_ROOT = Path(__file__).resolve().parents[1]
PROJECT_ROOT = BACKEND_ROOT.parent

for path in (BACKEND_ROOT, PROJECT_ROOT):
    path_text = str(path)
    if path_text not in sys.path:
        sys.path.insert(0, path_text)

from app.db.models import Comment, LivestreamSession  # noqa: E402
from app.main import app  # noqa: E402


def unique_room_id() -> str:
    return f"room-{uuid4()}"


@pytest.fixture()
def client(persistence_env: str) -> TestClient:
    return TestClient(app)


def test_alembic_upgrade_applied(db_session) -> None:
    tables = db_session.exec(
        select(LivestreamSession).limit(1)
    )
    assert tables is not None


def test_start_session_returns_active(client: TestClient) -> None:
    room_id = unique_room_id()
    response = client.post("/api/sessions/start", json={"room_id": room_id})

    assert response.status_code == 200
    payload = response.json()
    assert payload["room_id"] == room_id
    assert payload["status"] == "active"
    assert payload["id"]


def test_start_session_is_idempotent_for_active_room(client: TestClient) -> None:
    room_id = unique_room_id()
    first = client.post("/api/sessions/start", json={"room_id": room_id}).json()
    second = client.post("/api/sessions/start", json={"room_id": room_id}).json()

    assert first["id"] == second["id"]
    assert first["status"] == "active"


def test_end_session_marks_ended(client: TestClient) -> None:
    room_id = unique_room_id()
    started = client.post("/api/sessions/start", json={"room_id": room_id}).json()
    ended = client.post(f"/api/sessions/{started['id']}/end")

    assert ended.status_code == 200
    assert ended.json()["status"] == "ended"


def test_get_current_session(client: TestClient) -> None:
    room_id = unique_room_id()
    started = client.post("/api/sessions/start", json={"room_id": room_id}).json()
    current = client.get(f"/api/sessions/{room_id}/current")

    assert current.status_code == 200
    assert current.json()["id"] == started["id"]


def test_websocket_comment_persisted(client: TestClient, db_session) -> None:
    room_id = unique_room_id()
    client.post("/api/sessions/start", json={"room_id": room_id})

    with client.websocket_connect(f"/ws/chat/{room_id}") as websocket:
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
    assert row.room_id == room_id


def test_websocket_comment_id_matches_db(client: TestClient, db_session) -> None:
    room_id = unique_room_id()
    client.post("/api/sessions/start", json={"room_id": room_id})

    with client.websocket_connect(f"/ws/chat/{room_id}") as websocket:
        websocket.receive_json()
        websocket.send_json(
            {
                "type": "chat_message",
                "author": "guest",
                "text": "Same id",
            }
        )
        event = websocket.receive_json()

    assert db_session.get(Comment, event["id"]) is not None


def test_websocket_reply_fields_persisted(client: TestClient, db_session) -> None:
    room_id = unique_room_id()
    client.post("/api/sessions/start", json={"room_id": room_id})

    with client.websocket_connect(f"/ws/chat/{room_id}") as websocket:
        websocket.receive_json()
        websocket.send_json(
            {
                "type": "chat_message",
                "id": "assistant-event-1",
                "author": "assistant",
                "text": "Reply body",
                "reply_to_message_id": "viewer-1",
                "reply_to_author": "guest",
                "reply_to_text": "question",
                "commerce_actions": [
                    {
                        "id": "cart-1",
                        "type": "add_to_cart",
                        "label": "Add",
                        "product_id": "sku-1",
                        "quantity": 1,
                    }
                ],
            }
        )
        event = websocket.receive_json()

    row = db_session.get(Comment, event["id"])
    assert row is not None
    assert row.reply_to_comment_id == "viewer-1"
    assert row.reply_to_author == "guest"
    assert row.commerce_actions[0]["product_id"] == "sku-1"


def test_websocket_without_active_session_returns_error(client: TestClient) -> None:
    room_id = unique_room_id()

    with client.websocket_connect(f"/ws/chat/{room_id}") as websocket:
        websocket.receive_json()
        websocket.send_json(
            {
                "type": "chat_message",
                "author": "guest",
                "text": "Should fail",
            }
        )
        event = websocket.receive_json()

    assert event["type"] == "error"
    assert event["code"] == "no_active_session"


def test_comment_history_order_and_pagination(client: TestClient) -> None:
    room_id = unique_room_id()
    client.post("/api/sessions/start", json={"room_id": room_id})

    with client.websocket_connect(f"/ws/chat/{room_id}") as websocket:
        websocket.receive_json()
        for index in range(3):
            websocket.send_json(
                {
                    "type": "chat_message",
                    "author": "guest",
                    "text": f"Message {index}",
                }
            )
            websocket.receive_json()

    history = client.get(f"/api/comments?room_id={room_id}&limit=2")
    assert history.status_code == 200
    payload = history.json()
    assert len(payload["comments"]) == 2
    assert payload["comments"][0]["text"] == "Message 1"
    assert payload["comments"][1]["text"] == "Message 2"
    assert payload["next_before"]

    older = client.get(
        f"/api/comments?room_id={room_id}&limit=2&before={payload['next_before']}"
    )
    assert older.status_code == 200
    older_payload = older.json()
    assert len(older_payload["comments"]) == 1
    assert older_payload["comments"][0]["text"] == "Message 0"


def test_websocket_broadcast_still_works(client: TestClient) -> None:
    room_id = unique_room_id()
    client.post("/api/sessions/start", json={"room_id": room_id})

    with client.websocket_connect(f"/ws/chat/{room_id}") as first:
        with client.websocket_connect(f"/ws/chat/{room_id}") as second:
            first.receive_json()
            second.receive_json()
            first.send_json(
                {
                    "type": "chat_message",
                    "author": "guest",
                    "text": "Broadcast",
                }
            )
            first_event = first.receive_json()
            second_event = second.receive_json()

    assert first_event["id"] == second_event["id"]
    assert second_event["text"] == "Broadcast"


def test_db_insert_failure_does_not_broadcast(client: TestClient) -> None:
    room_id = unique_room_id()
    client.post("/api/sessions/start", json={"room_id": room_id})

    with patch(
        "app.services.chat_persistence.CommentRepository.save_comment",
        side_effect=RuntimeError("db down"),
    ):
        with client.websocket_connect(f"/ws/chat/{room_id}") as websocket:
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

    with client.websocket_connect(f"/ws/chat/{room_id}") as websocket:
        history = websocket.receive_json()

    assert history["messages"] == []


def test_end_session_blocks_new_comments(client: TestClient) -> None:
    room_id = unique_room_id()
    started = client.post("/api/sessions/start", json={"room_id": room_id}).json()
    client.post(f"/api/sessions/{started['id']}/end")

    with client.websocket_connect(f"/ws/chat/{room_id}") as websocket:
        websocket.receive_json()
        websocket.send_json(
            {
                "type": "chat_message",
                "author": "guest",
                "text": "After end",
            }
        )
        event = websocket.receive_json()

    assert event["code"] == "no_active_session"
