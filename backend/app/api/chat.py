import logging
from typing import Any

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.services.chat_manager import ChatManager
from app.services.chat_persistence import (
    ChatPersistenceService,
    CommentPersistenceError,
    NoActiveSessionError,
)
from app.services.comment_spam_guard import CommentSpamGuardError
from app.services.webrtc_signaling import (
    TARGETED_TYPES,
    WEBRTC_MESSAGE_TYPES,
    RoomPeer,
    WebRtcPeerRegistry,
    WebRtcSignalingError,
    validate_webrtc_payload,
)


router = APIRouter(tags=["chat"])
logger = logging.getLogger(__name__)
chat_manager = ChatManager()
chat_persistence = ChatPersistenceService(chat_manager)
webrtc_peers = WebRtcPeerRegistry()


@router.websocket("/ws/chat/{room_id}")
async def chat_socket(websocket: WebSocket, room_id: str) -> None:
    await chat_manager.connect(room_id, websocket)
    await chat_manager.send_history(room_id, websocket)

    try:
        while True:
            payload: dict[str, Any] = await websocket.receive_json()
            message_type = payload.get("type")

            if message_type in WEBRTC_MESSAGE_TYPES:
                await _handle_webrtc_signaling(room_id, websocket, payload)
                continue

            if message_type != "chat_message":
                await websocket.send_json(
                    {
                        "type": "error",
                        "message": (
                            "Unsupported chat message type. Expected type='chat_message' "
                            "or a WebRTC signaling type."
                        ),
                    }
                )
                continue

            try:
                await chat_persistence.handle_chat_message(
                    room_id,
                    payload,
                    websocket_id=id(websocket),
                )
            except CommentSpamGuardError as error:
                await websocket.send_json(
                    {
                        "type": "error",
                        "code": error.code,
                        "message": error.message,
                        "retry_after_seconds": error.retry_after_seconds,
                    }
                )
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
        await _cleanup_socket(room_id, websocket)
    except Exception:
        await _cleanup_socket(room_id, websocket)
        logger.exception("Chat WebSocket failed")
        raise


async def _handle_webrtc_signaling(
    room_id: str,
    websocket: WebSocket,
    payload: dict[str, Any],
) -> None:
    try:
        event = validate_webrtc_payload(payload, room_id=room_id)
    except WebRtcSignalingError as error:
        await websocket.send_json(
            {
                "type": "error",
                "code": "webrtc_signaling_invalid",
                "message": error.message,
            }
        )
        return

    peer_id = event["peer_id"]
    message_type = event["type"]

    if message_type == "webrtc_join":
        webrtc_peers.register(
            room_id,
            RoomPeer(peer_id=peer_id, role=str(event.get("role")), websocket=websocket),
        )
        await chat_manager.broadcast_event(room_id, event, exclude=websocket)
        return

    if message_type == "webrtc_leave":
        webrtc_peers.unregister(room_id, peer_id)
        await chat_manager.broadcast_event(room_id, event, exclude=websocket)
        return

    # Keep registry fresh for host media announcements / ICE.
    existing = webrtc_peers.get_peer(room_id, peer_id)
    role = event.get("role") or (existing.role if existing else "viewer")
    webrtc_peers.register(
        room_id,
        RoomPeer(peer_id=peer_id, role=str(role), websocket=websocket),
    )

    if message_type in TARGETED_TYPES:
        target_peer_id = event["target_peer_id"]
        target = webrtc_peers.get_peer(room_id, target_peer_id)
        if target is None:
            await websocket.send_json(
                {
                    "type": "error",
                    "code": "webrtc_target_not_found",
                    "message": f"Target peer '{target_peer_id}' is not connected.",
                }
            )
            return
        await chat_manager.send_to_websocket(room_id, target.websocket, event)
        return

    await chat_manager.broadcast_event(room_id, event, exclude=websocket)


async def _cleanup_socket(room_id: str, websocket: WebSocket) -> None:
    removed = webrtc_peers.unregister_socket(room_id, websocket)
    chat_manager.disconnect(room_id, websocket)
    for peer in removed:
        await chat_manager.broadcast_event(
            room_id,
            {
                "type": "webrtc_leave",
                "room_id": room_id,
                "peer_id": peer.peer_id,
                "role": peer.role,
            },
        )
