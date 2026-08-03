from __future__ import annotations

import base64
from datetime import datetime
from typing import Optional
from uuid import UUID

from app.db.models import IntentCorrectionStatus
from app.intent_labels import is_valid_ml_intent_label
from app.repositories.intent_correction_repository import IntentCorrectionRepository
from app.schemas.intent_correction_admin import (
    IntentCorrectionListItem,
    IntentCorrectionListResponse,
    IntentCorrectionReviewDecision,
    ReviewIntentCorrectionRequest,
    ReviewIntentCorrectionResponse,
)

MAX_LIST_LIMIT = 50
DEFAULT_LIST_LIMIT = 50


class IntentCorrectionAdminError(ValueError):
    pass


class IntentCorrectionAlreadyReviewedError(IntentCorrectionAdminError):
    pass


class IntentCorrectionAdminService:
    def __init__(self, repository: IntentCorrectionRepository) -> None:
        self._repository = repository

    def list_pending(
        self,
        *,
        limit: int,
        cursor: Optional[str],
    ) -> IntentCorrectionListResponse:
        bounded_limit = max(1, min(limit, MAX_LIST_LIMIT))
        fetch_limit = bounded_limit + 1
        cursor_created_at: Optional[datetime] = None
        cursor_id: Optional[UUID] = None
        if cursor:
            cursor_created_at, cursor_id = self._parse_cursor(cursor)

        rows = self._repository.list_by_status(
            status=IntentCorrectionStatus.PENDING,
            limit=fetch_limit,
            cursor_created_at=cursor_created_at,
            cursor_id=cursor_id,
        )
        has_more = len(rows) > bounded_limit
        page_rows = rows[:bounded_limit]
        next_cursor = None
        if has_more and page_rows:
            last = page_rows[-1]
            next_cursor = self._encode_cursor(last.created_at, last.id)

        items = [self._to_list_item(row) for row in page_rows]
        return IntentCorrectionListResponse(items=items, next_cursor=next_cursor)

    def review(
        self,
        sample_id: UUID,
        request: ReviewIntentCorrectionRequest,
        *,
        reviewed_by: Optional[str],
    ) -> ReviewIntentCorrectionResponse:
        row = self._repository.get_by_id(sample_id)
        if row is None:
            raise IntentCorrectionAdminError("Intent correction sample not found.")

        current_status = (
            row.status.value if hasattr(row.status, "value") else str(row.status)
        )
        if current_status != IntentCorrectionStatus.PENDING.value:
            raise IntentCorrectionAlreadyReviewedError(
                f"Intent correction sample is already {current_status}."
            )

        snapshot = self._prediction_snapshot(row)

        if request.decision == IntentCorrectionReviewDecision.APPROVED:
            final_intent = request.final_intent
            if not final_intent:
                raise IntentCorrectionAdminError("final_intent is required for approval.")
            if not is_valid_ml_intent_label(final_intent):
                raise IntentCorrectionAdminError(f"Invalid final intent: {final_intent}")
            updated = self._repository.apply_review(
                row,
                status=IntentCorrectionStatus.APPROVED,
                final_intent=final_intent.strip().upper(),
                review_note=self._normalize_note(request.review_note),
                reviewed_by=reviewed_by,
            )
        else:
            updated = self._repository.apply_review(
                row,
                status=IntentCorrectionStatus.REJECTED,
                final_intent=None,
                review_note=self._normalize_note(request.review_note),
                reviewed_by=reviewed_by,
            )

        self._assert_prediction_snapshot_unchanged(updated, snapshot)
        return ReviewIntentCorrectionResponse.from_model(updated)

    @staticmethod
    def _normalize_note(value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        normalized = value.strip()
        return normalized or None

    @staticmethod
    def _to_list_item(row) -> IntentCorrectionListItem:
        status_value = row.status.value if hasattr(row.status, "value") else str(row.status)
        return IntentCorrectionListItem(
            id=row.id,
            source_comment_text=row.source_comment_text,
            source_author_display_name=row.source_author_display_name,
            created_at=row.created_at,
            predicted_intent=row.predicted_intent,
            prediction_confidence=row.prediction_confidence,
            model_id=row.model_id,
            model_version=row.model_version,
            proposed_intent=row.proposed_intent,
            user_note=row.user_note,
            status=status_value,
        )

    @staticmethod
    def _encode_cursor(created_at: datetime, sample_id: UUID) -> str:
        raw = f"{created_at.isoformat()}|{sample_id}"
        return base64.urlsafe_b64encode(raw.encode("utf-8")).decode("ascii")

    @staticmethod
    def _parse_cursor(cursor: str) -> tuple[datetime, UUID]:
        try:
            decoded = base64.urlsafe_b64decode(cursor.encode("ascii")).decode("utf-8")
        except (ValueError, UnicodeDecodeError) as error:
            raise IntentCorrectionAdminError("Invalid cursor.") from error
        if "|" not in decoded:
            raise IntentCorrectionAdminError("Invalid cursor.")
        created_at_raw, sample_id_raw = decoded.split("|", 1)
        try:
            created_at = datetime.fromisoformat(created_at_raw)
            sample_id = UUID(sample_id_raw)
        except ValueError as error:
            raise IntentCorrectionAdminError("Invalid cursor.") from error
        return created_at, sample_id

    @staticmethod
    def _prediction_snapshot(row) -> dict[str, object]:
        return {
            "predicted_intent": row.predicted_intent,
            "prediction_confidence": row.prediction_confidence,
            "model_id": row.model_id,
            "model_version": row.model_version,
            "proposed_intent": row.proposed_intent,
        }

    @staticmethod
    def _assert_prediction_snapshot_unchanged(row, snapshot: dict[str, object]) -> None:
        for key, expected in snapshot.items():
            if getattr(row, key) != expected:
                raise IntentCorrectionAdminError(
                    f"Prediction snapshot field {key} must not change during review."
                )
