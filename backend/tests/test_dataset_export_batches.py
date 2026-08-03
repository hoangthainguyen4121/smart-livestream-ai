from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
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

from app.db.models import DatasetExportBatch, DatasetExportBatchItem, IntentCorrectionSample  # noqa: E402
from app.main import app  # noqa: E402


ADMIN_HEADERS = {
    "X-Admin-Api-Key": "test-admin-key",
    "X-Admin-Reviewer": "qa-reviewer",
}


@pytest.fixture(autouse=True)
def _clean_export_db(db_session_feedback) -> None:
    yield


@pytest.fixture()
def admin_client(feedback_env: str, export_dir: Path, monkeypatch: pytest.MonkeyPatch) -> TestClient:
    monkeypatch.setenv("ADMIN_API_KEY", "test-admin-key")
    monkeypatch.setenv("DATASET_EXPORT_DIR", str(export_dir))
    from app.settings import clear_settings_cache

    clear_settings_cache()
    return TestClient(app)


@pytest.fixture()
def export_dir(tmp_path: Path) -> Path:
    target = tmp_path / "dataset_exports"
    target.mkdir()
    return target


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
        json={"decision": "approved", "final_intent": final_intent, "review_note": "ok"},
    )
    assert response.status_code == 200


def _reject(client: TestClient, sample_id: str) -> None:
    response = client.post(
        f"/api/admin/intent-corrections/{sample_id}/review",
        headers=ADMIN_HEADERS,
        json={"decision": "rejected", "review_note": "no"},
    )
    assert response.status_code == 200


def test_export_only_approved_samples(admin_client: TestClient, db_session_feedback) -> None:
    approved = _create_pending(admin_client)
    pending = _create_pending(admin_client)
    rejected = _create_pending(admin_client)
    _approve(admin_client, approved["id"])
    _reject(admin_client, rejected["id"])

    response = admin_client.post(
        "/api/admin/dataset-export-batches",
        headers=ADMIN_HEADERS,
        json={"max_records": 100},
    )
    assert response.status_code == 201
    assert response.json()["record_count"] == 1

    rows = list(db_session_feedback.exec(select(DatasetExportBatchItem)).all())
    assert len(rows) == 1
    assert str(rows[0].correction_sample_id) == approved["id"]
    assert pending["id"] != str(rows[0].correction_sample_id)


def test_pending_and_rejected_not_exported(admin_client: TestClient) -> None:
    pending = _create_pending(admin_client)
    rejected = _create_pending(admin_client)
    _reject(admin_client, rejected["id"])

    response = admin_client.post(
        "/api/admin/dataset-export-batches",
        headers=ADMIN_HEADERS,
        json={"max_records": 100},
    )
    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "no_exportable_samples"


def test_pending_correction_without_final_intent_not_exported(admin_client: TestClient) -> None:
    _create_pending(admin_client)
    response = admin_client.post(
        "/api/admin/dataset-export-batches",
        headers=ADMIN_HEADERS,
        json={"max_records": 100},
    )
    assert response.status_code == 409


def test_same_correction_not_in_two_completed_batches(admin_client: TestClient) -> None:
    approved = _create_pending(admin_client)
    _approve(admin_client, approved["id"])

    first = admin_client.post(
        "/api/admin/dataset-export-batches",
        headers=ADMIN_HEADERS,
        json={"max_records": 100},
    )
    second = admin_client.post(
        "/api/admin/dataset-export-batches",
        headers=ADMIN_HEADERS,
        json={"max_records": 100},
    )

    assert first.status_code == 201
    assert second.status_code == 409


def test_stable_record_ordering(admin_client: TestClient, export_dir: Path) -> None:
    first = _create_pending(admin_client)
    second = _create_pending(admin_client, proposed_intent="ASK_STOCK")
    _approve(admin_client, first["id"], "ASK_PRICE")
    _approve(admin_client, second["id"], "ASK_STOCK")

    created = admin_client.post(
        "/api/admin/dataset-export-batches",
        headers=ADMIN_HEADERS,
        json={"max_records": 100},
    ).json()
    jsonl_path = export_dir / f"intent-corrections-{created['id']}.jsonl"
    lines = jsonl_path.read_text(encoding="utf-8").strip().split("\n")
    reviewed_times = [json.loads(line)["reviewed_at"] for line in lines]
    assert reviewed_times == sorted(reviewed_times)


def test_jsonl_schema_and_no_pii(admin_client: TestClient, export_dir: Path) -> None:
    approved = _create_pending(
        admin_client,
        source_comment={
            "id": f"comment-{uuid4()}",
            "room_id": "demo",
            "text": "gia bao nhieu",
            "author_display_name": "secret-guest",
            "created_at": "2026-08-03T13:00:00Z",
        },
    )
    _approve(admin_client, approved["id"])

    created = admin_client.post(
        "/api/admin/dataset-export-batches",
        headers=ADMIN_HEADERS,
        json={"max_records": 100},
    ).json()
    jsonl_path = export_dir / f"intent-corrections-{created['id']}.jsonl"
    record = json.loads(jsonl_path.read_text(encoding="utf-8").strip())

    assert set(record.keys()) == {
        "sample_id",
        "text",
        "label",
        "source",
        "predicted_label",
        "prediction_confidence",
        "model_id",
        "model_version",
        "correction_created_at",
        "reviewed_at",
    }
    assert record["text"] == "gia bao nhieu"
    assert record["label"] == "ASK_PRICE"
    assert record["source"] == "approved_intent_correction"
    assert "secret-guest" not in json.dumps(record)
    assert "viewer" not in json.dumps(record)
    assert "room" not in json.dumps(record)


