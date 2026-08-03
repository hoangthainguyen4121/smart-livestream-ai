from __future__ import annotations

import hashlib
import json
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from pathlib import Path
from uuid import UUID, uuid4

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app.db.models import (
    DatasetExportProcessingRun,
    DatasetExportProcessingStatus,
    MlRetrainBatchConsumptionState,
    MlRetrainCandidateRun,
    MlRetrainCandidateStatus,
)
from app.main import app


WORKER_HEADERS = {"X-ML-Retrain-Worker-Key": "test-worker-key"}
ADMIN_HEADERS = {
    "X-Admin-Api-Key": "test-admin-key",
    "X-Admin-Reviewer": "qa-reviewer",
}


@pytest.fixture(autouse=True)
def _clean_export_db(db_session_feedback) -> None:
    yield


@pytest.fixture()
def worker_client(feedback_env: str, export_dir: Path, monkeypatch: pytest.MonkeyPatch) -> TestClient:
    monkeypatch.setenv("ADMIN_API_KEY", "test-admin-key")
    monkeypatch.setenv("ML_RETRAIN_WORKER_API_KEY", "test-worker-key")
    monkeypatch.setenv("DATASET_EXPORT_DIR", str(export_dir))
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


def _approve(client: TestClient, sample_id: str, final_intent: str = "ASK_PRICE") -> None:
    response = client.post(
        f"/api/admin/intent-corrections/{sample_id}/review",
        headers=ADMIN_HEADERS,
        json={"decision": "approved", "final_intent": final_intent},
    )
    assert response.status_code == 200


def _create_completed_batch(admin_client: TestClient) -> dict:
    sample = _create_pending(admin_client)
    _approve(admin_client, sample["id"])
    response = admin_client.post(
        "/api/admin/dataset-export-batches",
        headers=ADMIN_HEADERS,
        json={"max_records": 10},
    )
    assert response.status_code == 201
    return response.json()


def test_worker_auth_required(worker_client: TestClient) -> None:
    response = worker_client.post("/api/internal/ml-retrain/claim-candidate")
    assert response.status_code == 401


def test_claim_completed_unprocessed_batch(worker_client: TestClient, admin_client: TestClient) -> None:
    created = _create_completed_batch(admin_client)
    claim = worker_client.post("/api/internal/ml-retrain/claim-candidate", headers=WORKER_HEADERS)
    assert claim.status_code == 200
    payload = claim.json()
    assert payload["available"] is True
    assert payload["batch_ids"] == [created["id"]]
    assert payload["status"] == "claimed"


def test_empty_claim_returns_no_batch(worker_client: TestClient) -> None:
    claim = worker_client.post("/api/internal/ml-retrain/claim-candidate", headers=WORKER_HEADERS)
    assert claim.status_code == 200
    assert claim.json()["available"] is False


def test_completed_batch_not_claimed_twice(worker_client: TestClient, admin_client: TestClient) -> None:
    created = _create_completed_batch(admin_client)
    first = worker_client.post("/api/internal/ml-retrain/claim-candidate", headers=WORKER_HEADERS)
    assert first.json()["available"] is True
    worker_client.post(
        f"/api/internal/ml-retrain/candidates/{first.json()['candidate_run_id']}/result",
        headers=WORKER_HEADERS,
        json={"status": "completed", "promotion_eligible": False},
    )
    second = worker_client.post("/api/internal/ml-retrain/claim-candidate", headers=WORKER_HEADERS)
    assert second.json()["available"] is False


def test_deferred_batch_claimed_again(worker_client: TestClient, admin_client: TestClient) -> None:
    created = _create_completed_batch(admin_client)
    claim = worker_client.post("/api/internal/ml-retrain/claim-candidate", headers=WORKER_HEADERS)
    candidate_run_id = claim.json()["candidate_run_id"]
    worker_client.post(
        f"/api/internal/ml-retrain/candidates/{candidate_run_id}/result",
        headers=WORKER_HEADERS,
        json={
            "status": "deferred_waiting_for_more_feedback",
            "precheck_reasons": [{"code": "insufficient_feedback_samples"}],
            "promotion_eligible": False,
        },
    )
    reclaim = worker_client.post("/api/internal/ml-retrain/claim-candidate", headers=WORKER_HEADERS)
    assert reclaim.json()["available"] is True
    assert reclaim.json()["batch_ids"] == [created["id"]]


