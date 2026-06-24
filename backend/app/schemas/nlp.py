from __future__ import annotations

from typing import List, Optional

from pydantic import BaseModel, Field


class PredictIntentRequest(BaseModel):
    text: str = Field(min_length=1, max_length=512)


class IntentTopKItem(BaseModel):
    intent: str
    confidence: float


class PredictIntentResponse(BaseModel):
    ml_available: bool
    intent: Optional[str] = None
    confidence: float = 0.0
    top_k: List[IntentTopKItem] = Field(default_factory=list)
    mapped_intent: Optional[str] = None
    mapped_action: Optional[str] = None
    suppress_event: bool = False
    is_complaint_escalation: bool = False
    is_spam_moderation: bool = False
    source: str = "unavailable"
    error: Optional[str] = None


class NlpHealthResponse(BaseModel):
    proxy_status: str
    ml_service_status: str
    ml_service_url: str
    ml_service_detail: Optional[str] = None
