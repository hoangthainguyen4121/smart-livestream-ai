from __future__ import annotations

from pathlib import Path
import sys
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlmodel import select


BACKEND_ROOT = Path(__file__).resolve().parents[1]
PROJECT_ROOT = BACKEND_ROOT.parent

for path in (BACKEND_ROOT, PROJECT_ROOT):
    path_text = str(path)
    if path_text not in sys.path:
        sys.path.insert(0, path_text)

from app.db.models import IntentCorrectionSample  # noqa: E402
from app.main import app  # noqa: E402


@pytest.fixture()
def client(feedback_env: str) -> TestClient:
    return TestClient(app)


def _base_payload(**overrides: object) -> dict:
    payload = {
        "source_comment": {
            "id": f"comment-{uuid4()}",
            "room_id": "demo",
            "text": "bao nhieu tien vay",
            "author_display_name": "guest",
            "author_user_id": None,
            "created_at": "2026-08-03T13:00:00Z",
        },
        "prediction": {
            "intent": "CHITCHAT",
            "confidence": 0.62,
            "model_id": "phobert_base_combined_hardcases_v2",
            "model_version": "phobert_base_combined_hardcases_v2@2026-07-04",
        },
        "proposed_intent": "ASK_PRICE",
        "reporter_viewer_key": f"viewer-{uuid4()}",
    }
    payload.update(overrides)
    return payload


def test_create_model_correction(client: TestClient, db_session_feedback) -> None:
    response = client.post("/api/intent-corrections", json=_base_payload())

    assert response.status_code == 201
    payload = response.json()
    assert payload["status"] == "pending"
    row = db_session_feedback.get(IntentCorrectionSample, payload["id"])
    assert row is not None
    assert row.predicted_intent == "CHITCHAT"
    assert row.proposed_intent == "ASK_PRICE"
    assert row.model_id == "phobert_base_combined_hardcases_v2"


def test_works_in_memory_chat_mode(client: TestClient, feedback_env: str) -> None:
    assert feedback_env
    response = client.post("/api/intent-corrections", json=_base_payload())
    assert response.status_code == 201


def test_does_not_require_comments_table_row(client: TestClient) -> None:
    response = client.post(
        "/api/intent-corrections",
        json=_base_payload(
            source_comment={
                "id": "ephemeral-only-id",
                "room_id": "demo",
                "text": "khong co row comments",
                "author_display_name": "guest",
                "created_at": "2026-08-03T13:00:00Z",
            }
        ),
    )
    assert response.status_code == 201


def test_rejects_missing_prediction_metadata(client: TestClient) -> None:
    payload = _base_payload()
    payload["prediction"].pop("model_version")
    response = client.post("/api/intent-corrections", json=payload)
    assert response.status_code == 422


def test_rejects_proposed_intent_equal_predicted(client: TestClient) -> None:
    response = client.post(
        "/api/intent-corrections",
        json=_base_payload(proposed_intent="CHITCHAT"),
    )
    assert response.status_code == 422


def test_rejects_confidence_out_of_range(client: TestClient) -> None:
    payload = _base_payload()
    payload["prediction"]["confidence"] = 1.5
    response = client.post("/api/intent-corrections", json=payload)
    assert response.status_code == 422


def test_rejects_invalid_intent(client: TestClient) -> None:
    response = client.post(
        "/api/intent-corrections",
        json=_base_payload(proposed_intent="NOT_A_REAL_INTENT"),
    )
    assert response.status_code == 400


def test_duplicate_retry_returns_existing(client: TestClient, db_session_feedback) -> None:
    reporter_key = f"viewer-{uuid4()}"
    payload = _base_payload(reporter_viewer_key=reporter_key)
    first = client.post("/api/intent-corrections", json=payload)
    second = client.post("/api/intent-corrections", json=payload)

    assert first.status_code == 201
    assert second.status_code == 200
    assert first.json()["id"] == second.json()["id"]
    rows = list(db_session_feedback.exec(select(IntentCorrectionSample)).all())
    assert len(rows) == 1


def test_two_reporters_can_report_same_comment(client: TestClient, db_session_feedback) -> None:
    comment_id = f"comment-{uuid4()}"
    first = client.post(
        "/api/intent-corrections",
        json=_base_payload(
            source_comment={
                "id": comment_id,
                "room_id": "demo",
                "text": "same comment",
                "author_display_name": "guest",
                "created_at": "2026-08-03T13:00:00Z",
            },
            reporter_viewer_key="viewer-a",
        ),
    )
    second = client.post(
        "/api/intent-corrections",
        json=_base_payload(
            source_comment={
                "id": comment_id,
                "room_id": "demo",
                "text": "same comment",
                "author_display_name": "guest",
                "created_at": "2026-08-03T13:00:00Z",
            },
            reporter_viewer_key="viewer-b",
        ),
    )

    assert first.status_code == 201
    assert second.status_code == 201
    assert first.json()["id"] != second.json()["id"]


def test_feedback_disabled_without_database_url(memory_mode_env: None, monkeypatch: pytest.MonkeyPatch) -> None:
    client = TestClient(app)
    response = client.post("/api/intent-corrections", json=_base_payload())
    assert response.status_code == 503
    assert response.json()["detail"]["code"] == "feedback_database_disabled"
