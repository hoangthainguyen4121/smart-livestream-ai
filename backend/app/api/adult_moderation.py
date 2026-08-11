"""Unified adult moderation API — SAFE | SUGGESTIVE | EXPLICIT (no auto terminate)."""

from __future__ import annotations

from typing import Any, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from starlette.concurrency import run_in_threadpool

from app.services.adult_moderation_service import (
    adult_moderation_service,
    is_adult_moderation_enabled,
)

router = APIRouter(prefix="/adult", tags=["adult-moderation"])


class ClassifyFrameRequest(BaseModel):
    imageBase64: str = Field(min_length=16, max_length=8_000_000)
    clientTimestampMs: Optional[int] = Field(default=None, ge=0)


def _require_enabled() -> None:
    if not is_adult_moderation_enabled():
        raise HTTPException(status_code=503, detail="adult_moderation_disabled")


@router.get("/status")
def adult_status() -> dict[str, Any]:
    return adult_moderation_service.status()


@router.post("/classify-frame")
async def classify_frame(request: ClassifyFrameRequest) -> dict[str, Any]:
    _require_enabled()

    try:
        result = await run_in_threadpool(
            adult_moderation_service.classify_image_base64,
            request.imageBase64,
        )
    except RuntimeError as exc:
        detail = str(exc)
        if detail.startswith("adult_moderation_disabled"):
            raise HTTPException(status_code=503, detail=detail) from exc
        if "cache_dir_required" in detail or "cache_inside_project" in detail:
            raise HTTPException(status_code=503, detail=detail) from exc
        if "dependencies_missing" in detail or "model_load_failed" in detail:
            raise HTTPException(status_code=503, detail=detail) from exc
        if detail.startswith("adult_classify_failed"):
            raise HTTPException(status_code=503, detail=detail) from exc
        raise HTTPException(status_code=500, detail=detail) from exc
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(
            status_code=400,
            detail=f"adult_classify_failed: {type(exc).__name__}: {exc}",
        ) from exc

    return result
