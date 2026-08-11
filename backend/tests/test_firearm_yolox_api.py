"""Custom Firearm YOLOX API tests (no weight download)."""

from __future__ import annotations

import base64
import io

from fastapi.testclient import TestClient
from PIL import Image

from app.main import app
from app.services.firearm_yolox_detector_service import firearm_yolox_detector_service


def _solid_jpeg_base64() -> str:
    image = Image.new("RGB", (64, 64), (80, 80, 80))
    buffer = io.BytesIO()
    image.save(buffer, format="JPEG", quality=80)
    encoded = base64.b64encode(buffer.getvalue()).decode("ascii")
    return f"data:image/jpeg;base64,{encoded}"


def test_yolox_status_disabled_by_default(monkeypatch):
    monkeypatch.delenv("FIREARM_YOLOX_ENABLED", raising=False)
    firearm_yolox_detector_service.reset_for_tests()
    client = TestClient(app)
    response = client.get("/api/weapon/firearm-yolox/status")
    assert response.status_code == 200
    payload = response.json()
    assert payload["enabled"] is False
    assert payload["detector"] == "firearm_yolox"
    assert payload["model_id"] == "custom_gun_yolox_nano"
    assert payload["ultralytics_runtime"] is False
    assert payload["auto_terminates_session"] is False
    assert payload["conf_threshold"] == 0.02
    assert payload["production_default"] is False


def test_yolox_detect_disabled_returns_503(monkeypatch):
    monkeypatch.setenv("FIREARM_YOLOX_ENABLED", "false")
    firearm_yolox_detector_service.reset_for_tests()
    client = TestClient(app)
    response = client.post(
        "/api/weapon/firearm-yolox/detect-frame",
        json={"imageBase64": _solid_jpeg_base64()},
    )
    assert response.status_code == 503
    assert response.json()["detail"] == "firearm_yolox_disabled"


def test_yolox_detect_missing_onnx_returns_503(monkeypatch, tmp_path):
    monkeypatch.setenv("FIREARM_YOLOX_ENABLED", "true")
    monkeypatch.setenv("FIREARM_YOLOX_CACHE_DIR", str(tmp_path))
    monkeypatch.delenv("FIREARM_YOLOX_MODEL_PATH", raising=False)
    firearm_yolox_detector_service.reset_for_tests()
    client = TestClient(app)
    response = client.post(
        "/api/weapon/firearm-yolox/detect-frame",
        json={"imageBase64": _solid_jpeg_base64()},
    )
    assert response.status_code == 503
    assert "firearm_yolox_missing" in response.json()["detail"]


def test_yolox_status_reports_conf_threshold_env(monkeypatch):
    monkeypatch.setenv("FIREARM_YOLOX_ENABLED", "true")
    monkeypatch.setenv("FIREARM_YOLOX_CONF", "0.02")
    firearm_yolox_detector_service.reset_for_tests()
    client = TestClient(app)
    payload = client.get("/api/weapon/firearm-yolox/status").json()
    assert payload["enabled"] is True
    assert float(payload["conf_threshold"]) == 0.02
