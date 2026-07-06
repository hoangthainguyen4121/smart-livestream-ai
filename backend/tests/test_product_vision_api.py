import base64
import io

import pytest
from fastapi.testclient import TestClient
from PIL import Image

from app.main import app
from app.services.visual_embedding_service import visual_embedding_service


def _solid_png_base64(red: int, green: int, blue: int) -> str:
    image = Image.new("RGB", (96, 96), (red, green, blue))
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    encoded = base64.b64encode(buffer.getvalue()).decode("ascii")
    return f"data:image/png;base64,{encoded}"


@pytest.fixture(autouse=True)
def reset_catalog():
    visual_embedding_service._catalog = []
    yield
    visual_embedding_service._catalog = []


def test_product_vision_status_disabled_by_default():
    client = TestClient(app)
    response = client.get("/api/product-vision/status")
    assert response.status_code == 200
    payload = response.json()
    assert payload["enabled"] is False


def test_sync_and_match_when_enabled(monkeypatch):
    monkeypatch.setenv("HAND_HELD_VISION_ENABLED", "true")
    monkeypatch.setenv("VISUAL_EMBEDDING_FORCE_FINGERPRINT", "true")

    client = TestClient(app)
    red = _solid_png_base64(220, 20, 20)
    blue = _solid_png_base64(20, 20, 220)

    sync_response = client.post(
        "/api/product-vision/sync-catalog",
        json={
            "items": [
                {"id": "lipstick-ruby", "name": "Son Ruby", "imageBase64": red},
                {"id": "glasses-a", "name": "Kính A", "imageBase64": blue},
            ]
        },
    )
    assert sync_response.status_code == 200
    assert sync_response.json()["indexed"] == 2

    match_response = client.post(
        "/api/product-vision/match-hand-crop",
        json={"cropImageBase64": red},
    )
    assert match_response.status_code == 200
    assert match_response.json()["productId"] == "lipstick-ruby"
