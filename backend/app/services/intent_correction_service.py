from __future__ import annotations

from app.intent_labels import is_valid_ml_intent_label
from app.repositories.intent_correction_repository import IntentCorrectionRepository
from app.schemas.intent_corrections import CreateIntentCorrectionRequest, IntentCorrectionResponse


class IntentCorrectionValidationError(ValueError):
    pass


class IntentCorrectionService:
    def __init__(self, repository: IntentCorrectionRepository) -> None:
        self._repository = repository

    def create(
        self,
        request: CreateIntentCorrectionRequest,
    ) -> tuple[IntentCorrectionResponse, bool]:
        predicted = request.prediction.intent.strip().upper()
        proposed = request.proposed_intent.strip().upper()

        if not is_valid_ml_intent_label(predicted):
            raise IntentCorrectionValidationError(f"Invalid predicted intent: {predicted}")
        if not is_valid_ml_intent_label(proposed):
            raise IntentCorrectionValidationError(f"Invalid proposed intent: {proposed}")
        if predicted == proposed:
            raise IntentCorrectionValidationError("proposed_intent must differ from predicted intent.")

        existing = self._repository.find_pending_duplicate(
            source_comment_id=request.source_comment.id.strip(),
            reporter_viewer_key=request.reporter_viewer_key.strip(),
        )
        if existing is not None:
            return IntentCorrectionResponse.from_model(existing), True

        row = self._repository.create(request)
        return IntentCorrectionResponse.from_model(row), False
