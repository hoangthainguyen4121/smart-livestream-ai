from pathlib import Path
import sys
from uuid import uuid4

from fastapi.testclient import TestClient


BACKEND_ROOT = Path(__file__).resolve().parents[1]
PROJECT_ROOT = BACKEND_ROOT.parent

for path in (BACKEND_ROOT, PROJECT_ROOT):
    path_text = str(path)
    if path_text not in sys.path:
        sys.path.insert(0, path_text)

from app.main import app  # noqa: E402


client = TestClient(app)


def unique_room_id() -> str:
    return f"test-{uuid4()}"


def test_chat_websocket_connects_and_sends_empty_history() -> None:
    with client.websocket_connect(f"/ws/chat/{unique_room_id()}") as websocket:
        response = websocket.receive_json()

    assert response["type"] == "chat_history"
    assert response["messages"] == []


def test_chat_websocket_sends_message_to_sender() -> None:
    with client.websocket_connect(f"/ws/chat/{unique_room_id()}") as websocket:
        websocket.receive_json()
        websocket.send_json(
            {
                "type": "chat_message",
                "author": "hoang",
                "text": "Hello chat",
            }
        )
        response = websocket.receive_json()

    assert response["type"] == "chat_message"
    assert response["author"] == "hoang"
    assert response["text"] == "Hello chat"
    assert response["id"]
    assert response["created_at"]


def test_chat_websocket_broadcasts_between_two_clients() -> None:
    room_id = unique_room_id()

    with client.websocket_connect(f"/ws/chat/{room_id}") as first:
        with client.websocket_connect(f"/ws/chat/{room_id}") as second:
            first.receive_json()
            second.receive_json()

            first.send_json(
                {
                    "type": "chat_message",
                    "author": "hoang",
                    "text": "Broadcast message",
                }
            )
            first_response = first.receive_json()
            second_response = second.receive_json()

    assert first_response["type"] == "chat_message"
    assert second_response["type"] == "chat_message"
    assert first_response["id"] == second_response["id"]
    assert second_response["text"] == "Broadcast message"


def test_chat_websocket_rejects_empty_text() -> None:
    with client.websocket_connect(f"/ws/chat/{unique_room_id()}") as websocket:
        websocket.receive_json()
        websocket.send_json(
            {
                "type": "chat_message",
                "author": "hoang",
                "text": "   ",
            }
        )
        response = websocket.receive_json()

    assert response["type"] == "error"
    assert response["message"] == "text must not be empty."


def test_chat_websocket_sends_history_on_connect() -> None:
    room_id = unique_room_id()

    with client.websocket_connect(f"/ws/chat/{room_id}") as websocket:
        websocket.receive_json()
        websocket.send_json(
            {
                "type": "chat_message",
                "author": "hoang",
                "text": "Stored in history",
            }
        )
        websocket.receive_json()

    with client.websocket_connect(f"/ws/chat/{room_id}") as websocket:
        response = websocket.receive_json()

    assert response["type"] == "chat_history"
    assert len(response["messages"]) == 1
    assert response["messages"][0]["text"] == "Stored in history"
