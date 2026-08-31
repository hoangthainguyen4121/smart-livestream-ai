import base64
import io

import pytest
from fastapi.testclient import TestClient
from PIL import Image

from app.main import app
from app.services.memory_live_sessions import get_memory_live_session_store
from app.services.visual_embedding_service import visual_embedding_service


def _solid_png_base64(red: int, green: int, blue: int) -> str:
    image = Image.new("RGB", (96, 96), (red, green, blue))
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    encoded = base64.b64encode(buffer.getvalue()).decode("ascii")
    return f"data:image/png;base64,{encoded}"


@pytest.fixture(autouse=True)
def reset_catalog():
    visual_embedding_service.clear_all()
    get_memory_live_session_store().clear()
    yield
    visual_embedding_service.clear_all()
    get_memory_live_session_store().clear()


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
    room = client.post(
        "/api/live-sessions",
        json={"name": "Vision Room", "room_type": "chat"},
    ).json()

    sync_response = client.post(
        "/api/product-vision/sync-catalog",
        headers={"X-Host-Token": room["host_resume_token"]},
        json={
            "roomId": room["room_id"],
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
        json={"roomId": room["room_id"], "cropImageBase64": red},
    )
    assert match_response.status_code == 200
    assert match_response.json()["productId"] == "lipstick-ruby"


def test_product_embeddings_are_isolated_between_rooms(monkeypatch):
    monkeypatch.setenv("HAND_HELD_VISION_ENABLED", "true")
    monkeypatch.setenv("VISUAL_EMBEDDING_FORCE_FINGERPRINT", "true")
    client = TestClient(app)
    red = _solid_png_base64(220, 20, 20)
    blue = _solid_png_base64(20, 20, 220)
    room_a = client.post(
        "/api/live-sessions", json={"name": "Room A", "room_type": "chat"}
    ).json()
    room_b = client.post(
        "/api/live-sessions", json={"name": "Room B", "room_type": "karaoke"}
    ).json()

    assert client.post(
        "/api/product-vision/sync-catalog",
        headers={"X-Host-Token": room_a["host_resume_token"]},
        json={
            "roomId": room_a["room_id"],
            "items": [{"id": "product-a", "name": "Product A", "imageBase64": red}],
        },
    ).status_code == 200
    assert client.post(
        "/api/product-vision/sync-catalog",
        headers={"X-Host-Token": room_b["host_resume_token"]},
        json={
            "roomId": room_b["room_id"],
            "items": [{"id": "product-b", "name": "Product B", "imageBase64": blue}],
        },
    ).status_code == 200

    match_a = client.post(
        "/api/product-vision/match-hand-crop",
        json={"roomId": room_a["room_id"], "cropImageBase64": red, "minimumScore": 0.99},
    )
    match_b = client.post(
        "/api/product-vision/match-hand-crop",
        json={"roomId": room_b["room_id"], "cropImageBase64": blue, "minimumScore": 0.99},
    )
    assert match_a.status_code == 200
    assert match_a.json()["productId"] == "product-a"
    assert match_b.status_code == 200
    assert match_b.json()["productId"] == "product-b"

    assert client.post(
        "/api/product-vision/match-hand-crop",
        json={"roomId": room_a["room_id"], "cropImageBase64": blue, "minimumScore": 0.99},
    ).status_code == 404
    assert client.post(
        "/api/product-vision/match-hand-crop",
        json={"roomId": room_b["room_id"], "cropImageBase64": red, "minimumScore": 0.99},
    ).status_code == 404

    ended = client.post(
        f"/api/live-sessions/{room_a['id']}/end",
        headers={"X-Host-Token": room_a["host_resume_token"]},
    )
    assert ended.status_code == 200
    assert visual_embedding_service.catalog_size(room_a["room_id"]) == 0
    assert visual_embedding_service.catalog_size(room_b["room_id"]) == 1
