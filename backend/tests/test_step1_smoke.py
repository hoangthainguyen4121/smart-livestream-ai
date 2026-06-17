from pathlib import Path
import sys

import cv2
from fastapi.testclient import TestClient
import numpy as np


BACKEND_ROOT = Path(__file__).resolve().parents[1]
PROJECT_ROOT = BACKEND_ROOT.parent

for path in (BACKEND_ROOT, PROJECT_ROOT):
    path_text = str(path)
    if path_text not in sys.path:
        sys.path.insert(0, path_text)

from app.main import app  # noqa: E402
from app.api import realtime as realtime_api  # noqa: E402


client = TestClient(app)


def test_health_returns_ok() -> None:
    response = client.get("/api/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_face_profiles_returns_ok() -> None:
    response = client.get("/api/face-profiles")

    assert response.status_code == 200
    assert isinstance(response.json(), list)


class StubAIRuntime:
    def process_frame(self, frame: np.ndarray) -> dict:
        assert frame.shape[:2] == (2, 2)
        return {
            "type": "realtime_result",
            "faces": [
                {
                    "username": "Test User",
                    "confidence": 0.99,
                    "bbox": [0, 0, 1, 1],
                }
            ],
            "gestures": [],
            "metrics": {
                "latency_ms": 1.0,
                "fps": 30.0,
            },
        }


def test_realtime_websocket_returns_recognition_result(monkeypatch) -> None:
    monkeypatch.setattr(realtime_api, "create_ai_runtime", lambda: StubAIRuntime())

    with client.websocket_connect("/ws/realtime") as websocket:
        websocket.send_json({"type": "frame", "frame": create_tiny_jpeg_data_url()})
        response = websocket.receive_json()

    assert response["type"] == "realtime_result"
    assert response["faces"][0]["username"] == "Test User"
    assert response["faces"][0]["confidence"] == 0.99
    assert response["gestures"] == []


def create_tiny_jpeg_data_url() -> str:
    image = np.zeros((2, 2, 3), dtype=np.uint8)
    ok, encoded = cv2.imencode(".jpg", image)
    assert ok
    import base64

    payload = base64.b64encode(encoded.tobytes()).decode("ascii")
    return f"data:image/jpeg;base64,{payload}"
