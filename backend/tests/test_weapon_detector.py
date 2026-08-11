"""Weapon detector API tests (mocked — no weight download)."""

from __future__ import annotations

import base64
import io

from fastapi.testclient import TestClient
from PIL import Image

from app.main import app
from app.services.weapon_detector_service import (
    WeaponDetection,
    WeaponDetectResult,
    normalize_weapon_label,
    weapon_detector_service,
)


def _solid_jpeg_base64() -> str:
    image = Image.new("RGB", (64, 64), (80, 80, 80))
    buffer = io.BytesIO()
    image.save(buffer, format="JPEG", quality=80)
    encoded = base64.b64encode(buffer.getvalue()).decode("ascii")
    return f"data:image/jpeg;base64,{encoded}"


def test_normalize_weapon_label():
    assert normalize_weapon_label("pistol") == "pistol"
    assert normalize_weapon_label("a rifle.") == "rifle"
    assert normalize_weapon_label("kitchen knife") == "knife"
    assert normalize_weapon_label("pair of scissors") == "scissors"
    assert normalize_weapon_label("banana") is None


def test_weapon_status_disabled_by_default(monkeypatch):
    monkeypatch.delenv("WEAPON_DETECTOR_ENABLED", raising=False)
    weapon_detector_service.reset_for_tests()
    client = TestClient(app)
    response = client.get("/api/weapon/status")
    assert response.status_code == 200
    payload = response.json()
    assert payload["enabled"] is False
    assert payload["model_id"] == "IDEA-Research/grounding-dino-tiny"
    assert payload["model_revision"] == "a2bb814dd30d776dcf7e30523b00659f4f141c71"
    assert payload["auto_terminates_session"] is False
    assert payload["stores_violation_images"] is False
    assert "gun" in payload["prompt"]


def test_detect_disabled_returns_503(monkeypatch):
    monkeypatch.setenv("WEAPON_DETECTOR_ENABLED", "false")
    weapon_detector_service.reset_for_tests()
    client = TestClient(app)
    response = client.post(
        "/api/weapon/detect-frame",
        json={"imageBase64": _solid_jpeg_base64()},
    )
    assert response.status_code == 503
    assert response.json()["detail"] == "weapon_detector_disabled"


def test_detect_requires_external_cache(monkeypatch):
    monkeypatch.setenv("WEAPON_DETECTOR_ENABLED", "true")
    monkeypatch.delenv("WEAPON_MODEL_CACHE_DIR", raising=False)
    monkeypatch.delenv("HF_HOME", raising=False)
    monkeypatch.delenv("TRANSFORMERS_CACHE", raising=False)
    weapon_detector_service.reset_for_tests()

    client = TestClient(app)
    response = client.post(
        "/api/weapon/detect-frame",
        json={"imageBase64": _solid_jpeg_base64()},
    )
    assert response.status_code == 503
    assert "weapon_cache_dir_required" in response.json()["detail"]


def test_detect_rejects_cache_inside_poc(monkeypatch):
    from pathlib import Path

    monkeypatch.setenv("WEAPON_DETECTOR_ENABLED", "true")
    poc_root = Path(__file__).resolve().parents[2]
    inside = poc_root / "storage" / "weapon-cache-should-fail"
    inside.mkdir(parents=True, exist_ok=True)
    monkeypatch.setenv("WEAPON_MODEL_CACHE_DIR", str(inside))
    weapon_detector_service.reset_for_tests()

    client = TestClient(app)
    response = client.post(
        "/api/weapon/detect-frame",
        json={"imageBase64": _solid_jpeg_base64()},
    )
    assert response.status_code == 503
    assert "weapon_cache_inside_project" in response.json()["detail"]


def test_detect_success_with_mocked_service(monkeypatch):
    monkeypatch.setenv("WEAPON_DETECTOR_ENABLED", "true")

    def _fake_detect(_image_base64: str) -> WeaponDetectResult:
        return WeaponDetectResult(
            detections=[
                WeaponDetection(
                    label="pistol",
                    score=0.81,
                    box=[10.0, 20.0, 110.0, 140.0],
                )
            ],
            model_id="IDEA-Research/grounding-dino-tiny",
            model_revision="a2bb814dd30d776dcf7e30523b00659f4f141c71",
            inference_ms=42.0,
            prompt="gun. pistol. rifle. firearm. knife. scissors.",
        )

    monkeypatch.setattr(
        weapon_detector_service,
        "detect_image_base64",
        _fake_detect,
    )

    client = TestClient(app)
    response = client.post(
        "/api/weapon/detect-frame",
        json={"imageBase64": _solid_jpeg_base64()},
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["detections"][0]["label"] == "pistol"
    assert payload["detections"][0]["score"] == 0.81
    assert payload["auto_terminates_session"] is False
    assert payload["stores_violation_images"] is False