def test_manifest_counts_and_checksum(admin_client: TestClient, export_dir: Path) -> None:
    first = _create_pending(admin_client)
    second = _create_pending(admin_client, proposed_intent="ASK_STOCK")
    _approve(admin_client, first["id"], "ASK_PRICE")
    _approve(admin_client, second["id"], "ASK_STOCK")

    created = admin_client.post(
        "/api/admin/dataset-export-batches",
        headers=ADMIN_HEADERS,
        json={"max_records": 100},
    ).json()

    jsonl_path = export_dir / f"intent-corrections-{created['id']}.jsonl"
    manifest_path = export_dir / f"intent-corrections-{created['id']}.manifest.json"
    jsonl_bytes = jsonl_path.read_bytes()
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))

    assert manifest["record_count"] == 2
    assert manifest["label_counts"] == {"ASK_PRICE": 1, "ASK_STOCK": 1}
    assert manifest["records_sha256"] == hashlib.sha256(jsonl_bytes).hexdigest()
    assert created["artifact_sha256"] == manifest["records_sha256"]


def test_double_submit_does_not_duplicate_export(admin_client: TestClient, db_session_feedback) -> None:
    approved = _create_pending(admin_client)
    _approve(admin_client, approved["id"])

    first = admin_client.post(
        "/api/admin/dataset-export-batches",
        headers=ADMIN_HEADERS,
        json={"max_records": 100},
    )
    second = admin_client.post(
        "/api/admin/dataset-export-batches",
        headers=ADMIN_HEADERS,
        json={"max_records": 100},
    )
    assert first.status_code == 201
    assert second.status_code == 409
    rows = list(db_session_feedback.exec(select(DatasetExportBatchItem)).all())
    assert len(rows) == 1


def test_empty_selection_response(admin_client: TestClient) -> None:
    response = admin_client.post(
        "/api/admin/dataset-export-batches",
        headers=ADMIN_HEADERS,
        json={"max_records": 100},
    )
    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "no_exportable_samples"


def test_file_write_failure_marks_batch_failed(
    admin_client: TestClient,
    db_session_feedback,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    approved = _create_pending(admin_client)
    _approve(admin_client, approved["id"])

    monkeypatch.setattr(
        "app.repositories.dataset_export_repository.DatasetExportRepository.atomic_write_bytes",
        lambda *_args, **_kwargs: (_ for _ in ()).throw(OSError("disk full")),
    )

    response = admin_client.post(
        "/api/admin/dataset-export-batches",
        headers=ADMIN_HEADERS,
        json={"max_records": 100},
    )
    assert response.status_code == 500

    batch = list(db_session_feedback.exec(select(DatasetExportBatch)).all())[0]
    assert (batch.status.value if hasattr(batch.status, "value") else str(batch.status)) == "failed"
    items = list(db_session_feedback.exec(select(DatasetExportBatchItem)).all())
    assert items == []


def test_failed_batch_allows_retry(
    admin_client: TestClient,
    db_session_feedback,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    approved = _create_pending(admin_client)
    _approve(admin_client, approved["id"])

    monkeypatch.setattr(
        "app.repositories.dataset_export_repository.DatasetExportRepository.atomic_write_bytes",
        lambda *_args, **_kwargs: (_ for _ in ()).throw(OSError("disk full")),
    )
    failed = admin_client.post(
        "/api/admin/dataset-export-batches",
        headers=ADMIN_HEADERS,
        json={"max_records": 100},
    )
    assert failed.status_code == 500

    monkeypatch.undo()
    retry = admin_client.post(
        "/api/admin/dataset-export-batches",
        headers=ADMIN_HEADERS,
        json={"max_records": 100},
    )
    assert retry.status_code == 201
    items = list(db_session_feedback.exec(select(DatasetExportBatchItem)).all())
    assert len(items) == 1
    assert str(items[0].correction_sample_id) == approved["id"]


def test_download_jsonl_and_manifest(admin_client: TestClient, export_dir: Path) -> None:
    approved = _create_pending(admin_client)
    _approve(admin_client, approved["id"])
    created = admin_client.post(
        "/api/admin/dataset-export-batches",
        headers=ADMIN_HEADERS,
        json={"max_records": 100},
    ).json()

    jsonl = admin_client.get(
        f"/api/admin/dataset-export-batches/{created['id']}/download",
        headers=ADMIN_HEADERS,
    )
    manifest = admin_client.get(
        f"/api/admin/dataset-export-batches/{created['id']}/manifest",
        headers=ADMIN_HEADERS,
    )

    assert jsonl.status_code == 200
    assert manifest.status_code == 200
    assert jsonl.content
    assert manifest.content


def test_admin_guard_applies(admin_client: TestClient) -> None:
    response = admin_client.get("/api/admin/dataset-export-batches/ready-count")
    assert response.status_code == 401


def test_ready_count(admin_client: TestClient) -> None:
    approved = _create_pending(admin_client)
    _create_pending(admin_client)
    _approve(admin_client, approved["id"])

    response = admin_client.get(
        "/api/admin/dataset-export-batches/ready-count",
        headers=ADMIN_HEADERS,
    )
    assert response.status_code == 200
    assert response.json()["ready_count"] == 1


def test_no_ml_or_kaggle_calls(admin_client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    import app.services.ml_intent_client as ml_client

    monkeypatch.setattr(
        ml_client,
        "predict_ml_intent",
        lambda *_a, **_k: (_ for _ in ()).throw(AssertionError("ML must not be called")),
    )
    approved = _create_pending(admin_client)
    _approve(admin_client, approved["id"])
    response = admin_client.post(
        "/api/admin/dataset-export-batches",
        headers=ADMIN_HEADERS,
        json={"max_records": 100},
    )
    assert response.status_code == 201
