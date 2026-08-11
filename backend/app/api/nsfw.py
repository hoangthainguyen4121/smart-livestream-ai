"""Adult/NSFW frame-gate API — local inference only, no auto session close."""

from __future__ import annotations

from typing import Any, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from starlette.concurrency import run_in_threadpool

from app.services.nsfw_frame_gate_service import (
    is_nsfw_frame_gate_enabled,
    nsfw_frame_gate_service,
)

router = APIRouter(prefix="/nsfw", tags=["nsfw-frame-gate"])


class ClassifyFrameRequest(BaseModel):
    imageBase64: str = Field(min_length=16, max_length=8_000_000)
    clientTimestampMs: Optional[int] = Field(default=None, ge=0)


class ClassifyFrameResponse(BaseModel):
    label: str
    nsfw_score: float
    normal_score: float
    is_nsfw: bool
    model_id: str
    model_revision: str
    inference_ms: float
    stores_violation_images: bool = False
    auto_terminates_session: bool = False


def _require_enabled() -> None:
    if not is_nsfw_frame_gate_enabled():
        raise HTTPException(status_code=503, detail="nsfw_frame_gate_disabled")


@router.get("/status")
def nsfw_status() -> dict[str, Any]:
    return nsfw_frame_gate_service.status()


@router.post("/classify-frame", response_model=ClassifyFrameResponse)
async def classify_frame(request: ClassifyFrameRequest) -> ClassifyFrameResponse:
    _require_enabled()

    try:
        result = await run_in_threadpool(
            nsfw_frame_gate_service.classify_image_base64,
            request.imageBase64,
        )
    except RuntimeError as exc:
        detail = str(exc)
        if detail.startswith("nsfw_dependencies_missing"):
            raise HTTPException(status_code=503, detail=detail) from exc
        if detail.startswith("nsfw_cache_"):
            raise HTTPException(status_code=503, detail=detail) from exc
        if detail.startswith("nsfw_model_load_failed"):
            raise HTTPException(status_code=503, detail=detail) from exc
        raise HTTPException(status_code=500, detail=detail) from exc
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(
            status_code=400,
            detail=f"nsfw_classify_failed: {type(exc).__name__}: {exc}",
        ) from exc

    return ClassifyFrameResponse(
        label=result.label,
        nsfw_score=result.nsfw_score,
        normal_score=result.normal_score,
        is_nsfw=result.is_nsfw,
        model_id=result.model_id,
        model_revision=result.model_revision,
        inference_ms=result.inference_ms,
        stores_violation_images=False,
        auto_terminates_session=False,
    )
