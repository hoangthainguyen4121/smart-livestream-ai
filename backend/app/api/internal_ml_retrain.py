from __future__ import annotations

from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Response
from sqlmodel import Session

from app.db.engine import get_engine, is_feedback_db_configured
from app.ml_retrain_worker_auth import require_ml_retrain_worker_api_key
from app.repositories.dataset_export_repository import DatasetExportRepository
from app.repositories.ml_retrain_processing_repository import MlRetrainProcessingRepository
from app.schemas.ml_retrain_worker import (
    ClaimCandidateResponse,
    ClaimNextExportBatchResponse,
    ExportBatchMetadataResponse,
    MlRetrainCandidateResultRequest,
    MlRetrainCandidateResultResponse,
    MlRetrainResultRequest,
    MlRetrainResultResponse,
)
from app.services.ml_retrain_worker_service import MlRetrainWorkerService

router = APIRouter(
    prefix="/internal/ml-retrain",
    tags=["internal-ml-retrain"],
    dependencies=[Depends(require_ml_retrain_worker_api_key)],
)


def _require_feedback_db() -> None:
    if not is_feedback_db_configured():
        from fastapi import HTTPException

        raise HTTPException(
            status_code=503,
            detail={"code": "feedback_db_unavailable", "message": "DATABASE_URL is required for ML retrain worker API."},
        )


def _service(session: Session) -> MlRetrainWorkerService:
    export_repository = DatasetExportRepository(session)
    processing_repository = MlRetrainProcessingRepository(session)
    return MlRetrainWorkerService(export_repository, processing_repository)


@router.post("/claim-candidate", response_model=ClaimCandidateResponse)
def claim_candidate(
    max_batches: Optional[int] = Query(default=None, ge=1, le=500),
) -> ClaimCandidateResponse:
    _require_feedback_db()
    engine = get_engine()
    with Session(engine) as session:
        payload = _service(session).claim_candidate(max_batches=max_batches)
    return ClaimCandidateResponse(**payload)


@router.post("/claim-next-export-batch", response_model=ClaimNextExportBatchResponse)
def claim_next_export_batch() -> ClaimNextExportBatchResponse:
    _require_feedback_db()
    engine = get_engine()
    with Session(engine) as session:
        payload = _service(session).claim_candidate()
    if not payload.get("available"):
        return ClaimNextExportBatchResponse(available=False)
    batch_ids = payload.get("batch_ids") or []
    if not batch_ids:
        return ClaimNextExportBatchResponse(available=False)
    return ClaimNextExportBatchResponse(
        available=True,
        batch_id=batch_ids[0],
        processing_run_id=payload.get("candidate_run_id"),
        status=payload.get("status"),
    )


@router.get("/batches/{batch_id}/metadata", response_model=ExportBatchMetadataResponse)
def get_batch_metadata(batch_id: UUID) -> ExportBatchMetadataResponse:
    _require_feedback_db()
    engine = get_engine()
    with Session(engine) as session:
        payload = _service(session).get_batch_metadata(batch_id)
    return ExportBatchMetadataResponse(**payload)


@router.get("/batches/{batch_id}/artifact")
def download_batch_artifact(batch_id: UUID) -> Response:
    _require_feedback_db()
    engine = get_engine()
    with Session(engine) as session:
        data, filename = _service(session).get_artifact_bytes(batch_id)
    return Response(
        content=data,
        media_type="application/x-ndjson",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/batches/{batch_id}/manifest")
def download_batch_manifest(batch_id: UUID) -> Response:
    _require_feedback_db()
    engine = get_engine()
    with Session(engine) as session:
        data, filename = _service(session).get_manifest_bytes(batch_id)
    return Response(
        content=data,
        media_type="application/json",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("/candidates/{candidate_run_id}/result", response_model=MlRetrainCandidateResultResponse)
def post_candidate_result(
    candidate_run_id: UUID,
    payload: MlRetrainCandidateResultRequest,
) -> MlRetrainCandidateResultResponse:
    _require_feedback_db()
    engine = get_engine()
    with Session(engine) as session:
        result = _service(session).post_candidate_result(candidate_run_id, payload)
    return MlRetrainCandidateResultResponse(**result)


@router.post("/batches/{batch_id}/result", response_model=MlRetrainResultResponse)
def post_batch_result(batch_id: UUID, payload: MlRetrainResultRequest) -> MlRetrainResultResponse:
    _require_feedback_db()
    engine = get_engine()
    with Session(engine) as session:
        result = _service(session).post_result(batch_id, payload)
    return MlRetrainResultResponse(**result)
