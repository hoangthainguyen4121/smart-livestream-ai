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


ADMIN_HEADERS = {
    "X-Admin-Api-Key": "test-admin-key",
    "X-Admin-Reviewer": "qa-reviewer",
}


@pytest.fixture()
def admin_client(feedback_env: str, monkeypatch: pytest.MonkeyPatch) -> TestClient:
    monkeypatch.setenv("ADMIN_API_KEY", "test-admin-key")
    from app.settings import clear_settings_cache

    clear_settings_cache()
    return TestClient(app)


def _create_pending(client: TestClient, **overrides: object) -> dict:
    payload = {
        "source_comment": {
            "id": f"comment-{uuid4()}",
            "room_id": "demo",
            "text": "bao nhieu tien vay",
            "author_display_name": "guest",
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
    response = client.post("/api/intent-corrections", json=payload)
    assert response.status_code == 201
    return response.json()


def test_list_pending_corrections(admin_client: TestClient, db_session_feedback) -> None:
    created = _create_pending(admin_client)
    response = admin_client.get(
        "/api/admin/intent-corrections?status=pending&limit=50",
        headers=ADMIN_HEADERS,
    )

    assert response.status_code == 200
    payload = response.json()
    assert any(item["id"] == created["id"] for item in payload["items"])
    item = next(item for item in payload["items"] if item["id"] == created["id"])
    assert item["source_comment_text"] == "bao nhieu tien vay"
    assert item["predicted_intent"] == "CHITCHAT"
    assert item["model_id"] == "phobert_base_combined_hardcases_v2"


def test_list_pagination_stable_order(admin_client: TestClient, db_session_feedback) -> None:
    first = _create_pending(admin_client)
    second = _create_pending(admin_client)

    page_one = admin_client.get(
        "/api/admin/intent-corrections?status=pending&limit=1",
        headers=ADMIN_HEADERS,
    )
    assert page_one.status_code == 200
    page_one_payload = page_one.json()
    assert len(page_one_payload["items"]) == 1
    assert page_one_payload["next_cursor"]

    page_two = admin_client.get(
        f"/api/admin/intent-corrections?status=pending&limit=1&cursor={page_one_payload['next_cursor']}",
        headers=ADMIN_HEADERS,
    )
    assert page_two.status_code == 200
    page_two_payload = page_two.json()
    assert len(page_two_payload["items"]) == 1
    returned_ids = {page_one_payload["items"][0]["id"], page_two_payload["items"][0]["id"]}
    assert returned_ids == {first["id"], second["id"]}


def test_approve_with_valid_final_intent(admin_client: TestClient, db_session_feedback) -> None:
    created = _create_pending(admin_client)
    response = admin_client.post(
        f"/api/admin/intent-corrections/{created['id']}/review",
        headers=ADMIN_HEADERS,
        json={
            "decision": "approved",
            "final_intent": "ASK_PRICE",
            "review_note": "Confirmed",
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "approved"
    assert payload["final_intent"] == "ASK_PRICE"
    assert payload["reviewed_by"] == "qa-reviewer"

    row = db_session_feedback.get(IntentCorrectionSample, created["id"])
    assert row is not None
    assert (row.status.value if hasattr(row.status, "value") else str(row.status)) == "approved"


def test_reject_with_note(admin_client: TestClient, db_session_feedback) -> None:
    created = _create_pending(admin_client)
    response = admin_client.post(
        f"/api/admin/intent-corrections/{created['id']}/review",
        headers=ADMIN_HEADERS,
        json={
            "decision": "rejected",
            "review_note": "Comment is ambiguous",
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "rejected"
    assert payload["final_intent"] is None
    assert payload["review_note"] == "Comment is ambiguous"


def test_approve_missing_final_intent_rejected(admin_client: TestClient) -> None:
    created = _create_pending(admin_client)
    response = admin_client.post(
        f"/api/admin/intent-corrections/{created['id']}/review",
        headers=ADMIN_HEADERS,
        json={"decision": "approved"},
    )
    assert response.status_code == 422


def test_invalid_final_intent_rejected(admin_client: TestClient) -> None:
    created = _create_pending(admin_client)
    response = admin_client.post(
        f"/api/admin/intent-corrections/{created['id']}/review",
        headers=ADMIN_HEADERS,
        json={
            "decision": "approved",
            "final_intent": "NOT_A_REAL_INTENT",
        },
    )
    assert response.status_code == 400


def test_prediction_metadata_unchanged_after_review(
    admin_client: TestClient,
    db_session_feedback,
) -> None:
    created = _create_pending(admin_client)
    before = db_session_feedback.get(IntentCorrectionSample, created["id"])
    assert before is not None

    admin_client.post(
        f"/api/admin/intent-corrections/{created['id']}/review",
        headers=ADMIN_HEADERS,
        json={
            "decision": "approved",
            "final_intent": "ASK_STOCK",
            "review_note": "Stock question",
        },
    )

    after = db_session_feedback.get(IntentCorrectionSample, created["id"])
    assert after is not None
    assert after.predicted_intent == before.predicted_intent
    assert after.prediction_confidence == before.prediction_confidence
    assert after.model_id == before.model_id
    assert after.model_version == before.model_version
    assert after.proposed_intent == before.proposed_intent


def test_review_already_reviewed_returns_conflict(admin_client: TestClient) -> None:
    created = _create_pending(admin_client)
    first = admin_client.post(
        f"/api/admin/intent-corrections/{created['id']}/review",
        headers=ADMIN_HEADERS,
        json={"decision": "rejected", "review_note": "No"},
    )
    second = admin_client.post(
        f"/api/admin/intent-corrections/{created['id']}/review",
        headers=ADMIN_HEADERS,
        json={"decision": "approved", "final_intent": "ASK_PRICE"},
    )

    assert first.status_code == 200
    assert second.status_code == 409
    assert second.json()["detail"]["code"] == "intent_correction_already_reviewed"


def test_reviewed_items_not_in_pending_list(admin_client: TestClient) -> None:
    created = _create_pending(admin_client)
    admin_client.post(
        f"/api/admin/intent-corrections/{created['id']}/review",
        headers=ADMIN_HEADERS,
        json={"decision": "approved", "final_intent": "ASK_PRICE"},
    )

    listing = admin_client.get(
        "/api/admin/intent-corrections?status=pending&limit=50",
        headers=ADMIN_HEADERS,
    )
    assert listing.status_code == 200
    ids = {item["id"] for item in listing.json()["items"]}
    assert created["id"] not in ids


def test_admin_requires_api_key(admin_client: TestClient) -> None:
    response = admin_client.get("/api/admin/intent-corrections?status=pending")
    assert response.status_code == 401


def test_review_does_not_call_ml(admin_client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    import app.services.ml_intent_client as ml_client

    monkeypatch.setattr(
        ml_client,
        "predict_ml_intent",
        lambda *_a, **_k: (_ for _ in ()).throw(AssertionError("ML must not be called")),
    )

    created = _create_pending(admin_client)
    response = admin_client.post(
        f"/api/admin/intent-corrections/{created['id']}/review",
        headers=ADMIN_HEADERS,
        json={"decision": "approved", "final_intent": "ASK_PRICE"},
    )
    assert response.status_code == 200