def test_failed_batch_can_retry(worker_client: TestClient, admin_client: TestClient) -> None:
    created = _create_completed_batch(admin_client)
    claim = worker_client.post("/api/internal/ml-retrain/claim-candidate", headers=WORKER_HEADERS)
    worker_client.post(
        f"/api/internal/ml-retrain/candidates/{claim.json()['candidate_run_id']}/result",
        headers=WORKER_HEADERS,
        json={"status": "failed", "error_code": "kaggle_failed", "promotion_eligible": False},
    )
    reclaim = worker_client.post("/api/internal/ml-retrain/claim-candidate", headers=WORKER_HEADERS)
    assert reclaim.json()["available"] is True
    assert reclaim.json()["batch_ids"] == [created["id"]]


def test_metadata_returns_checksums(worker_client: TestClient, admin_client: TestClient, export_dir: Path) -> None:
    created = _create_completed_batch(admin_client)
    worker_client.post("/api/internal/ml-retrain/claim-candidate", headers=WORKER_HEADERS)
    metadata = worker_client.get(
        f"/api/internal/ml-retrain/batches/{created['id']}/metadata",
        headers=WORKER_HEADERS,
    )
    assert metadata.status_code == 200
    payload = metadata.json()
    assert payload["artifact_sha256"] == created["artifact_sha256"]
    assert payload["manifest_sha256"] == created["manifest_sha256"]
    assert payload["artifact_filename"].startswith("intent-corrections-")
    assert payload["consumption_state"] == "claimed"


def test_download_artifact_and_manifest(worker_client: TestClient, admin_client: TestClient, export_dir: Path) -> None:
    created = _create_completed_batch(admin_client)
    worker_client.post("/api/internal/ml-retrain/claim-candidate", headers=WORKER_HEADERS)
    artifact = worker_client.get(
        f"/api/internal/ml-retrain/batches/{created['id']}/artifact",
        headers=WORKER_HEADERS,
    )
    manifest = worker_client.get(
        f"/api/internal/ml-retrain/batches/{created['id']}/manifest",
        headers=WORKER_HEADERS,
    )
    assert artifact.status_code == 200
    assert manifest.status_code == 200
    assert hashlib.sha256(artifact.content).hexdigest() == created["artifact_sha256"]


def test_candidate_result_idempotent(worker_client: TestClient, admin_client: TestClient) -> None:
    _create_completed_batch(admin_client)
    claim = worker_client.post("/api/internal/ml-retrain/claim-candidate", headers=WORKER_HEADERS)
    candidate_run_id = claim.json()["candidate_run_id"]
    body = {"status": "deferred_waiting_for_more_feedback", "promotion_eligible": False}
    first = worker_client.post(
        f"/api/internal/ml-retrain/candidates/{candidate_run_id}/result",
        headers=WORKER_HEADERS,
        json=body,
    )
    second = worker_client.post(
        f"/api/internal/ml-retrain/candidates/{candidate_run_id}/result",
        headers=WORKER_HEADERS,
        json=body,
    )
    assert first.status_code == 200
    assert second.status_code == 200
    assert second.json()["idempotent"] is True


