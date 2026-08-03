from __future__ import annotations

from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.admin_auth import require_admin_api_key, resolve_reviewer_label
from app.db.engine import get_session_factory, is_feedback_db_configured
from app.repositories.intent_correction_repository import IntentCorrectionRepository
from app.schemas.intent_correction_admin import (
    IntentCorrectionListResponse,
    ReviewIntentCorrectionRequest,
    ReviewIntentCorrectionResponse,
)
from app.services.intent_correction_admin_service import (
    DEFAULT_LIST_LIMIT,
    IntentCorrectionAdminError,
    IntentCorrectionAdminService,
    IntentCorrectionAlreadyReviewedError,
)
from app.api.intent_corrections import _require_feedback_db


router = APIRouter(
    prefix="/admin/intent-corrections",
    tags=["admin-intent-corrections"],
    dependencies=[Depends(require_admin_api_key)],
)


@router.get("", response_model=IntentCorrectionListResponse)
def list_intent_corrections(
    status_filter: str = Query(default="pending", alias="status"),
    limit: int = Query(default=DEFAULT_LIST_LIMIT, ge=1, le=50),
    cursor: Optional[str] = Query(default=None),
) -> IntentCorrectionListResponse:
    _require_feedback_db()
    if status_filter.strip().lower() != "pending":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only status=pending is supported in this slice.",
        )

    with get_session_factory() as db_session:
        repository = IntentCorrectionRepository(db_session)
        service = IntentCorrectionAdminService(repository)
        try:
            return service.list_pending(limit=limit, cursor=cursor)
        except IntentCorrectionAdminError as error:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=str(error),
            ) from error


@router.post("/{sample_id}/review", response_model=ReviewIntentCorrectionResponse)
def review_intent_correction(
    sample_id: UUID,
    request: ReviewIntentCorrectionRequest,
    reviewer_label: Optional[str] = Depends(resolve_reviewer_label),
) -> ReviewIntentCorrectionResponse:
    _require_feedback_db()

    with get_session_factory() as db_session:
        repository = IntentCorrectionRepository(db_session)
        service = IntentCorrectionAdminService(repository)
        try:
            return service.review(sample_id, request, reviewed_by=reviewer_label)
        except IntentCorrectionAlreadyReviewedError as error:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={
                    "code": "intent_correction_already_reviewed",
                    "message": str(error),
                },
            ) from error
        except IntentCorrectionAdminError as error:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=str(error),
            ) from error
