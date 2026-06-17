from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, WebSocket, WebSocketDisconnect


router = APIRouter(tags=["realtime"])


@router.websocket("/ws/realtime")
async def realtime_socket(websocket: WebSocket) -> None:
    await websocket.accept()

    try:
        while True:
            payload: dict[str, Any] = await websocket.receive_json()
            frame_payload = payload.get("frame")

            await websocket.send_json(
                {
                    "type": "realtime_result",
                    "received": True,
                    "frame_received": bool(frame_payload),
                    "faces": [],
                    "gestures": [],
                    "metrics": {
                        "fps": 0.0,
                        "latency_ms": 0.0,
                    },
                    "server_time": datetime.now(timezone.utc).isoformat(),
                }
            )
    except WebSocketDisconnect:
        return
