from __future__ import annotations

from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, Field, field_validator, model_validator


class SourceCommentSnapshot(BaseModel):
    id: str = Field(min_length=1, max_length=64)
    room_id: str = Field(min_length=1, max_length=64)
    text: str = Field(min_length=1, max_length=600)
    author_display_name: str = Field(min_length=1, max_length=32)
    author_user_id: Optional[UUID] = None
    created_at: Optional[datetime] = None


class PredictionSnapshot(BaseModel):
    intent: str = Field(min_length=1, max_length=64)
    confidence: float = Field(ge=0.0, le=1.0)
    model_id: str = Field(min_length=1, max_length=128)
    model_version: str = Field(min_length=1, max_length=160)

    @field_validator("intent")
    @classmethod
    def normalize_intent(cls, value: str) -> str:
        return value.strip().upper()


class CreateIntentCorrectionRequest(BaseModel):
    source_comment: SourceCommentSnapshot
    prediction: PredictionSnapshot
    proposed_intent: str = Field(min_length=1, max_length=64)
    user_note: Optional[str] = Field(default=None, max_length=600)
    reporter_viewer_key: str = Field(min_length=1, max_length=128)
    reporter_user_id: Optional[UUID] = None
    livestream_session_id: Optional[UUID] = None

    @field_validator("proposed_intent")
    @classmethod
    def normalize_proposed_intent(cls, value: str) -> str:
        return value.strip().upper()

    @model_validator(mode="after")
    def validate_distinct_intents(self) -> "CreateIntentCorrectionRequest":
        if self.prediction.intent == self.proposed_intent:
            raise ValueError("proposed_intent must differ from predicted intent.")
        return self


class IntentCorrectionResponse(BaseModel):
    id: UUID
    status: str
    created_at: datetime

    @classmethod
    def from_model(cls, row) -> "IntentCorrectionResponse":
        return cls(
            id=row.id,
            status=row.status.value if hasattr(row.status, "value") else str(row.status),
            created_at=row.created_at,
        )
