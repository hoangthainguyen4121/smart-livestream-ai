from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from typing import Optional
from uuid import UUID, uuid4

from sqlmodel import Session, col, select

from app.db.models import (
    DatasetExportBatch,
    DatasetExportBatchStatus,
    DatasetExportProcessingRun,
    DatasetExportProcessingStatus,
    ML_RETRAIN_CONSUMER,
    MlRetrainBatchConsumptionState,
    MlRetrainCandidateRun,
    MlRetrainCandidateStatus,
)
from app.settings import get_settings


TERMINAL_CONSUMPTION_STATES = (
    MlRetrainBatchConsumptionState.CONSUMED.value,
    MlRetrainBatchConsumptionState.EXCLUDED.value,
)

ACTIVE_CANDIDATE_STATUSES = (
    MlRetrainCandidateStatus.CLAIMED.value,
    MlRetrainCandidateStatus.PROCESSING.value,
)

TERMINAL_CANDIDATE_STATUSES = (
    MlRetrainCandidateStatus.DEFERRED_WAITING_FOR_MORE_FEEDBACK.value,
    MlRetrainCandidateStatus.EXCLUDED_NONPRODUCTION_DATA.value,
    MlRetrainCandidateStatus.COMPLETED.value,
    MlRetrainCandidateStatus.FAILED.value,
)


def _enum_value(value) -> str:
    return value.value if hasattr(value, "value") else str(value)


class MlRetrainProcessingRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def get_run(self, batch_id: UUID, *, consumer: str = ML_RETRAIN_CONSUMER) -> Optional[DatasetExportProcessingRun]:
        statement = select(DatasetExportProcessingRun).where(
            DatasetExportProcessingRun.batch_id == batch_id,
            DatasetExportProcessingRun.consumer == consumer,
        )
        return self._session.exec(statement).first()

    def get_candidate_run(self, candidate_run_id: UUID) -> Optional[MlRetrainCandidateRun]:
        return self._session.get(MlRetrainCandidateRun, candidate_run_id)

    def claim_candidate_batches(
        self,
        *,
        consumer: str = ML_RETRAIN_CONSUMER,
        max_batches: int | None = None,
    ) -> Optional[MlRetrainCandidateRun]:
        settings = get_settings()
        stale_before = datetime.now(timezone.utc) - timedelta(minutes=settings.ml_retrain_stale_claim_minutes)
        batch_limit = max_batches or settings.ml_retrain_max_candidate_batches

        self._recover_stale_candidates(stale_before, consumer=consumer)

        if self._has_active_candidate(stale_before, consumer=consumer):
            self._session.rollback()
            return None

        waiting_batches = self._list_waiting_batches(consumer=consumer, limit=batch_limit)
        if not waiting_batches:
            self._session.rollback()
            return None

        now = datetime.now(timezone.utc)
        batch_ids = sorted(str(batch.id) for batch in waiting_batches)
        candidate = MlRetrainCandidateRun(
            id=uuid4(),
            consumer=consumer,
            batch_ids_json=json.dumps(batch_ids, sort_keys=True),
            status=MlRetrainCandidateStatus.CLAIMED,
            claimed_at=now,
            updated_at=now,
        )
        self._session.add(candidate)
        self._session.flush()

        for batch in waiting_batches:
            run = self.get_run(batch.id, consumer=consumer)
            if run is None:
                run = DatasetExportProcessingRun(
                    batch_id=batch.id,
                    consumer=consumer,
                    status=DatasetExportProcessingStatus.CLAIMED,
                    consumption_state=MlRetrainBatchConsumptionState.CLAIMED,
                    candidate_run_id=candidate.id,
                    claimed_at=now,
                    updated_at=now,
                )
            else:
                run.status = DatasetExportProcessingStatus.CLAIMED
                run.consumption_state = MlRetrainBatchConsumptionState.CLAIMED
                run.candidate_run_id = candidate.id
                run.claimed_at = now
                run.completed_at = None
                run.error_code = None
                run.error_message = None
                run.updated_at = now
            self._session.add(run)

        self._session.commit()
        self._session.refresh(candidate)
        return candidate

    def update_candidate_run(self, candidate: MlRetrainCandidateRun) -> MlRetrainCandidateRun:
        candidate.updated_at = datetime.now(timezone.utc)
        self._session.add(candidate)
        self._session.commit()
        self._session.refresh(candidate)
        return candidate

    def update_run(self, run: DatasetExportProcessingRun) -> DatasetExportProcessingRun:
        run.updated_at = datetime.now(timezone.utc)
        self._session.add(run)
        self._session.commit()
        self._session.refresh(run)
        return run

    def release_batches_to_waiting(self, batch_ids: list[UUID], *, consumer: str = ML_RETRAIN_CONSUMER) -> None:
        now = datetime.now(timezone.utc)
        for batch_id in batch_ids:
            run = self.get_run(batch_id, consumer=consumer)
            if run is None:
                continue
            run.status = DatasetExportProcessingStatus.PENDING
            run.consumption_state = MlRetrainBatchConsumptionState.WAITING
            run.candidate_run_id = None
            run.completed_at = None
            run.updated_at = now
            self._session.add(run)

    def mark_batches_consumed(
        self,
        batch_ids: list[UUID],
        *,
        consumer: str = ML_RETRAIN_CONSUMER,
        dataset_version_id: str | None = None,
    ) -> None:
        now = datetime.now(timezone.utc)
        for batch_id in batch_ids:
            run = self.get_run(batch_id, consumer=consumer)
            if run is None:
                continue
            run.status = DatasetExportProcessingStatus.COMPLETED
            run.consumption_state = MlRetrainBatchConsumptionState.CONSUMED
            run.dataset_version_id = dataset_version_id
            run.completed_at = now
            run.updated_at = now
            self._session.add(run)

    def mark_batches_excluded(self, batch_ids: list[UUID], *, consumer: str = ML_RETRAIN_CONSUMER) -> None:
        now = datetime.now(timezone.utc)
        for batch_id in batch_ids:
            run = self.get_run(batch_id, consumer=consumer)
            if run is None:
                run = DatasetExportProcessingRun(
                    batch_id=batch_id,
                    consumer=consumer,
                    status=DatasetExportProcessingStatus.EXCLUDED,
                    consumption_state=MlRetrainBatchConsumptionState.EXCLUDED,
                    completed_at=now,
                    updated_at=now,
                )
            else:
                run.status = DatasetExportProcessingStatus.EXCLUDED
                run.consumption_state = MlRetrainBatchConsumptionState.EXCLUDED
                run.candidate_run_id = None
                run.completed_at = now
                run.updated_at = now
            self._session.add(run)

    def _list_waiting_batches(
        self,
        *,
        consumer: str,
        limit: int,
    ) -> list[DatasetExportBatch]:
        batch_statement = (
            select(DatasetExportBatch)
            .where(DatasetExportBatch.status == DatasetExportBatchStatus.COMPLETED)
            .order_by(col(DatasetExportBatch.completed_at), col(DatasetExportBatch.id))
            .with_for_update(skip_locked=True)
        )
        batches = list(self._session.exec(batch_statement).all())
        waiting: list[DatasetExportBatch] = []
        for batch in batches:
            run = self.get_run(batch.id, consumer=consumer)
            if run is None:
                waiting.append(batch)
            elif _enum_value(run.consumption_state) == MlRetrainBatchConsumptionState.WAITING.value:
                waiting.append(batch)
            if len(waiting) >= limit:
                break
        return waiting

    def _has_active_candidate(self, stale_before: datetime, *, consumer: str) -> bool:
        statement = select(MlRetrainCandidateRun).where(
            MlRetrainCandidateRun.consumer == consumer,
            col(MlRetrainCandidateRun.status).in_(ACTIVE_CANDIDATE_STATUSES),
        )
        for candidate in self._session.exec(statement).all():
            if candidate.claimed_at is not None and candidate.claimed_at >= stale_before:
                return True
        return False

    def _recover_stale_candidates(self, stale_before: datetime, *, consumer: str) -> None:
        statement = select(MlRetrainCandidateRun).where(
            MlRetrainCandidateRun.consumer == consumer,
            col(MlRetrainCandidateRun.status).in_(ACTIVE_CANDIDATE_STATUSES),
        )
        for candidate in list(self._session.exec(statement).all()):
            if candidate.claimed_at is not None and candidate.claimed_at >= stale_before:
                continue
            batch_ids = [UUID(item) for item in json.loads(candidate.batch_ids_json)]
            self.release_batches_to_waiting(batch_ids, consumer=consumer)
            candidate.status = MlRetrainCandidateStatus.FAILED
            candidate.error_code = "stale_claim_recovered"
            candidate.error_message = "Candidate claim expired and batches were released."
            candidate.completed_at = datetime.now(timezone.utc)
            candidate.updated_at = datetime.now(timezone.utc)
            self._session.add(candidate)
        self._session.flush()

    # Legacy single-batch claim kept for backward compatibility in tests.
    def claim_next_batch(self, *, consumer: str = ML_RETRAIN_CONSUMER) -> Optional[tuple[DatasetExportBatch, DatasetExportProcessingRun]]:
        candidate = self.claim_candidate_batches(consumer=consumer, max_batches=1)
        if candidate is None:
            return None
        batch_ids = [UUID(item) for item in json.loads(candidate.batch_ids_json)]
        batch = self._session.get(DatasetExportBatch, batch_ids[0])
        run = self.get_run(batch_ids[0], consumer=consumer)
        if batch is None or run is None:
            return None
        return batch, run
