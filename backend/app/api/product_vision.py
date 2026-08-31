from __future__ import annotations

from typing import Any, Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from pydantic import BaseModel, Field

from app.db.models import User
from app.services.auth_service import get_optional_user
from app.services.host_lease import verify_host_token
from app.services.live_session_moderation import get_active_live_session
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
    roomId: str = Field(min_length=1, max_length=64)
    items: list[CatalogSyncItem]


class MatchHandCropRequest(BaseModel):
    roomId: str = Field(min_length=1, max_length=64)
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
def product_vision_status(room_id: Optional[str] = Query(default=None)) -> dict[str, Any]:
    return {
        "enabled": is_hand_held_vision_enabled(),
        "catalogIndexed": visual_embedding_service.catalog_size(room_id) if room_id else 0,
        "embedder": visual_embedding_service.embedder,
    }


@router.post("/sync-catalog")
def sync_catalog(
    request: SyncCatalogRequest,
    user: Optional[User] = Depends(get_optional_user),
    host_token: Optional[str] = Header(default=None, alias="X-Host-Token"),
) -> dict[str, Any]:
    _require_enabled()
    session = get_active_live_session(request.roomId)
    if session is None:
        raise HTTPException(status_code=404, detail="active_room_not_found")
    seller_user_id = getattr(session, "seller_user_id", None)
    metadata = dict(getattr(session, "metadata_json", None) or {})
    if user is not None and seller_user_id == user.id:
        pass
    elif host_token and verify_host_token(metadata, host_token):
        pass
    elif user is None and not host_token:
        raise HTTPException(status_code=401, detail="room_host_authorization_required")
    else:
        raise HTTPException(status_code=403, detail="room_host_forbidden")
    result = visual_embedding_service.sync_catalog(
        request.roomId,
        [item.model_dump() for item in request.items]
    )
    return {"ok": True, **result}


@router.post("/match-hand-crop")
def match_hand_crop(request: MatchHandCropRequest) -> VisualMatchResponse:
    _require_enabled()

    if visual_embedding_service.catalog_size(request.roomId) == 0:
        raise HTTPException(status_code=409, detail="catalog_not_indexed")

    match = visual_embedding_service.match_crop(
        request.roomId,
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
