from __future__ import annotations

from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, Field


class CreateDatasetExportBatchRequest(BaseModel):
    max_records: int = Field(default=1000, ge=1, le=5000)


class DatasetExportBatchResponse(BaseModel):
    id: UUID
    status: str
    format_version: str
    record_count: int
    artifact_sha256: Optional[str]
    manifest_sha256: Optional[str]
    created_at: datetime
    completed_at: Optional[datetime]
    created_by: Optional[str]
    failure_reason: Optional[str]

    @classmethod
    def from_model(cls, row) -> "DatasetExportBatchResponse":
        status_value = row.status.value if hasattr(row.status, "value") else str(row.status)
        return cls(
            id=row.id,
            status=status_value,
            format_version=row.format_version,
            record_count=row.record_count,
            artifact_sha256=row.artifact_sha256,
            manifest_sha256=row.manifest_sha256,
            created_at=row.created_at,
            completed_at=row.completed_at,
            created_by=row.created_by,
            failure_reason=row.failure_reason,
        )


class CreateDatasetExportBatchResponse(BaseModel):
    id: UUID
    status: str
    record_count: int
    artifact_sha256: Optional[str]
    manifest_sha256: Optional[str]


class DatasetExportBatchListResponse(BaseModel):
    items: list[DatasetExportBatchResponse]
    next_cursor: Optional[str] = None


class ReadyExportCountResponse(BaseModel):
    ready_count: int
