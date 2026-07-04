from __future__ import annotations

from collections import defaultdict, deque
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from fastapi import WebSocket


MAX_HISTORY_MESSAGES = 50
MAX_AUTHOR_LENGTH = 32
MAX_TEXT_LENGTH = 600
MAX_MESSAGE_ID_LENGTH = 64
MAX_REPLY_REFERENCE_LENGTH = 64


@dataclass(frozen=True)
class ChatMessage:
    id: str
    room_id: str
    author: str
    text: str
    created_at: str
    reply_to_message_id: str | None = None
    reply_to_author: str | None = None
    reply_to_text: str | None = None
    commerce_actions: tuple[dict[str, Any], ...] | None = None

    def to_dict(self) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "id": self.id,
            "room_id": self.room_id,
            "author": self.author,
            "text": self.text,
            "created_at": self.created_at,
        }
        if self.reply_to_message_id is not None:
            payload["reply_to_message_id"] = self.reply_to_message_id
        if self.reply_to_author is not None:
            payload["reply_to_author"] = self.reply_to_author
        if self.reply_to_text is not None:
            payload["reply_to_text"] = self.reply_to_text
        if self.commerce_actions is not None:
            payload["commerce_actions"] = list(self.commerce_actions)
        return payload


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

    def get_history(self, room_id: str) -> list[dict[str, Any]]:
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
        requested_id = payload.get("id")
        if isinstance(requested_id, str) and requested_id.strip():
            for existing in self._history[room_id]:
                if existing.id == requested_id.strip():
                    return existing

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
        message_id = self._optional_text_field(
            payload.get("id"),
            field_name="id",
            max_length=MAX_MESSAGE_ID_LENGTH,
        ) or str(uuid4())
        reply_to_message_id = self._optional_text_field(
            payload.get("reply_to_message_id"),
            field_name="reply_to_message_id",
            max_length=MAX_REPLY_REFERENCE_LENGTH,
        )
        reply_to_author = self._optional_text_field(
            payload.get("reply_to_author"),
            field_name="reply_to_author",
            max_length=MAX_AUTHOR_LENGTH,
        )
        reply_to_text = self._optional_text_field(
            payload.get("reply_to_text"),
            field_name="reply_to_text",
            max_length=MAX_TEXT_LENGTH,
        )
        commerce_actions = self._validate_commerce_actions(payload.get("commerce_actions"))

        return ChatMessage(
            id=message_id,
            room_id=room_id,
            author=author,
            text=text,
            created_at=datetime.now(timezone.utc).isoformat(),
            reply_to_message_id=reply_to_message_id,
            reply_to_author=reply_to_author,
            reply_to_text=reply_to_text,
            commerce_actions=commerce_actions,
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

    @staticmethod
    def _optional_text_field(
        value: Any,
        *,
        field_name: str,
        max_length: int,
    ) -> str | None:
        if value is None:
            return None
        return ChatManager._validate_text_field(
            value,
            field_name=field_name,
            max_length=max_length,
        )

    @staticmethod
    def _validate_commerce_actions(
        value: Any,
    ) -> tuple[dict[str, Any], ...] | None:
        if value is None:
            return None
        if not isinstance(value, list):
            raise ValueError("commerce_actions must be a list.")

        normalized: list[dict[str, Any]] = []
        for index, action in enumerate(value):
            if not isinstance(action, dict):
                raise ValueError(f"commerce_actions[{index}] must be an object.")

            action_id = ChatManager._validate_text_field(
                action.get("id"),
                field_name=f"commerce_actions[{index}].id",
                max_length=64,
            )
            action_type = ChatManager._validate_text_field(
                action.get("type"),
                field_name=f"commerce_actions[{index}].type",
                max_length=32,
            )
            label = ChatManager._validate_text_field(
                action.get("label"),
                field_name=f"commerce_actions[{index}].label",
                max_length=64,
            )

            normalized_action: dict[str, Any] = {
                "id": action_id,
                "type": action_type,
                "label": label,
            }
            product_id = action.get("product_id")
            if product_id is not None:
                normalized_action["product_id"] = ChatManager._validate_text_field(
                    product_id,
                    field_name=f"commerce_actions[{index}].product_id",
                    max_length=64,
                )
            quantity = action.get("quantity")
            if quantity is not None:
                if not isinstance(quantity, int) or quantity < 1:
                    raise ValueError(f"commerce_actions[{index}].quantity must be a positive integer.")
                normalized_action["quantity"] = quantity
            color = action.get("color")
            if color is not None:
                normalized_action["color"] = ChatManager._validate_text_field(
                    color,
                    field_name=f"commerce_actions[{index}].color",
                    max_length=32,
                )
            size = action.get("size")
            if size is not None:
                normalized_action["size"] = ChatManager._validate_text_field(
                    size,
                    field_name=f"commerce_actions[{index}].size",
                    max_length=32,
                )

            normalized.append(normalized_action)

        return tuple(normalized)
