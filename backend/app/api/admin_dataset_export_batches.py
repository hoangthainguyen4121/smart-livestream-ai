from __future__ import annotations

from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from fastapi.responses import FileResponse

from app.admin_auth import require_admin_api_key, resolve_reviewer_label
from app.api.intent_corrections import _require_feedback_db
from app.db.engine import get_session_factory
from app.repositories.dataset_export_repository import DatasetExportRepository
from app.schemas.dataset_export import (
    CreateDatasetExportBatchRequest,
    CreateDatasetExportBatchResponse,
    DatasetExportBatchListResponse,
    DatasetExportBatchResponse,
    ReadyExportCountResponse,
)
from app.services.dataset_export_service import (
    DatasetExportError,
    DatasetExportService,
    NoExportableSamplesError,
)


router = APIRouter(
    prefix="/admin/dataset-export-batches",
    tags=["admin-dataset-export"],
    dependencies=[Depends(require_admin_api_key)],
)

NO_EXPORTABLE_SAMPLES_CODE = "no_exportable_samples"


@router.get("/ready-count", response_model=ReadyExportCountResponse)
def count_ready_export_samples() -> ReadyExportCountResponse:
    _require_feedback_db()
    with get_session_factory() as db_session:
        repository = DatasetExportRepository(db_session)
        service = DatasetExportService(repository)
        return ReadyExportCountResponse(ready_count=service.count_ready())


@router.post("", response_model=CreateDatasetExportBatchResponse, status_code=status.HTTP_201_CREATED)
def create_dataset_export_batch(
    request: CreateDatasetExportBatchRequest,
    reviewer_label: Optional[str] = Depends(resolve_reviewer_label),
) -> CreateDatasetExportBatchResponse:
    _require_feedback_db()
    with get_session_factory() as db_session:
        repository = DatasetExportRepository(db_session)
        service = DatasetExportService(repository)
        try:
            return service.create_batch(
                max_records=request.max_records,
                created_by=reviewer_label,
            )
        except NoExportableSamplesError as error:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={
                    "code": NO_EXPORTABLE_SAMPLES_CODE,
                    "message": str(error),
                },
            ) from error
        except DatasetExportError as error:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=str(error),
            ) from error


@router.get("", response_model=DatasetExportBatchListResponse)
def list_dataset_export_batches(
    limit: int = Query(default=50, ge=1, le=50),
    cursor: Optional[str] = Query(default=None),
) -> DatasetExportBatchListResponse:
    _require_feedback_db()
    with get_session_factory() as db_session:
        repository = DatasetExportRepository(db_session)
        service = DatasetExportService(repository)
        try:
            return service.list_batches(limit=limit, cursor=cursor)
        except DatasetExportError as error:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(error)) from error


@router.get("/{batch_id}", response_model=DatasetExportBatchResponse)
def get_dataset_export_batch(batch_id: UUID) -> DatasetExportBatchResponse:
    _require_feedback_db()
    with get_session_factory() as db_session:
        repository = DatasetExportRepository(db_session)
        service = DatasetExportService(repository)
        try:
            return service.get_batch(batch_id)
        except DatasetExportError as error:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(error)) from error


@router.get("/{batch_id}/download")
def download_dataset_export_batch(batch_id: UUID) -> Response:
    _require_feedback_db()
    with get_session_factory() as db_session:
        repository = DatasetExportRepository(db_session)
        service = DatasetExportService(repository)
        try:
            _, filename = service.get_artifact_bytes(batch_id)
            jsonl_path, _ = repository.artifact_paths(batch_id)
            return FileResponse(
                path=jsonl_path,
                media_type="application/x-ndjson",
                filename=filename,
            )
        except DatasetExportError as error:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(error)) from error


@router.get("/{batch_id}/manifest")
def download_dataset_export_manifest(batch_id: UUID) -> Response:
    _require_feedback_db()
    with get_session_factory() as db_session:
        repository = DatasetExportRepository(db_session)
        service = DatasetExportService(repository)
        try:
            _, filename = service.get_manifest_bytes(batch_id)
            _, manifest_path = repository.artifact_paths(batch_id)
            return FileResponse(
                path=manifest_path,
                media_type="application/json",
                filename=filename,
            )
        except DatasetExportError as error:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(error)) from error
