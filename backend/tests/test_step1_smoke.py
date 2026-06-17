from pathlib import Path
import sys

from fastapi.testclient import TestClient


BACKEND_ROOT = Path(__file__).resolve().parents[1]
PROJECT_ROOT = BACKEND_ROOT.parent

for path in (BACKEND_ROOT, PROJECT_ROOT):
    path_text = str(path)
    if path_text not in sys.path:
        sys.path.insert(0, path_text)

from app.main import app  # noqa: E402


client = TestClient(app)


def test_health_returns_ok() -> None:
    response = client.get("/api/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_face_profiles_returns_ok() -> None:
    response = client.get("/api/face-profiles")

    assert response.status_code == 200
    assert isinstance(response.json(), list)


def test_realtime_websocket_returns_placeholder_result() -> None:
    with client.websocket_connect("/ws/realtime") as websocket:
        websocket.send_json({"type": "frame", "frame": "placeholder"})
        response = websocket.receive_json()

    assert response["type"] == "realtime_result"
    assert response["received"] is True
    assert response["frame_received"] is True
