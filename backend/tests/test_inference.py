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


def test_inference_frame_rejects_invalid_payload() -> None:
    response = client.post(
        "/api/inference/frame",
        json={"frame": "not-a-valid-image"},
    )

    assert response.status_code == 400


def test_inference_reset_endpoint() -> None:
    response = client.post("/api/inference/reset")

    assert response.status_code == 200
    assert response.json() == {"reset": True}


def test_inference_frame_echoes_frame_id() -> None:
    response = client.post(
        "/api/inference/frame",
        json={
            "frame": "not-a-valid-image",
            "frame_id": 42,
            "sent_at_ms": 1234.5,
        },
    )

    assert response.status_code == 400
