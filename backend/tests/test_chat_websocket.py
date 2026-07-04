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


def test_chat_websocket_broadcasts_assistant_metadata() -> None:
    room_id = unique_room_id()

    with client.websocket_connect(f"/ws/chat/{room_id}") as first:
        with client.websocket_connect(f"/ws/chat/{room_id}") as second:
            first.receive_json()
            second.receive_json()

            first.send_json(
                {
                    "type": "chat_message",
                    "id": "assistant-event-1",
                    "author": "Trợ lý bán hàng",
                    "text": "Cảm ơn bạn. Thêm vào giỏ hàng bên dưới.",
                    "reply_to_message_id": "viewer-msg-1",
                    "reply_to_author": "guest-a",
                    "reply_to_text": "kem chống nắng",
                    "commerce_actions": [
                        {
                            "id": "add-to-cart-1",
                            "type": "add_to_cart",
                            "label": "Thêm vào giỏ hàng",
                            "product_id": "sunscreen-01",
                            "quantity": 1,
                        }
                    ],
                }
            )
            first_response = first.receive_json()
            second_response = second.receive_json()

    assert first_response["type"] == "chat_message"
    assert second_response["type"] == "chat_message"
    assert first_response["id"] == "assistant-event-1"
    assert first_response["id"] == second_response["id"]
    assert first_response["reply_to_message_id"] == "viewer-msg-1"
    assert first_response["commerce_actions"][0]["product_id"] == "sunscreen-01"


def test_chat_websocket_ignores_duplicate_assistant_id() -> None:
    room_id = unique_room_id()

    with client.websocket_connect(f"/ws/chat/{room_id}") as websocket:
        websocket.receive_json()
        payload = {
            "type": "chat_message",
            "id": "assistant-viewer-1",
            "author": "Trợ lý bán hàng",
            "text": "Reply once",
            "reply_to_message_id": "viewer-1",
            "reply_to_author": "guest-a",
            "reply_to_text": "kem chống nắng",
        }
        websocket.send_json(payload)
        websocket.receive_json()
        websocket.send_json(payload)

    with client.websocket_connect(f"/ws/chat/{room_id}") as websocket:
        response = websocket.receive_json()

    assert response["type"] == "chat_history"
    assert len(response["messages"]) == 1
    assert response["messages"][0]["id"] == "assistant-viewer-1"


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
