from __future__ import annotations

from typing import Any, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.services.visual_embedding_service import (
    is_hand_held_vision_enabled,
    visual_embedding_service,
)

router = APIRouter(prefix="/product-vision", tags=["product-vision"])


class CatalogSyncItem(BaseModel):
    id: str
    name: str
    imageBase64: str = Field(min_length=16)


class SyncCatalogRequest(BaseModel):
    items: list[CatalogSyncItem] = Field(min_length=1)


class MatchHandCropRequest(BaseModel):
    cropImageBase64: str = Field(min_length=16)
    minimumScore: Optional[float] = Field(default=None, ge=0.0, le=1.0)


class VisualMatchResponse(BaseModel):
    productId: str
    productName: str
    score: float
    confidence: float
    source: str
    embedder: str
    explanation: str


def _require_enabled() -> None:
    if not is_hand_held_vision_enabled():
        raise HTTPException(status_code=503, detail="hand_held_vision_disabled")


@router.get("/status")
def product_vision_status() -> dict[str, Any]:
    return {
        "enabled": is_hand_held_vision_enabled(),
        "catalogIndexed": visual_embedding_service.catalog_size,
        "embedder": visual_embedding_service.embedder,
    }


@router.post("/sync-catalog")
def sync_catalog(request: SyncCatalogRequest) -> dict[str, Any]:
    _require_enabled()
    result = visual_embedding_service.sync_catalog(
        [item.model_dump() for item in request.items]
    )
    return {"ok": True, **result}


@router.post("/match-hand-crop")
def match_hand_crop(request: MatchHandCropRequest) -> VisualMatchResponse:
    _require_enabled()

    if visual_embedding_service.catalog_size == 0:
        raise HTTPException(status_code=409, detail="catalog_not_indexed")

    match = visual_embedding_service.match_crop(
        request.cropImageBase64,
        minimum_score=request.minimumScore or 0.55,
    )
    if match is None:
        raise HTTPException(status_code=404, detail="no_confident_match")

    return VisualMatchResponse(
        productId=match.product_id,
        productName=match.product_name,
        score=match.score,
        confidence=match.confidence,
        source=match.source,
        embedder=match.embedder,
        explanation=match.explanation,
    )
