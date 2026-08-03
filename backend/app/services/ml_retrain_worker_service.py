from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Optional
from uuid import UUID

from fastapi import HTTPException

from app.db.models import (
    DatasetExportBatchStatus,
    DatasetExportProcessingStatus,
    MlRetrainBatchConsumptionState,
    MlRetrainCandidateStatus,
)
from app.repositories.dataset_export_repository import DatasetExportRepository
from app.repositories.ml_retrain_processing_repository import (
    ACTIVE_CANDIDATE_STATUSES,
    TERMINAL_CANDIDATE_STATUSES,
    MlRetrainProcessingRepository,
)
from app.schemas.ml_retrain_worker import MlRetrainCandidateResultRequest, MlRetrainResultRequest
from app.services.dataset_export_service import DatasetExportService


VALID_CANDIDATE_RESULT_STATUSES = frozenset(
    {
        MlRetrainCandidateStatus.PROCESSING.value,
        MlRetrainCandidateStatus.DEFERRED_WAITING_FOR_MORE_FEEDBACK.value,
        MlRetrainCandidateStatus.EXCLUDED_NONPRODUCTION_DATA.value,
        MlRetrainCandidateStatus.COMPLETED.value,
        MlRetrainCandidateStatus.FAILED.value,
    }
)

CANDIDATE_ALLOWED_TRANSITIONS = {
    MlRetrainCandidateStatus.CLAIMED.value: {
        MlRetrainCandidateStatus.PROCESSING.value,
        MlRetrainCandidateStatus.DEFERRED_WAITING_FOR_MORE_FEEDBACK.value,
        MlRetrainCandidateStatus.EXCLUDED_NONPRODUCTION_DATA.value,
        MlRetrainCandidateStatus.COMPLETED.value,
        MlRetrainCandidateStatus.FAILED.value,
    },
    MlRetrainCandidateStatus.PROCESSING.value: {
        MlRetrainCandidateStatus.COMPLETED.value,
        MlRetrainCandidateStatus.FAILED.value,
    },
}

VALID_RESULT_STATUSES = frozenset(
    {
        DatasetExportProcessingStatus.PROCESSING.value,
        DatasetExportProcessingStatus.COMPLETED.value,
        DatasetExportProcessingStatus.FAILED.value,
    }
)

ALLOWED_TRANSITIONS = {
    DatasetExportProcessingStatus.CLAIMED.value: {
        DatasetExportProcessingStatus.PROCESSING.value,
        DatasetExportProcessingStatus.COMPLETED.value,
        DatasetExportProcessingStatus.FAILED.value,
    },
    DatasetExportProcessingStatus.PROCESSING.value: {
        DatasetExportProcessingStatus.COMPLETED.value,
        DatasetExportProcessingStatus.FAILED.value,
    },
}


