from __future__ import annotations

from fastapi import APIRouter, HTTPException, Response, status

from app.db.engine import get_session_factory, is_feedback_db_configured
from app.repositories.intent_correction_repository import IntentCorrectionRepository
from app.schemas.intent_corrections import CreateIntentCorrectionRequest, IntentCorrectionResponse
from app.services.intent_correction_service import (
    IntentCorrectionService,
    IntentCorrectionValidationError,
)


router = APIRouter(prefix="/intent-corrections", tags=["intent-corrections"])

FEEDBACK_DB_DISABLED_CODE = "feedback_database_disabled"


def _require_feedback_db() -> None:
    if not is_feedback_db_configured():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={
                "code": FEEDBACK_DB_DISABLED_CODE,
                "message": (
                    "Intent correction storage requires DATABASE_URL. "
                    "Chat can remain in CHAT_PERSISTENCE_MODE=memory."
                ),
            },
        )


@router.post("", response_model=IntentCorrectionResponse)
def create_intent_correction(
    request: CreateIntentCorrectionRequest,
    response: Response,
) -> IntentCorrectionResponse:
    _require_feedback_db()

    with get_session_factory() as db_session:
        repository = IntentCorrectionRepository(db_session)
        service = IntentCorrectionService(repository)
        try:
            result, is_duplicate = service.create(request)
            response.status_code = (
                status.HTTP_200_OK if is_duplicate else status.HTTP_201_CREATED
            )
            return result
        except IntentCorrectionValidationError as error:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=str(error),
            ) from error
