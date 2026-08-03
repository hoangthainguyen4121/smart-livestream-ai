from __future__ import annotations

from datetime import datetime
from typing import Any, Optional
from uuid import UUID

from pydantic import BaseModel, Field


class ClaimNextExportBatchResponse(BaseModel):
    available: bool
    batch_id: Optional[UUID] = None
    processing_run_id: Optional[UUID] = None
    status: Optional[str] = None


class ClaimCandidateResponse(BaseModel):
    available: bool
    candidate_run_id: Optional[UUID] = None
    batch_ids: Optional[list[UUID]] = None
    status: Optional[str] = None


class ExportBatchMetadataResponse(BaseModel):
    batch_id: UUID
    record_count: int
    artifact_sha256: str
    manifest_sha256: str
    format_version: str
    artifact_filename: str
    processing_status: str
    consumption_state: str
    processing_run_id: UUID
    candidate_run_id: Optional[UUID] = None


class MlRetrainResultRequest(BaseModel):
    status: str = Field(
        description="processing|completed|failed",
    )
    dataset_version_id: Optional[str] = None
    precheck_reasons: Optional[list[dict[str, Any]]] = None
    kaggle_run_id: Optional[str] = None
    artifact_location: Optional[str] = None
    metrics: Optional[dict[str, Any]] = None
    promotion_eligible: bool = False
    error_code: Optional[str] = None
    error_message: Optional[str] = None


class MlRetrainCandidateResultRequest(BaseModel):
    status: str = Field(
        description=(
            "processing|deferred_waiting_for_more_feedback|"
            "excluded_nonproduction_data|completed|failed"
        ),
    )
    dataset_version_id: Optional[str] = None
    precheck_reasons: Optional[list[dict[str, Any]]] = None
    excluded_batch_ids: Optional[list[UUID]] = None
    kaggle_run_id: Optional[str] = None
    artifact_location: Optional[str] = None
    metrics: Optional[dict[str, Any]] = None
    promotion_eligible: bool = False
    error_code: Optional[str] = None
    error_message: Optional[str] = None


class MlRetrainResultResponse(BaseModel):
    batch_id: UUID
    processing_run_id: UUID
    status: str
    updated_at: datetime
    idempotent: bool = False


class MlRetrainCandidateResultResponse(BaseModel):
    candidate_run_id: UUID
    batch_ids: list[UUID]
    status: str
    updated_at: datetime
    idempotent: bool = False
