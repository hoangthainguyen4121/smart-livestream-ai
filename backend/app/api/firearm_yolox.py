"""Custom Firearm YOLOX API — local/thesis primary path; warning-only, no production deploy."""

from __future__ import annotations

from typing import Any, List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from starlette.concurrency import run_in_threadpool

from app.services.firearm_yolox_detector_service import (
    firearm_yolox_detector_service,
    is_firearm_yolox_enabled,
)

router = APIRouter(prefix="/weapon/firearm-yolox", tags=["firearm-yolox-ab"])


class DetectRequest(BaseModel):
    imageBase64: str = Field(min_length=16, max_length=8_000_000)
    clientTimestampMs: Optional[int] = Field(default=None, ge=0)


class DetectionOut(BaseModel):
    label: str
    score: float
    box: List[float]


class DetectResponse(BaseModel):
    detections: List[DetectionOut]
    model_id: str
    model_revision: str
    inference_ms: float
    detector: str = "firearm_yolox"
    prompt: str = ""
    top_score: float = 0.0
    conf_threshold: float = 0.02
    stores_violation_images: bool = False
    auto_terminates_session: bool = False


def _require_enabled() -> None:
    if not is_firearm_yolox_enabled():
        raise HTTPException(status_code=503, detail="firearm_yolox_disabled")


@router.get("/status")
def status() -> dict[str, Any]:
    return firearm_yolox_detector_service.status()


@router.post("/detect-frame", response_model=DetectResponse)
async def detect_frame(request: DetectRequest) -> DetectResponse:
    _require_enabled()
    try:
        result = await run_in_threadpool(
            firearm_yolox_detector_service.detect_image_base64,
            request.imageBase64,
        )
    except RuntimeError as exc:
        detail = str(exc)
        if detail.startswith("firearm_yolox_"):
            raise HTTPException(status_code=503, detail=detail) from exc
        raise HTTPException(status_code=500, detail=detail) from exc
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(
            status_code=400,
            detail=f"firearm_yolox_detect_failed: {type(exc).__name__}: {exc}",
        ) from exc

    return DetectResponse(
        detections=[
            DetectionOut(label=item.label, score=item.score, box=item.box)
            for item in result.detections
        ],
        model_id=result.model_id,
        model_revision=result.model_revision,
        inference_ms=result.inference_ms,
        detector=result.detector,
        top_score=result.top_score,
        conf_threshold=result.conf_threshold,
    )
