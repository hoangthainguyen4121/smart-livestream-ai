from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, Field, field_validator, model_validator


class IntentCorrectionReviewDecision(str, Enum):
    APPROVED = "approved"
    REJECTED = "rejected"


class IntentCorrectionListItem(BaseModel):
    id: UUID
    source_comment_text: str
    source_author_display_name: str
    created_at: datetime
    predicted_intent: str
    prediction_confidence: float
    model_id: str
    model_version: str
    proposed_intent: str
    user_note: Optional[str]
    status: str


class IntentCorrectionListResponse(BaseModel):
    items: list[IntentCorrectionListItem]
    next_cursor: Optional[str] = None


class ReviewIntentCorrectionRequest(BaseModel):
    decision: IntentCorrectionReviewDecision
    final_intent: Optional[str] = Field(default=None, max_length=64)
    review_note: Optional[str] = Field(default=None, max_length=600)

    @field_validator("final_intent")
    @classmethod
    def normalize_final_intent(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        normalized = value.strip().upper()
        return normalized or None

    @model_validator(mode="after")
    def validate_decision_fields(self) -> "ReviewIntentCorrectionRequest":
        if self.decision == IntentCorrectionReviewDecision.APPROVED:
            if not self.final_intent:
                raise ValueError("final_intent is required when decision is approved.")
        if self.decision == IntentCorrectionReviewDecision.REJECTED and self.final_intent:
            raise ValueError("final_intent must not be set when decision is rejected.")
        return self


class ReviewIntentCorrectionResponse(BaseModel):
    id: UUID
    status: str
    final_intent: Optional[str]
    review_note: Optional[str]
    reviewed_at: datetime
    reviewed_by: Optional[str]

    @classmethod
    def from_model(cls, row) -> "ReviewIntentCorrectionResponse":
        status_value = row.status.value if hasattr(row.status, "value") else str(row.status)
        return cls(
            id=row.id,
            status=status_value,
            final_intent=row.final_intent,
            review_note=row.review_note,
            reviewed_at=row.reviewed_at,
            reviewed_by=row.reviewed_by,
        )
