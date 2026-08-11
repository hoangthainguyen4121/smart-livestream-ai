"""Weapon/gun open-vocabulary detector API — local Grounding DINO, warning-only."""

from __future__ import annotations

from typing import Any, List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from starlette.concurrency import run_in_threadpool

from app.services.weapon_detector_service import (
    is_weapon_detector_enabled,
    weapon_detector_service,
)

router = APIRouter(prefix="/weapon", tags=["weapon-detector"])


class WeaponDetectRequest(BaseModel):
    imageBase64: str = Field(min_length=16, max_length=8_000_000)
    clientTimestampMs: Optional[int] = Field(default=None, ge=0)


class WeaponDetectionOut(BaseModel):
    label: str
    score: float
    box: List[float]


class WeaponDetectResponse(BaseModel):
    detections: List[WeaponDetectionOut]
    model_id: str
    model_revision: str
    inference_ms: float
    prompt: str
    stores_violation_images: bool = False
    auto_terminates_session: bool = False


def _require_enabled() -> None:
    if not is_weapon_detector_enabled():
        raise HTTPException(status_code=503, detail="weapon_detector_disabled")


@router.get("/status")
def weapon_status() -> dict[str, Any]:
    return weapon_detector_service.status()


@router.post("/detect-frame", response_model=WeaponDetectResponse)
async def detect_frame(request: WeaponDetectRequest) -> WeaponDetectResponse:
    _require_enabled()
    try:
        result = await run_in_threadpool(
            weapon_detector_service.detect_image_base64,
            request.imageBase64,
        )
    except RuntimeError as exc:
        detail = str(exc)
        if detail.startswith("weapon_"):
            raise HTTPException(status_code=503, detail=detail) from exc
        raise HTTPException(status_code=500, detail=detail) from exc
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(
            status_code=400,
            detail=f"weapon_detect_failed: {type(exc).__name__}: {exc}",
        ) from exc

    return WeaponDetectResponse(
        detections=[
            WeaponDetectionOut(label=item.label, score=item.score, box=item.box)
            for item in result.detections
        ],
        model_id=result.model_id,
        model_revision=result.model_revision,
        inference_ms=result.inference_ms,
        prompt=result.prompt,
        stores_violation_images=False,
        auto_terminates_session=False,
    )