def test_invalid_candidate_transition_rejected(worker_client: TestClient, admin_client: TestClient) -> None:
    _create_completed_batch(admin_client)
    claim = worker_client.post("/api/internal/ml-retrain/claim-candidate", headers=WORKER_HEADERS)
    candidate_run_id = claim.json()["candidate_run_id"]
    worker_client.post(
        f"/api/internal/ml-retrain/candidates/{candidate_run_id}/result",
        headers=WORKER_HEADERS,
        json={"status": "processing", "promotion_eligible": False},
    )
    response = worker_client.post(
        f"/api/internal/ml-retrain/candidates/{candidate_run_id}/result",
        headers=WORKER_HEADERS,
        json={"status": "deferred_waiting_for_more_feedback", "promotion_eligible": False},
    )
    assert response.status_code == 409


def test_stale_claim_recovery(
    worker_client: TestClient,
    admin_client: TestClient,
    db_session_feedback: Session,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    created = _create_completed_batch(admin_client)
    claim = worker_client.post("/api/internal/ml-retrain/claim-candidate", headers=WORKER_HEADERS)
    candidate = db_session_feedback.exec(select(MlRetrainCandidateRun)).one()
    candidate.claimed_at = datetime.now(timezone.utc) - timedelta(hours=3)
    candidate.status = MlRetrainCandidateStatus.PROCESSING
    db_session_feedback.add(candidate)
    db_session_feedback.commit()
    monkeypatch.setenv("ML_RETRAIN_STALE_CLAIM_MINUTES", "60")
    from app.settings import clear_settings_cache

    clear_settings_cache()
    reclaim = worker_client.post("/api/internal/ml-retrain/claim-candidate", headers=WORKER_HEADERS)
    assert reclaim.json()["available"] is True
    assert reclaim.json()["batch_ids"] == [created["id"]]


def test_concurrent_claim_single_winner(worker_client: TestClient, admin_client: TestClient) -> None:
    _create_completed_batch(admin_client)

    def _claim() -> bool:
        client = TestClient(app)
        response = client.post(
            "/api/internal/ml-retrain/claim-candidate",
            headers=WORKER_HEADERS,
        )
        return bool(response.json().get("available"))

    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(lambda _: _claim(), range(2)))
    assert sum(1 for item in results if item) == 1


def test_accumulated_two_batches_in_one_candidate(worker_client: TestClient, admin_client: TestClient) -> None:
    first = _create_completed_batch(admin_client)
    second = _create_completed_batch(admin_client)
    claim = worker_client.post("/api/internal/ml-retrain/claim-candidate", headers=WORKER_HEADERS)
    payload = claim.json()
    assert payload["available"] is True
    assert payload["batch_ids"] == [first["id"], second["id"]]


def test_deferred_releases_consumption_state(
    worker_client: TestClient,
    admin_client: TestClient,
    db_session_feedback: Session,
) -> None:
    created = _create_completed_batch(admin_client)
    claim = worker_client.post("/api/internal/ml-retrain/claim-candidate", headers=WORKER_HEADERS)
    worker_client.post(
        f"/api/internal/ml-retrain/candidates/{claim.json()['candidate_run_id']}/result",
        headers=WORKER_HEADERS,
        json={"status": "deferred_waiting_for_more_feedback", "promotion_eligible": False},
    )
    run = db_session_feedback.exec(
        select(DatasetExportProcessingRun).where(DatasetExportProcessingRun.batch_id == UUID(created["id"]))
    ).one()
    assert run.consumption_state == MlRetrainBatchConsumptionState.WAITING
    assert run.status == DatasetExportProcessingStatus.PENDING


@pytest.fixture()
def admin_client(feedback_env: str, export_dir: Path, monkeypatch: pytest.MonkeyPatch) -> TestClient:
    monkeypatch.setenv("ADMIN_API_KEY", "test-admin-key")
    monkeypatch.setenv("ML_RETRAIN_WORKER_API_KEY", "test-worker-key")
    monkeypatch.setenv("DATASET_EXPORT_DIR", str(export_dir))
    from app.settings import clear_settings_cache

    clear_settings_cache()
    return TestClient(app)


@pytest.fixture()
def export_dir(tmp_path: Path) -> Path:
    target = tmp_path / "dataset_exports"
    target.mkdir()
    return target
