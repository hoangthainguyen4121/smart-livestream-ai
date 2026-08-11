"""NSFW frame-gate API tests (no model download / weight load)."""

from __future__ import annotations

import base64
import io

from fastapi.testclient import TestClient
from PIL import Image

from app.main import app
from app.services.nsfw_frame_gate_service import (
    NsfwClassificationResult,
    nsfw_frame_gate_service,
)


def _solid_jpeg_base64() -> str:
    image = Image.new("RGB", (64, 64), (40, 40, 40))
    buffer = io.BytesIO()
    image.save(buffer, format="JPEG", quality=80)
    encoded = base64.b64encode(buffer.getvalue()).decode("ascii")
    return f"data:image/jpeg;base64,{encoded}"


def test_nsfw_status_disabled_by_default(monkeypatch):
    monkeypatch.delenv("NSFW_FRAME_GATE_ENABLED", raising=False)
    nsfw_frame_gate_service.reset_for_tests()
    client = TestClient(app)
    response = client.get("/api/nsfw/status")
    assert response.status_code == 200
    payload = response.json()
    assert payload["enabled"] is False
    assert payload["model_id"] == "Falconsai/nsfw_image_detection"
    assert payload["model_revision"] == "04367978d3474804ab1a00a9bd6548b741764069"
    assert payload["trust_remote_code"] is False
    assert payload["auto_terminates_session"] is False
    assert payload["stores_violation_images"] is False


def test_classify_disabled_returns_503(monkeypatch):
    monkeypatch.setenv("NSFW_FRAME_GATE_ENABLED", "false")
    nsfw_frame_gate_service.reset_for_tests()
    client = TestClient(app)
    response = client.post(
        "/api/nsfw/classify-frame",
        json={"imageBase64": _solid_jpeg_base64()},
    )
    assert response.status_code == 503
    assert response.json()["detail"] == "nsfw_frame_gate_disabled"


def test_classify_requires_external_cache(monkeypatch):
    monkeypatch.setenv("NSFW_FRAME_GATE_ENABLED", "true")
    monkeypatch.delenv("NSFW_MODEL_CACHE_DIR", raising=False)
    monkeypatch.delenv("HF_HOME", raising=False)
    monkeypatch.delenv("TRANSFORMERS_CACHE", raising=False)
    nsfw_frame_gate_service.reset_for_tests()

    client = TestClient(app)
    response = client.post(
        "/api/nsfw/classify-frame",
        json={"imageBase64": _solid_jpeg_base64()},
    )
    assert response.status_code == 503
    assert "nsfw_cache_dir_required" in response.json()["detail"]


def test_classify_rejects_cache_inside_poc(monkeypatch, tmp_path):
    monkeypatch.setenv("NSFW_FRAME_GATE_ENABLED", "true")
    # Point cache into the POC tree (service file lives under backend/app/services).
    from pathlib import Path

    poc_root = Path(__file__).resolve().parents[2]
    inside = poc_root / "storage" / "nsfw-cache-should-fail"
    inside.mkdir(parents=True, exist_ok=True)
    monkeypatch.setenv("NSFW_MODEL_CACHE_DIR", str(inside))
    nsfw_frame_gate_service.reset_for_tests()

    client = TestClient(app)
    response = client.post(
        "/api/nsfw/classify-frame",
        json={"imageBase64": _solid_jpeg_base64()},
    )
    assert response.status_code == 503
    assert "nsfw_cache_inside_project" in response.json()["detail"]


def test_classify_success_with_mocked_service(monkeypatch):
    monkeypatch.setenv("NSFW_FRAME_GATE_ENABLED", "true")

    def _fake_classify(_image_base64: str) -> NsfwClassificationResult:
        return NsfwClassificationResult(
            label="normal",
            nsfw_score=0.12,
            normal_score=0.88,
            is_nsfw=False,
            model_id="Falconsai/nsfw_image_detection",
            model_revision="04367978d3474804ab1a00a9bd6548b741764069",
            inference_ms=12.5,
        )

    monkeypatch.setattr(
        nsfw_frame_gate_service,
        "classify_image_base64",
        _fake_classify,
    )

    client = TestClient(app)
    response = client.post(
        "/api/nsfw/classify-frame",
        json={"imageBase64": _solid_jpeg_base64()},
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["label"] == "normal"
    assert payload["is_nsfw"] is False
    assert payload["auto_terminates_session"] is False
    assert payload["stores_violation_images"] is False
