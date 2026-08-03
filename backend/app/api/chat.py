import logging
from typing import Any

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.services.chat_manager import ChatManager
from app.services.chat_persistence import (
    ChatPersistenceService,
    CommentPersistenceError,
    NoActiveSessionError,
)


router = APIRouter(tags=["chat"])
logger = logging.getLogger(__name__)
chat_manager = ChatManager()
chat_persistence = ChatPersistenceService(chat_manager)


@router.websocket("/ws/chat/{room_id}")
async def chat_socket(websocket: WebSocket, room_id: str) -> None:
    await chat_manager.connect(room_id, websocket)
    await chat_manager.send_history(room_id, websocket)

    try:
        while True:
            payload: dict[str, Any] = await websocket.receive_json()
            if payload.get("type") != "chat_message":
                await websocket.send_json(
                    {
                        "type": "error",
                        "message": "Unsupported chat message type. Expected type='chat_message'.",
                    }
                )
                continue

            try:
                await chat_persistence.handle_chat_message(room_id, payload)
            except ValueError as error:
                await websocket.send_json(
                    {
                        "type": "error",
                        "message": str(error),
                    }
                )
            except NoActiveSessionError:
                await websocket.send_json(
                    {
                        "type": "error",
                        "code": "no_active_session",
                        "message": (
                            "No active livestream session for this room. "
                            "Start a session before sending comments."
                        ),
                    }
                )
            except CommentPersistenceError as error:
                await websocket.send_json(
                    {
                        "type": "error",
                        "code": "comment_persistence_failed",
                        "message": str(error),
                    }
                )
    except WebSocketDisconnect:
        chat_manager.disconnect(room_id, websocket)
    except Exception:
        chat_manager.disconnect(room_id, websocket)
        logger.exception("Chat WebSocket failed")
        raise
