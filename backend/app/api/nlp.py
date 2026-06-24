from __future__ import annotations

from typing import List, Optional

from fastapi import APIRouter

from app.schemas.nlp import (
    IntentTopKItem,
    NlpHealthResponse,
    PredictIntentRequest,
    PredictIntentResponse,
)
from app.services.ml_intent_client import (
    fetch_ml_health,
    get_ml_intent_api_url,
    predict_ml_intent,
)
from app.services.ml_intent_mapper import map_ml_intent


router = APIRouter(prefix="/nlp", tags=["nlp"])


def _parse_top_k(raw_top_k: Optional[List[dict]]) -> List[IntentTopKItem]:
    if not raw_top_k:
        return []

    items: list[IntentTopKItem] = []
    for entry in raw_top_k:
        intent = entry.get("intent")
        confidence = entry.get("confidence")
        if not intent or confidence is None:
            continue
        items.append(
            IntentTopKItem(
                intent=str(intent),
                confidence=float(confidence),
            ),
        )
    return items


@router.get("/health", response_model=NlpHealthResponse)
async def nlp_health() -> NlpHealthResponse:
    ml_status, detail = await fetch_ml_health()
    return NlpHealthResponse(
        proxy_status="ok",
        ml_service_status=ml_status,
        ml_service_url=get_ml_intent_api_url(),
        ml_service_detail=detail,
    )


@router.post("/predict-intent", response_model=PredictIntentResponse)
async def predict_intent(request: PredictIntentRequest) -> PredictIntentResponse:
    ml_payload = await predict_ml_intent(request.text.strip())
    if ml_payload is None:
        return PredictIntentResponse(
            ml_available=False,
            source="unavailable",
            error="ml_service_unavailable",
        )

    ml_intent = str(ml_payload.get("intent") or "")
    confidence = float(ml_payload.get("confidence") or 0.0)
    top_k = _parse_top_k(ml_payload.get("top_k"))
    mapped = map_ml_intent(ml_intent)

    return PredictIntentResponse(
        ml_available=True,
        intent=ml_intent,
        confidence=confidence,
        top_k=top_k,
        mapped_intent=mapped.mapped_intent,
        mapped_action=mapped.mapped_action,
        suppress_event=mapped.suppress_event,
        is_complaint_escalation=mapped.is_complaint_escalation,
        is_spam_moderation=mapped.is_spam_moderation,
        source="ml",
    )
