from pathlib import Path
import sys
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient


BACKEND_ROOT = Path(__file__).resolve().parents[1]
PROJECT_ROOT = BACKEND_ROOT.parent

for path in (BACKEND_ROOT, PROJECT_ROOT):
    path_text = str(path)
    if path_text not in sys.path:
        sys.path.insert(0, path_text)

from app.main import app  # noqa: E402
from app.services.ml_intent_mapper import map_ml_intent  # noqa: E402


client = TestClient(app)


def test_map_ml_intent_variant_to_size() -> None:
    mapped = map_ml_intent("ASK_VARIANT")

    assert mapped.mapped_intent == "ASK_SIZE"
    assert mapped.mapped_action == "AUTO_REPLY_SUGGESTED"


def test_map_ml_intent_chitchat_suppresses_event() -> None:
    mapped = map_ml_intent("CHITCHAT")

    assert mapped.mapped_intent == "UNKNOWN"
    assert mapped.suppress_event is True


def test_map_ml_intent_complaint_escalates() -> None:
    mapped = map_ml_intent("COMPLAINT")

    assert mapped.mapped_action == "ESCALATE_TO_HOST"
    assert mapped.is_complaint_escalation is True


@patch("app.api.nlp.fetch_ml_health", new_callable=AsyncMock)
def test_nlp_health_reports_ml_unavailable(mock_fetch_health: AsyncMock) -> None:
    mock_fetch_health.return_value = ("unavailable", "connection refused")

    response = client.get("/api/nlp/health")

    assert response.status_code == 200
    payload = response.json()
    assert payload["proxy_status"] == "ok"
    assert payload["ml_service_status"] == "unavailable"


@patch("app.api.nlp.predict_ml_intent", new_callable=AsyncMock)
def test_predict_intent_proxy_returns_mapped_fields(mock_predict: AsyncMock) -> None:
    mock_predict.return_value = {
        "intent": "ASK_VARIANT",
        "confidence": 0.5236,
        "top_k": [
            {"intent": "ASK_VARIANT", "confidence": 0.5236},
            {"intent": "ASK_STOCK", "confidence": 0.12},
        ],
    }

    response = client.post(
        "/api/nlp/predict-intent",
        json={"text": "còn size M không shop"},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["ml_available"] is True
    assert payload["intent"] == "ASK_VARIANT"
    assert payload["mapped_intent"] == "ASK_SIZE"
    assert payload["confidence"] == pytest.approx(0.5236)
    assert payload["source"] == "ml"


@patch("app.api.nlp.predict_ml_intent", new_callable=AsyncMock)
def test_predict_intent_proxy_fallback_when_ml_down(mock_predict: AsyncMock) -> None:
    mock_predict.return_value = None

    response = client.post(
        "/api/nlp/predict-intent",
        json={"text": "giá bao nhiêu"},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["ml_available"] is False
    assert payload["source"] == "unavailable"
    assert payload["error"] == "ml_service_unavailable"
