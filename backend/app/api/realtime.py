import logging
from typing import Any

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.services.ai_runtime import AIRuntime
from app.utils.image_codec import decode_data_url_frame


router = APIRouter(tags=["realtime"])
logger = logging.getLogger(__name__)


def create_ai_runtime() -> AIRuntime:
    return AIRuntime()


@router.websocket("/ws/realtime")
async def realtime_socket(websocket: WebSocket) -> None:
    await websocket.accept()
    ai_runtime = create_ai_runtime()

    try:
        while True:
            payload: dict[str, Any] = await websocket.receive_json()
            if payload.get("type") != "frame":
                await websocket.send_json(
                    {
                        "type": "error",
                        "message": "Unsupported realtime message type. Expected type='frame'.",
                    }
                )
                continue

            frame_payload = payload.get("frame")
            try:
                frame = decode_data_url_frame(frame_payload)
            except ValueError as error:
                await websocket.send_json(
                    {
                        "type": "error",
                        "message": str(error),
                    }
                )
                continue

            await websocket.send_json(ai_runtime.process_frame(frame))
    except WebSocketDisconnect:
        return
    except Exception:
        logger.exception("Realtime WebSocket failed")
        raise