class MlRetrainWorkerService:
    def __init__(
        self,
        export_repository: DatasetExportRepository,
        processing_repository: MlRetrainProcessingRepository,
    ) -> None:
        self._export_repository = export_repository
        self._processing_repository = processing_repository
        self._export_service = DatasetExportService(export_repository)

    def claim_candidate(self, *, max_batches: int | None = None):
        candidate = self._processing_repository.claim_candidate_batches(max_batches=max_batches)
        if candidate is None:
            return {"available": False}
        batch_ids = json.loads(candidate.batch_ids_json)
        status_value = candidate.status.value if hasattr(candidate.status, "value") else str(candidate.status)
        return {
            "available": True,
            "candidate_run_id": candidate.id,
            "batch_ids": [UUID(item) for item in batch_ids],
            "status": status_value,
        }

    def claim_next_export_batch(self):
        claimed = self._processing_repository.claim_next_batch()
        if claimed is None:
            return {"available": False}
        batch, run = claimed
        status_value = run.status.value if hasattr(run.status, "value") else str(run.status)
        return {
            "available": True,
            "batch_id": batch.id,
            "processing_run_id": run.id,
            "status": status_value,
        }

    def get_batch_metadata(self, batch_id: UUID) -> dict:
        batch = self._require_completed_batch(batch_id)
        run = self._require_processing_run(batch_id)
        if batch.artifact_sha256 is None or batch.manifest_sha256 is None or batch.artifact_filename is None:
            raise HTTPException(status_code=409, detail={"code": "export_batch_incomplete", "message": "Batch checksum metadata missing."})
        consumption_state = (
            run.consumption_state.value if hasattr(run.consumption_state, "value") else str(run.consumption_state)
        )
        return {
            "batch_id": batch.id,
            "record_count": batch.record_count,
            "artifact_sha256": batch.artifact_sha256,
            "manifest_sha256": batch.manifest_sha256,
            "format_version": batch.format_version,
            "artifact_filename": batch.artifact_filename,
            "processing_status": run.status.value if hasattr(run.status, "value") else str(run.status),
            "consumption_state": consumption_state,
            "processing_run_id": run.id,
            "candidate_run_id": run.candidate_run_id,
        }

    def get_artifact_bytes(self, batch_id: UUID) -> tuple[bytes, str]:
        return self._export_service.get_artifact_bytes(batch_id)

    def get_manifest_bytes(self, batch_id: UUID) -> tuple[bytes, str]:
        return self._export_service.get_manifest_bytes(batch_id)

    def post_candidate_result(self, candidate_run_id: UUID, payload: MlRetrainCandidateResultRequest) -> dict:
        if payload.status not in VALID_CANDIDATE_RESULT_STATUSES:
            raise HTTPException(status_code=422, detail={"code": "invalid_status", "message": f"Unsupported status: {payload.status}"})
        if payload.promotion_eligible:
            raise HTTPException(status_code=422, detail={"code": "promotion_not_allowed", "message": "promotion_eligible must be false."})

        candidate = self._processing_repository.get_candidate_run(candidate_run_id)
        if candidate is None:
            raise HTTPException(status_code=404, detail={"code": "candidate_run_not_found", "message": "Candidate run not found."})

        current_status = candidate.status.value if hasattr(candidate.status, "value") else str(candidate.status)
        if current_status in TERMINAL_CANDIDATE_STATUSES:
            if self._is_idempotent_candidate_repeat(candidate, payload):
                return self._candidate_result_payload(candidate, idempotent=True)
            raise HTTPException(
                status_code=409,
                detail={"code": "candidate_terminal", "message": f"Candidate already terminal with status {current_status}."},
            )

        allowed = CANDIDATE_ALLOWED_TRANSITIONS.get(current_status, set())
        if payload.status not in allowed and not (
            current_status == payload.status and current_status == MlRetrainCandidateStatus.PROCESSING.value
        ):
            raise HTTPException(
                status_code=409,
                detail={
                    "code": "invalid_transition",
                    "message": f"Cannot transition candidate from {current_status} to {payload.status}.",
                },
            )

        if self._is_idempotent_candidate_repeat(candidate, payload):
            return self._candidate_result_payload(candidate, idempotent=True)

        batch_ids = [UUID(item) for item in json.loads(candidate.batch_ids_json)]
        excluded_batch_ids = [UUID(item) for item in (payload.excluded_batch_ids or [])]

        candidate.status = MlRetrainCandidateStatus(payload.status)
        candidate.dataset_version_id = payload.dataset_version_id
        candidate.precheck_reasons_json = (
            json.dumps(payload.precheck_reasons, ensure_ascii=False, sort_keys=True)
            if payload.precheck_reasons is not None
            else candidate.precheck_reasons_json
        )
        candidate.kaggle_run_id = payload.kaggle_run_id
        candidate.artifact_location = payload.artifact_location
        candidate.metrics_summary_json = (
            json.dumps(payload.metrics, ensure_ascii=False, sort_keys=True)
            if payload.metrics is not None
            else candidate.metrics_summary_json
        )
        candidate.promotion_eligible = False
        candidate.error_code = payload.error_code
        candidate.error_message = (payload.error_message or "")[:600] or None
        now = datetime.now(timezone.utc)
        candidate.updated_at = now
        if payload.status in TERMINAL_CANDIDATE_STATUSES:
            candidate.completed_at = now
        if payload.status == MlRetrainCandidateStatus.PROCESSING.value and candidate.claimed_at is None:
            candidate.claimed_at = now

        if payload.status == MlRetrainCandidateStatus.DEFERRED_WAITING_FOR_MORE_FEEDBACK.value:
            self._processing_repository.release_batches_to_waiting(batch_ids)
        elif payload.status == MlRetrainCandidateStatus.EXCLUDED_NONPRODUCTION_DATA.value:
            if excluded_batch_ids:
                self._processing_repository.mark_batches_excluded(excluded_batch_ids)
                remaining = [item for item in batch_ids if item not in set(excluded_batch_ids)]
                if remaining:
                    self._processing_repository.release_batches_to_waiting(remaining)
            else:
                self._processing_repository.release_batches_to_waiting(batch_ids)
        elif payload.status == MlRetrainCandidateStatus.COMPLETED.value:
            self._processing_repository.mark_batches_consumed(
                batch_ids,
                dataset_version_id=payload.dataset_version_id,
            )
        elif payload.status == MlRetrainCandidateStatus.FAILED.value:
            self._processing_repository.release_batches_to_waiting(batch_ids)

        updated = self._processing_repository.update_candidate_run(candidate)
        return self._candidate_result_payload(updated, idempotent=False)

    def post_result(self, batch_id: UUID, payload: MlRetrainResultRequest) -> dict:
        if payload.status not in VALID_RESULT_STATUSES:
            raise HTTPException(status_code=422, detail={"code": "invalid_status", "message": f"Unsupported status: {payload.status}"})
        if payload.promotion_eligible:
            raise HTTPException(status_code=422, detail={"code": "promotion_not_allowed", "message": "promotion_eligible must be false."})

        batch = self._require_completed_batch(batch_id)
        run = self._require_processing_run(batch_id)
        current_status = run.status.value if hasattr(run.status, "value") else str(run.status)
        consumption_state = run.consumption_state.value if hasattr(run.consumption_state, "value") else str(run.consumption_state)

        if consumption_state in (
            MlRetrainBatchConsumptionState.CONSUMED.value,
            MlRetrainBatchConsumptionState.EXCLUDED.value,
        ):
            if self._is_idempotent_repeat(run, payload):
                return self._result_payload(batch_id, run, idempotent=True)
            raise HTTPException(
                status_code=409,
                detail={"code": "processing_terminal", "message": f"Batch already terminal with consumption_state {consumption_state}."},
            )

        allowed = ALLOWED_TRANSITIONS.get(current_status, set())
        if payload.status not in allowed and not (
            current_status == payload.status and current_status == DatasetExportProcessingStatus.PROCESSING.value
        ):
            raise HTTPException(
                status_code=409,
                detail={
                    "code": "invalid_transition",
                    "message": f"Cannot transition from {current_status} to {payload.status}.",
                },
            )

        if self._is_idempotent_repeat(run, payload):
            return self._result_payload(batch_id, run, idempotent=True)

        run.status = DatasetExportProcessingStatus(payload.status)
        run.dataset_version_id = payload.dataset_version_id
        run.precheck_reasons_json = (
            json.dumps(payload.precheck_reasons, ensure_ascii=False, sort_keys=True)
            if payload.precheck_reasons is not None
            else run.precheck_reasons_json
        )
        run.kaggle_run_id = payload.kaggle_run_id
        run.artifact_location = payload.artifact_location
        run.metrics_summary_json = (
            json.dumps(payload.metrics, ensure_ascii=False, sort_keys=True)
            if payload.metrics is not None
            else run.metrics_summary_json
        )
        run.promotion_eligible = False
        run.error_code = payload.error_code
        run.error_message = (payload.error_message or "")[:600] or None
        now = datetime.now(timezone.utc)
        run.updated_at = now
        if payload.status in (
            DatasetExportProcessingStatus.COMPLETED.value,
            DatasetExportProcessingStatus.FAILED.value,
        ):
            run.completed_at = now
        if payload.status == DatasetExportProcessingStatus.COMPLETED.value:
            run.consumption_state = MlRetrainBatchConsumptionState.CONSUMED
        if payload.status == DatasetExportProcessingStatus.PROCESSING.value and run.claimed_at is None:
            run.claimed_at = now

        updated = self._processing_repository.update_run(run)
        return self._result_payload(batch_id, updated, idempotent=False)

    def _require_completed_batch(self, batch_id: UUID):
        batch = self._export_repository.get_batch(batch_id)
        if batch is None:
            raise HTTPException(status_code=404, detail={"code": "batch_not_found", "message": "Export batch not found."})
        status_value = batch.status.value if hasattr(batch.status, "value") else str(batch.status)
        if status_value != DatasetExportBatchStatus.COMPLETED.value:
            raise HTTPException(status_code=409, detail={"code": "batch_not_completed", "message": "Export batch is not completed."})
        return batch

    def _require_processing_run(self, batch_id: UUID):
        run = self._processing_repository.get_run(batch_id)
        if run is None:
            raise HTTPException(status_code=404, detail={"code": "processing_run_not_found", "message": "Processing run not found."})
        return run

    @staticmethod
    def _is_idempotent_candidate_repeat(candidate, payload: MlRetrainCandidateResultRequest) -> bool:
        current_status = candidate.status.value if hasattr(candidate.status, "value") else str(candidate.status)
        if current_status != payload.status:
            return False
        if payload.dataset_version_id and candidate.dataset_version_id and payload.dataset_version_id != candidate.dataset_version_id:
            return False
        if payload.error_code and candidate.error_code and payload.error_code != candidate.error_code:
            return False
        return current_status in TERMINAL_CANDIDATE_STATUSES or current_status == MlRetrainCandidateStatus.FAILED.value

    @staticmethod
    def _is_idempotent_repeat(run, payload: MlRetrainResultRequest) -> bool:
        current_status = run.status.value if hasattr(run.status, "value") else str(run.status)
        if current_status != payload.status:
            return False
        if payload.dataset_version_id and run.dataset_version_id and payload.dataset_version_id != run.dataset_version_id:
            return False
        if payload.error_code and run.error_code and payload.error_code != run.error_code:
            return False
        consumption_state = run.consumption_state.value if hasattr(run.consumption_state, "value") else str(run.consumption_state)
        return consumption_state in (
            MlRetrainBatchConsumptionState.CONSUMED.value,
            MlRetrainBatchConsumptionState.EXCLUDED.value,
        ) or current_status == DatasetExportProcessingStatus.FAILED.value

    @staticmethod
    def _candidate_result_payload(candidate, *, idempotent: bool) -> dict:
        status_value = candidate.status.value if hasattr(candidate.status, "value") else str(candidate.status)
        batch_ids = json.loads(candidate.batch_ids_json)
        return {
            "candidate_run_id": candidate.id,
            "batch_ids": [UUID(item) for item in batch_ids],
            "status": status_value,
            "updated_at": candidate.updated_at,
            "idempotent": idempotent,
        }

    @staticmethod
    def _result_payload(batch_id: UUID, run, *, idempotent: bool) -> dict:
        status_value = run.status.value if hasattr(run.status, "value") else str(run.status)
        return {
            "batch_id": batch_id,
            "processing_run_id": run.id,
            "status": status_value,
            "updated_at": run.updated_at,
            "idempotent": idempotent,
        }
