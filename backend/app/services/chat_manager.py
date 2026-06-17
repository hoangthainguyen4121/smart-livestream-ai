from __future__ import annotations

from collections import defaultdict, deque
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from fastapi import WebSocket


MAX_HISTORY_MESSAGES = 50
MAX_AUTHOR_LENGTH = 32
MAX_TEXT_LENGTH = 300


@dataclass(frozen=True)
class ChatMessage:
    id: str
    room_id: str
    author: str
    text: str
    created_at: str

    def to_dict(self) -> dict[str, str]:
        return {
            "id": self.id,
            "room_id": self.room_id,
            "author": self.author,
            "text": self.text,
            "created_at": self.created_at,
        }


class ChatManager:
    def __init__(self, history_limit: int = MAX_HISTORY_MESSAGES) -> None:
        self._connections: dict[str, set[WebSocket]] = defaultdict(set)
        self._history: dict[str, deque[ChatMessage]] = defaultdict(
            lambda: deque(maxlen=history_limit)
        )

    async def connect(self, room_id: str, websocket: WebSocket) -> None:
        await websocket.accept()
        self._connections[room_id].add(websocket)

    def disconnect(self, room_id: str, websocket: WebSocket) -> None:
        room_connections = self._connections.get(room_id)
        if room_connections is None:
            return

        room_connections.discard(websocket)
        if not room_connections:
            self._connections.pop(room_id, None)

    def get_history(self, room_id: str) -> list[dict[str, str]]:
        return [message.to_dict() for message in self._history[room_id]]

    async def send_history(self, room_id: str, websocket: WebSocket) -> None:
        await websocket.send_json(
            {
                "type": "chat_history",
                "room_id": room_id,
                "messages": self.get_history(room_id),
            }
        )

    async def broadcast_message(
        self,
        room_id: str,
        payload: dict[str, Any],
    ) -> ChatMessage:
        message = self._create_message(room_id, payload)
        self._history[room_id].append(message)

        event = {
            "type": "chat_message",
            **message.to_dict(),
        }
        disconnected: list[WebSocket] = []
        for websocket in list(self._connections[room_id]):
            try:
                await websocket.send_json(event)
            except RuntimeError:
                disconnected.append(websocket)

        for websocket in disconnected:
            self.disconnect(room_id, websocket)

        return message

    def _create_message(self, room_id: str, payload: dict[str, Any]) -> ChatMessage:
        author = self._validate_text_field(
            payload.get("author"),
            field_name="author",
            max_length=MAX_AUTHOR_LENGTH,
        )
        text = self._validate_text_field(
            payload.get("text"),
            field_name="text",
            max_length=MAX_TEXT_LENGTH,
        )
        return ChatMessage(
            id=str(uuid4()),
            room_id=room_id,
            author=author,
            text=text,
            created_at=datetime.now(timezone.utc).isoformat(),
        )

    @staticmethod
    def _validate_text_field(value: Any, *, field_name: str, max_length: int) -> str:
        if not isinstance(value, str):
            raise ValueError(f"{field_name} must be a string.")

        normalized = value.strip()
        if not normalized:
            raise ValueError(f"{field_name} must not be empty.")
        if len(normalized) > max_length:
            raise ValueError(f"{field_name} must be at most {max_length} characters.")

        return normalized
