from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional
from uuid import UUID

from sqlmodel import Session, col, select

from app.db.models import IntentCorrectionSample, IntentCorrectionStatus
from app.schemas.intent_corrections import CreateIntentCorrectionRequest


class IntentCorrectionRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def get_by_id(self, sample_id: UUID) -> Optional[IntentCorrectionSample]:
        return self._session.get(IntentCorrectionSample, sample_id)

    def list_by_status(
        self,
        *,
        status: IntentCorrectionStatus,
        limit: int,
        cursor_created_at: Optional[datetime] = None,
        cursor_id: Optional[UUID] = None,
    ) -> list[IntentCorrectionSample]:
        statement = (
            select(IntentCorrectionSample)
            .where(IntentCorrectionSample.status == status)
            .order_by(col(IntentCorrectionSample.created_at), col(IntentCorrectionSample.id))
            .limit(limit)
        )
        if cursor_created_at is not None and cursor_id is not None:
            statement = statement.where(
                (IntentCorrectionSample.created_at > cursor_created_at)
                | (
                    (IntentCorrectionSample.created_at == cursor_created_at)
                    & (IntentCorrectionSample.id > cursor_id)
                )
            )
        return list(self._session.exec(statement).all())

    def find_pending_duplicate(
        self,
        *,
        source_comment_id: str,
        reporter_viewer_key: str,
    ) -> Optional[IntentCorrectionSample]:
        statement = select(IntentCorrectionSample).where(
            IntentCorrectionSample.source_comment_id == source_comment_id,
            IntentCorrectionSample.reporter_viewer_key == reporter_viewer_key,
            IntentCorrectionSample.status == IntentCorrectionStatus.PENDING,
        )
        return self._session.exec(statement).first()

    def create(self, request: CreateIntentCorrectionRequest) -> IntentCorrectionSample:
        now = datetime.now(timezone.utc)
        predicted = request.prediction.intent.strip().upper()
        proposed = request.proposed_intent.strip().upper()
        row = IntentCorrectionSample(
            status=IntentCorrectionStatus.PENDING,
            room_id=request.source_comment.room_id.strip(),
            livestream_session_id=request.livestream_session_id,
            source_comment_id=request.source_comment.id.strip(),
            source_comment_text=request.source_comment.text.strip(),
            source_author_display_name=request.source_comment.author_display_name.strip(),
            source_author_user_id=request.source_comment.author_user_id,
            source_created_at=request.source_comment.created_at,
            reporter_user_id=request.reporter_user_id,
            reporter_viewer_key=request.reporter_viewer_key.strip(),
            predicted_intent=predicted,
            prediction_confidence=request.prediction.confidence,
            model_id=request.prediction.model_id.strip(),
            model_version=request.prediction.model_version.strip(),
            proposed_intent=proposed,
            user_note=request.user_note.strip() if request.user_note else None,
            created_at=now,
            updated_at=now,
        )
        self._session.add(row)
        self._session.commit()
        self._session.refresh(row)
        return row

    def apply_review(
        self,
        row: IntentCorrectionSample,
        *,
        status: IntentCorrectionStatus,
        final_intent: Optional[str],
        review_note: Optional[str],
        reviewed_by: Optional[str],
    ) -> IntentCorrectionSample:
        now = datetime.now(timezone.utc)
        row.status = status
        row.final_intent = final_intent
        row.review_note = review_note
        row.reviewed_at = now
        row.reviewed_by = reviewed_by
        row.updated_at = now
        self._session.add(row)
        self._session.commit()
        self._session.refresh(row)
        return row
