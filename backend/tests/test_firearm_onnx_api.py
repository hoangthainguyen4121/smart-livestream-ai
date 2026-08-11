"""Firearm ONNX API tests (no weight download)."""

from __future__ import annotations

import base64
import io

from fastapi.testclient import TestClient
from PIL import Image

from app.main import app
from app.services.firearm_onnx_detector_service import firearm_onnx_detector_service


def _solid_jpeg_base64() -> str:
    image = Image.new("RGB", (64, 64), (80, 80, 80))
    buffer = io.BytesIO()
    image.save(buffer, format="JPEG", quality=80)
    encoded = base64.b64encode(buffer.getvalue()).decode("ascii")
    return f"data:image/jpeg;base64,{encoded}"


def test_firearm_status_disabled_by_default(monkeypatch):
    monkeypatch.delenv("FIREARM_ONNX_ENABLED", raising=False)
    firearm_onnx_detector_service.reset_for_tests()
    client = TestClient(app)
    response = client.get("/api/weapon/firearm-onnx/status")
    assert response.status_code == 200
    payload = response.json()
    assert payload["enabled"] is False
    assert payload["detector"] == "firearm_onnx"
    assert payload["model_id"] == "Subh775/Firearm_Detection_Yolov8n"
    assert payload["ultralytics_runtime"] is False
    assert payload["auto_terminates_session"] is False
    assert payload["classes"] == ["gun"]


def test_firearm_detect_disabled_returns_503(monkeypatch):
    monkeypatch.setenv("FIREARM_ONNX_ENABLED", "false")
    firearm_onnx_detector_service.reset_for_tests()
    client = TestClient(app)
    response = client.post(
        "/api/weapon/firearm-onnx/detect-frame",
        json={"imageBase64": _solid_jpeg_base64()},
    )
    assert response.status_code == 503
    assert response.json()["detail"] == "firearm_onnx_disabled"


def test_firearm_detect_requires_cache(monkeypatch):
    monkeypatch.setenv("FIREARM_ONNX_ENABLED", "true")
    monkeypatch.delenv("FIREARM_ONNX_CACHE_DIR", raising=False)
    monkeypatch.delenv("FIREARM_ONNX_MODEL_PATH", raising=False)
    firearm_onnx_detector_service.reset_for_tests()
    client = TestClient(app)
    response = client.post(
        "/api/weapon/firearm-onnx/detect-frame",
        json={"imageBase64": _solid_jpeg_base64()},
    )
    assert response.status_code == 503
    assert "firearm_onnx_cache_dir_required" in response.json()["detail"]
