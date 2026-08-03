from __future__ import annotations

import base64
from datetime import datetime
from typing import Optional
from uuid import UUID

from app.repositories.dataset_export_repository import DatasetExportRepository
from app.schemas.dataset_export import (
    CreateDatasetExportBatchResponse,
    DatasetExportBatchListResponse,
    DatasetExportBatchResponse,
)
from app.services.dataset_export_serialization import (
    build_manifest_payload,
    compute_label_counts,
    serialize_jsonl_lines,
    serialize_manifest,
    sha256_hex,
)
from app.settings import get_settings


class DatasetExportError(ValueError):
    pass


class NoExportableSamplesError(DatasetExportError):
    pass


class DatasetExportService:
    MAX_LIST_LIMIT = 50

    def __init__(self, repository: DatasetExportRepository) -> None:
        self._repository = repository

    def count_ready(self) -> int:
        return self._repository.count_ready_for_export()

    def create_batch(
        self,
        *,
        max_records: int,
        created_by: Optional[str],
    ) -> CreateDatasetExportBatchResponse:
        settings = get_settings()
        bounded_max = min(max_records, settings.max_dataset_export_records)

        batch = self._repository.create_batch(created_by=created_by)
        try:
            samples = self._repository.select_ready_for_export(bounded_max)
            if not samples:
                self._repository.rollback()
                raise NoExportableSamplesError("No approved unexported corrections are available.")

            items = self._repository.insert_batch_items(batch, samples)
            self._repository.commit_reservation()

            jsonl_path, manifest_path = self._repository.artifact_paths(batch.id)
            jsonl_bytes = serialize_jsonl_lines(items)
            records_sha256 = sha256_hex(jsonl_bytes)
            label_counts = compute_label_counts(items)
            manifest_payload = build_manifest_payload(
                batch_id=str(batch.id),
                format_version=batch.format_version,
                created_at=batch.created_at,
                record_count=len(items),
                records_sha256=records_sha256,
                label_counts=label_counts,
            )
            manifest_bytes = serialize_manifest(manifest_payload)
            manifest_sha256 = sha256_hex(manifest_bytes)

            self._repository.atomic_write_bytes(jsonl_path, jsonl_bytes)
            self._repository.atomic_write_bytes(manifest_path, manifest_bytes)

            completed = self._repository.mark_completed(
                batch,
                artifact_filename=jsonl_path.name,
                artifact_sha256=records_sha256,
                manifest_sha256=manifest_sha256,
            )
            return CreateDatasetExportBatchResponse(
                id=completed.id,
                status=completed.status.value if hasattr(completed.status, "value") else str(completed.status),
                record_count=completed.record_count,
                artifact_sha256=completed.artifact_sha256,
                manifest_sha256=completed.manifest_sha256,
            )
        except NoExportableSamplesError:
            raise
        except Exception as error:
            try:
                self._repository.mark_failed(
                    batch,
                    failure_reason=str(error)[:600] or "artifact_generation_failed",
                )
            except Exception:
                self._repository.rollback()
            raise DatasetExportError(str(error)) from error

    def list_batches(
        self,
        *,
        limit: int,
        cursor: Optional[str],
    ) -> DatasetExportBatchListResponse:
        bounded_limit = max(1, min(limit, self.MAX_LIST_LIMIT))
        fetch_limit = bounded_limit + 1
        cursor_created_at = None
        cursor_id: Optional[UUID] = None
        if cursor:
            cursor_created_at, cursor_id = self._parse_cursor(cursor)

        rows = self._repository.list_batches(
            limit=fetch_limit,
            cursor_created_at=cursor_created_at,
            cursor_id=cursor_id,
        )
        has_more = len(rows) > bounded_limit
        page_rows = rows[:bounded_limit]
        next_cursor = None
        if has_more and page_rows:
            last = page_rows[-1]
            next_cursor = self._encode_cursor(last.created_at, last.id)

        return DatasetExportBatchListResponse(
            items=[DatasetExportBatchResponse.from_model(row) for row in page_rows],
            next_cursor=next_cursor,
        )

    def get_batch(self, batch_id: UUID) -> DatasetExportBatchResponse:
        row = self._repository.get_batch(batch_id)
        if row is None:
            raise DatasetExportError("Export batch not found.")
        return DatasetExportBatchResponse.from_model(row)

    def get_artifact_bytes(self, batch_id: UUID) -> tuple[bytes, str]:
        row = self._repository.get_batch(batch_id)
        if row is None:
            raise DatasetExportError("Export batch not found.")
        status_value = row.status.value if hasattr(row.status, "value") else str(row.status)
        if status_value != "completed":
            raise DatasetExportError("Export batch artifact is not available.")
        jsonl_path, _ = self._repository.artifact_paths(batch_id)
        if not jsonl_path.exists():
            raise DatasetExportError("Export artifact file is missing.")
        return jsonl_path.read_bytes(), jsonl_path.name

    def get_manifest_bytes(self, batch_id: UUID) -> tuple[bytes, str]:
        row = self._repository.get_batch(batch_id)
        if row is None:
            raise DatasetExportError("Export batch not found.")
        status_value = row.status.value if hasattr(row.status, "value") else str(row.status)
        if status_value != "completed":
            raise DatasetExportError("Export manifest is not available.")
        _, manifest_path = self._repository.artifact_paths(batch_id)
        if not manifest_path.exists():
            raise DatasetExportError("Export manifest file is missing.")
        return manifest_path.read_bytes(), manifest_path.name

    @staticmethod
    def _encode_cursor(created_at: datetime, batch_id: UUID) -> str:
        raw = f"{created_at.isoformat()}|{batch_id}"
        return base64.urlsafe_b64encode(raw.encode("utf-8")).decode("ascii")

    @staticmethod
    def _parse_cursor(cursor: str) -> tuple[datetime, UUID]:
        try:
            decoded = base64.urlsafe_b64decode(cursor.encode("ascii")).decode("utf-8")
            created_at_raw, batch_id_raw = decoded.split("|", 1)
            return datetime.fromisoformat(created_at_raw), UUID(batch_id_raw)
        except (ValueError, UnicodeDecodeError) as error:
            raise DatasetExportError("Invalid cursor.") from error
