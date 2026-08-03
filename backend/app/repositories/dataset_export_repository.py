from __future__ import annotations

import os
from pathlib import Path
from typing import Optional
from uuid import UUID

from sqlalchemy import func
from sqlmodel import Session, col, select

from app.db.models import (
    DatasetExportBatch,
    DatasetExportBatchItem,
    DatasetExportBatchStatus,
    IntentCorrectionSample,
    IntentCorrectionStatus,
)
from app.settings import DATASET_EXPORT_FORMAT_VERSION, get_settings


class DatasetExportRepository:
    RESERVED_BATCH_STATUSES = (
        DatasetExportBatchStatus.CREATING.value,
        DatasetExportBatchStatus.COMPLETED.value,
    )

    def __init__(self, session: Session) -> None:
        self._session = session

    def count_ready_for_export(self) -> int:
        statement = (
            select(func.count())
            .select_from(IntentCorrectionSample)
            .where(
                IntentCorrectionSample.status == IntentCorrectionStatus.APPROVED,
                IntentCorrectionSample.final_intent.is_not(None),
                IntentCorrectionSample.reviewed_at.is_not(None),
                ~IntentCorrectionSample.id.in_(self._reserved_sample_ids_subquery()),
            )
        )
        return int(self._session.exec(statement).one())

    def select_ready_for_export(self, limit: int) -> list[IntentCorrectionSample]:
        statement = (
            select(IntentCorrectionSample)
            .where(
                IntentCorrectionSample.status == IntentCorrectionStatus.APPROVED,
                IntentCorrectionSample.final_intent.is_not(None),
                IntentCorrectionSample.reviewed_at.is_not(None),
                ~IntentCorrectionSample.id.in_(self._reserved_sample_ids_subquery()),
            )
            .order_by(col(IntentCorrectionSample.reviewed_at), col(IntentCorrectionSample.id))
            .limit(limit)
            .with_for_update(skip_locked=True)
        )
        return list(self._session.exec(statement).all())

    def create_batch(
        self,
        *,
        created_by: Optional[str],
    ) -> DatasetExportBatch:
        batch = DatasetExportBatch(
            status=DatasetExportBatchStatus.CREATING,
            format_version=DATASET_EXPORT_FORMAT_VERSION,
            record_count=0,
            created_by=created_by,
        )
        self._session.add(batch)
        self._session.flush()
        return batch

    def insert_batch_items(
        self,
        batch: DatasetExportBatch,
        samples: list[IntentCorrectionSample],
    ) -> list[DatasetExportBatchItem]:
        items: list[DatasetExportBatchItem] = []
        for sample in samples:
            if sample.final_intent is None or sample.reviewed_at is None:
                continue
            item = DatasetExportBatchItem(
                batch_id=batch.id,
                correction_sample_id=sample.id,
                source_comment_id=sample.source_comment_id,
                source_comment_text=sample.source_comment_text,
                predicted_intent=sample.predicted_intent,
                final_intent=sample.final_intent,
                prediction_confidence=sample.prediction_confidence,
                model_id=sample.model_id,
                model_version=sample.model_version,
                correction_created_at=sample.created_at,
                reviewed_at=sample.reviewed_at,
            )
            self._session.add(item)
            items.append(item)
        batch.record_count = len(items)
        self._session.add(batch)
        self._session.flush()
        return items

    def get_batch(self, batch_id: UUID) -> Optional[DatasetExportBatch]:
        return self._session.get(DatasetExportBatch, batch_id)

    def list_batches(
        self,
        *,
        limit: int,
        cursor_created_at=None,
        cursor_id: Optional[UUID] = None,
    ) -> list[DatasetExportBatch]:
        statement = (
            select(DatasetExportBatch)
            .order_by(col(DatasetExportBatch.created_at).desc(), col(DatasetExportBatch.id).desc())
            .limit(limit)
        )
        if cursor_created_at is not None and cursor_id is not None:
            statement = statement.where(
                (DatasetExportBatch.created_at < cursor_created_at)
                | (
                    (DatasetExportBatch.created_at == cursor_created_at)
                    & (DatasetExportBatch.id < cursor_id)
                )
            )
        return list(self._session.exec(statement).all())

    def list_batch_items(self, batch_id: UUID) -> list[DatasetExportBatchItem]:
        statement = (
            select(DatasetExportBatchItem)
            .where(DatasetExportBatchItem.batch_id == batch_id)
            .order_by(col(DatasetExportBatchItem.reviewed_at), col(DatasetExportBatchItem.correction_sample_id))
        )
        return list(self._session.exec(statement).all())

    def mark_completed(
        self,
        batch: DatasetExportBatch,
        *,
        artifact_filename: str,
        artifact_sha256: str,
        manifest_sha256: str,
    ) -> DatasetExportBatch:
        from datetime import datetime, timezone

        batch.status = DatasetExportBatchStatus.COMPLETED
        batch.artifact_filename = artifact_filename
        batch.artifact_sha256 = artifact_sha256
        batch.manifest_sha256 = manifest_sha256
        batch.completed_at = datetime.now(timezone.utc)
        self._session.add(batch)
        self._session.commit()
        self._session.refresh(batch)
        return batch

    def mark_failed(self, batch: DatasetExportBatch, *, failure_reason: str) -> DatasetExportBatch:
        from datetime import datetime, timezone

        for item in self.list_batch_items(batch.id):
            self._session.delete(item)
        batch.status = DatasetExportBatchStatus.FAILED
        batch.failure_reason = failure_reason[:600]
        batch.completed_at = datetime.now(timezone.utc)
        batch.record_count = 0
        self._session.add(batch)
        self._session.commit()
        self._session.refresh(batch)
        return batch

    def commit_reservation(self) -> None:
        self._session.commit()

    def rollback(self) -> None:
        self._session.rollback()

    def _reserved_sample_ids_subquery(self):
        return (
            select(DatasetExportBatchItem.correction_sample_id)
            .join(DatasetExportBatch, DatasetExportBatch.id == DatasetExportBatchItem.batch_id)
            .where(DatasetExportBatch.status.in_(self.RESERVED_BATCH_STATUSES))
        )

    def resolve_export_dir(self) -> Path:
        configured = get_settings().dataset_export_dir
        path = Path(configured)
        if not path.is_absolute():
            backend_root = Path(__file__).resolve().parents[2]
            path = backend_root / path
        path.mkdir(parents=True, exist_ok=True)
        return path

    def artifact_paths(self, batch_id: UUID) -> tuple[Path, Path]:
        export_dir = self.resolve_export_dir()
        batch_token = str(batch_id)
        jsonl_path = export_dir / f"intent-corrections-{batch_token}.jsonl"
        manifest_path = export_dir / f"intent-corrections-{batch_token}.manifest.json"
        return jsonl_path, manifest_path

    @staticmethod
    def atomic_write_bytes(target_path: Path, data: bytes) -> None:
        target_path.parent.mkdir(parents=True, exist_ok=True)
        temp_path = target_path.with_suffix(target_path.suffix + ".tmp")
        with open(temp_path, "wb") as handle:
            handle.write(data)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temp_path, target_path)
