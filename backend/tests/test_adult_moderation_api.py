"""Adult moderation API tests (mocked classifiers — no weight download)."""

from __future__ import annotations

import base64
import io
from types import SimpleNamespace

from fastapi.testclient import TestClient
from PIL import Image

from app.main import app
from app.services import adult_moderation_service as adult_mod_module
from app.services.nsfw_frame_gate_service import nsfw_frame_gate_service
from app.services.suggestive_classifier_service import suggestive_classifier_service


def _solid_jpeg_base64() -> str:
    image = Image.new("RGB", (64, 64), (40, 40, 40))
    buffer = io.BytesIO()
    image.save(buffer, format="JPEG", quality=80)
    encoded = base64.b64encode(buffer.getvalue()).decode("ascii")
    return f"data:image/jpeg;base64,{encoded}"


def test_adult_status_disabled_by_default(monkeypatch):
    monkeypatch.delenv("SUGGESTIVE_CLASSIFIER_ENABLED", raising=False)
    monkeypatch.delenv("NSFW_FRAME_GATE_ENABLED", raising=False)
    suggestive_classifier_service.reset_for_tests()
    nsfw_frame_gate_service.reset_for_tests()
    client = TestClient(app)
    response = client.get("/api/adult/status")
    assert response.status_code == 200
    payload = response.json()
    assert payload["enabled"] is False
    assert payload["taxonomy"] == ["SAFE", "SUGGESTIVE", "EXPLICIT"]
    assert payload["auto_terminates_session"] is False


def test_adult_classify_disabled_503(monkeypatch):
    monkeypatch.setenv("SUGGESTIVE_CLASSIFIER_ENABLED", "false")
    monkeypatch.setenv("NSFW_FRAME_GATE_ENABLED", "false")
    client = TestClient(app)
    response = client.post(
        "/api/adult/classify-frame",
        json={"imageBase64": _solid_jpeg_base64()},
    )
    assert response.status_code == 503
    assert response.json()["detail"] == "adult_moderation_disabled"


def test_adult_classify_suggestive_merge(monkeypatch):
    monkeypatch.setenv("SUGGESTIVE_CLASSIFIER_ENABLED", "true")
    monkeypatch.setenv("NSFW_FRAME_GATE_ENABLED", "true")
    monkeypatch.setenv("SUGGESTIVE_MODEL_CACHE_DIR", "C:\\Users\\cache\\suggestive-test")
    monkeypatch.setenv("NSFW_MODEL_CACHE_DIR", "C:\\Users\\cache\\nsfw-test")

    def fake_suggestive(_image_b64: str):
        return SimpleNamespace(
            label="sexy",
            score=0.81,
            scores={"sexy": 0.81, "safe": 0.1, "porn": 0.05, "hentai": 0.02, "drawing": 0.02},
            inference_ms=12.0,
            model_id="viddexa/nsfw-detection-2-nano",
            model_revision="rev",
        )

    def fake_falconsai(_image_b64: str):
        return SimpleNamespace(
            label="normal",
            nsfw_score=0.02,
            normal_score=0.98,
            is_nsfw=False,
            inference_ms=20.0,
            model_id="Falconsai/nsfw_image_detection",
            model_revision="rev",
        )

    monkeypatch.setattr(
        suggestive_classifier_service,
        "classify_image_base64",
        fake_suggestive,
    )
    monkeypatch.setattr(
        nsfw_frame_gate_service,
        "classify_image_base64",
        fake_falconsai,
    )

    client = TestClient(app)
    response = client.post(
        "/api/adult/classify-frame",
        json={"imageBase64": _solid_jpeg_base64()},
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["state"] == "SUGGESTIVE"
    assert payload["suggestive"]["label"] == "sexy"
    assert payload["falconsai"]["label"] == "normal"
    assert payload["auto_terminates_session"] is False


def test_adult_classify_falconsai_explicit(monkeypatch):
    monkeypatch.setenv("SUGGESTIVE_CLASSIFIER_ENABLED", "true")
    monkeypatch.setenv("NSFW_FRAME_GATE_ENABLED", "true")

    monkeypatch.setattr(
        suggestive_classifier_service,
        "classify_image_base64",
        lambda _b64: SimpleNamespace(
            label="safe",
            score=0.7,
            scores={"safe": 0.7},
            inference_ms=10.0,
            model_id="x",
            model_revision="y",
        ),
    )
    monkeypatch.setattr(
        nsfw_frame_gate_service,
        "classify_image_base64",
        lambda _b64: SimpleNamespace(
            label="nsfw",
            nsfw_score=0.95,
            normal_score=0.05,
            is_nsfw=True,
            inference_ms=15.0,
            model_id="Falconsai/nsfw_image_detection",
            model_revision="y",
        ),
    )

    client = TestClient(app)
    response = client.post(
        "/api/adult/classify-frame",
        json={"imageBase64": _solid_jpeg_base64()},
    )
    assert response.status_code == 200
    payload = response.json()
    # Falconsai alone → SUGGESTIVE (EXPLICIT requires porn/hentai mass + confirm).
    assert payload["state"] == "SUGGESTIVE"
    assert adult_mod_module.adult_moderation_service is not None
