from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum
from typing import Any, Dict, List, Optional
from uuid import UUID, uuid4

from sqlalchemy import Column, Index, String, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlmodel import Field, SQLModel


class ProfileRole(str, Enum):
    VIEWER = "viewer"
    HOST = "host"
    ADMIN = "admin"


class SessionStatus(str, Enum):
    ACTIVE = "active"
    ENDED = "ended"


class IntentCorrectionStatus(str, Enum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"


class DatasetExportBatchStatus(str, Enum):
    CREATING = "creating"
    COMPLETED = "completed"
    FAILED = "failed"


class DatasetExportProcessingStatus(str, Enum):
    PENDING = "pending"
    CLAIMED = "claimed"
    BLOCKED_BY_POLICY = "blocked_by_policy"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"
    EXCLUDED = "excluded"


class MlRetrainBatchConsumptionState(str, Enum):
    WAITING = "waiting"
    CLAIMED = "claimed"
    CONSUMED = "consumed"
    EXCLUDED = "excluded"


class MlRetrainCandidateStatus(str, Enum):
    CLAIMED = "claimed"
    PROCESSING = "processing"
    DEFERRED_WAITING_FOR_MORE_FEEDBACK = "deferred_waiting_for_more_feedback"
    EXCLUDED_NONPRODUCTION_DATA = "excluded_nonproduction_data"
    COMPLETED = "completed"
    FAILED = "failed"


ML_RETRAIN_CONSUMER = "ml_retrain"


class Profile(SQLModel, table=True):
    __tablename__ = "profiles"

    id: UUID = Field(primary_key=True)
    role: ProfileRole = Field(default=ProfileRole.VIEWER, sa_column=Column(String(16), nullable=False))
    display_name: Optional[str] = Field(default=None, max_length=64)
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
    updated_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        nullable=False,
    )


class LivestreamSession(SQLModel, table=True):
    __tablename__ = "livestream_sessions"
    __table_args__ = (
        Index(
            "ix_livestream_sessions_room_started",
            "room_id",
            "started_at",
        ),
        Index(
            "uq_livestream_sessions_room_active",
            "room_id",
            unique=True,
            postgresql_where=text("status = 'active'"),
        ),
    )

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    room_id: str = Field(max_length=64, nullable=False, index=True)
    host_user_id: Optional[UUID] = Field(default=None, foreign_key="profiles.id")
    status: SessionStatus = Field(
        default=SessionStatus.ACTIVE,
        sa_column=Column(String(16), nullable=False),
    )
    started_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
    ended_at: Optional[datetime] = Field(default=None)
    metadata_json: Dict[str, Any] = Field(
        default_factory=dict,
        sa_column=Column("metadata", JSONB, nullable=False, server_default=text("'{}'::jsonb")),
    )


class Comment(SQLModel, table=True):
    __tablename__ = "comments"
    __table_args__ = (
        Index("ix_comments_session_created", "session_id", "created_at"),
        Index("ix_comments_room_created_id", "room_id", "created_at", "id"),
    )

    id: str = Field(primary_key=True, max_length=64)
    session_id: UUID = Field(foreign_key="livestream_sessions.id", nullable=False)
    room_id: str = Field(max_length=64, nullable=False, index=True)
    author_display_name: str = Field(max_length=32, nullable=False)
    author_user_id: Optional[UUID] = Field(default=None, foreign_key="profiles.id")
    text: str = Field(max_length=600, nullable=False)
    reply_to_comment_id: Optional[str] = Field(default=None, max_length=64)
    reply_to_author: Optional[str] = Field(default=None, max_length=32)
    reply_to_text: Optional[str] = Field(default=None, max_length=600)
    commerce_actions: Optional[List[Dict[str, Any]]] = Field(
        default=None,
        sa_column=Column(JSONB, nullable=True),
    )
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        nullable=False,
    )


class IntentCorrectionSample(SQLModel, table=True):
    __tablename__ = "intent_correction_samples"
    __table_args__ = (
        Index("ix_intent_correction_samples_room_created", "room_id", "created_at"),
        Index(
            "ix_intent_correction_samples_status_created_id",
            "status",
            "created_at",
            "id",
        ),
        Index(
            "uq_intent_correction_pending_reporter",
            "source_comment_id",
            "reporter_viewer_key",
            unique=True,
            postgresql_where=text("status = 'pending' AND reporter_viewer_key IS NOT NULL"),
        ),
    )

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    status: IntentCorrectionStatus = Field(
        default=IntentCorrectionStatus.PENDING,
        sa_column=Column(String(16), nullable=False),
    )
    room_id: str = Field(max_length=64, nullable=False, index=True)
    livestream_session_id: Optional[UUID] = Field(default=None)
    source_comment_id: str = Field(max_length=64, nullable=False)
    source_comment_text: str = Field(max_length=600, nullable=False)
    source_author_display_name: str = Field(max_length=32, nullable=False)
    source_author_user_id: Optional[UUID] = Field(default=None, foreign_key="profiles.id")
    source_created_at: Optional[datetime] = Field(default=None)
    reporter_user_id: Optional[UUID] = Field(default=None, foreign_key="profiles.id")
    reporter_viewer_key: Optional[str] = Field(default=None, max_length=128)
    predicted_intent: str = Field(max_length=64, nullable=False)
    prediction_confidence: float = Field(nullable=False)
    model_id: str = Field(max_length=128, nullable=False)
    model_version: str = Field(max_length=160, nullable=False)
    proposed_intent: str = Field(max_length=64, nullable=False)
    user_note: Optional[str] = Field(default=None, max_length=600)
    final_intent: Optional[str] = Field(default=None, max_length=64)
    review_note: Optional[str] = Field(default=None, max_length=600)
    reviewed_at: Optional[datetime] = Field(default=None)
    reviewed_by: Optional[str] = Field(default=None, max_length=128)
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
    updated_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        nullable=False,
    )


class DatasetExportBatch(SQLModel, table=True):
    __tablename__ = "dataset_export_batches"
    __table_args__ = (
        Index("ix_dataset_export_batches_status_created", "status", "created_at"),
    )

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    status: DatasetExportBatchStatus = Field(
        sa_column=Column(String(16), nullable=False),
    )
    format_version: str = Field(max_length=64, nullable=False)
    record_count: int = Field(default=0, nullable=False)
    artifact_filename: Optional[str] = Field(default=None, max_length=255)
    artifact_sha256: Optional[str] = Field(default=None, max_length=64)
    manifest_sha256: Optional[str] = Field(default=None, max_length=64)
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
    completed_at: Optional[datetime] = Field(default=None)
    created_by: Optional[str] = Field(default=None, max_length=128)
    failure_reason: Optional[str] = Field(default=None, max_length=600)


class MlRetrainCandidateRun(SQLModel, table=True):
    __tablename__ = "ml_retrain_candidate_runs"
    __table_args__ = (
        Index("ix_ml_retrain_candidate_runs_consumer_status", "consumer", "status"),
    )

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    consumer: str = Field(default=ML_RETRAIN_CONSUMER, max_length=64, nullable=False)
    batch_ids_json: str = Field(nullable=False)
    status: MlRetrainCandidateStatus = Field(
        sa_column=Column(String(64), nullable=False),
    )
    dataset_version_id: Optional[str] = Field(default=None, max_length=128)
    precheck_reasons_json: Optional[str] = Field(default=None)
    kaggle_run_id: Optional[str] = Field(default=None, max_length=255)
    artifact_location: Optional[str] = Field(default=None, max_length=512)
    metrics_summary_json: Optional[str] = Field(default=None)
    promotion_eligible: bool = Field(default=False, nullable=False)
    error_code: Optional[str] = Field(default=None, max_length=64)
    error_message: Optional[str] = Field(default=None, max_length=600)
    claimed_at: Optional[datetime] = Field(default=None)
    completed_at: Optional[datetime] = Field(default=None)
    updated_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        nullable=False,
    )


class DatasetExportProcessingRun(SQLModel, table=True):
    __tablename__ = "dataset_export_processing_runs"
    __table_args__ = (
        Index("ix_dataset_export_processing_runs_consumer_status", "consumer", "status"),
        Index("ix_dataset_export_processing_runs_consumption_state", "consumer", "consumption_state"),
    )

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    batch_id: UUID = Field(foreign_key="dataset_export_batches.id", nullable=False)
    consumer: str = Field(default=ML_RETRAIN_CONSUMER, max_length=64, nullable=False)
    status: DatasetExportProcessingStatus = Field(
        sa_column=Column(String(32), nullable=False),
    )
    consumption_state: MlRetrainBatchConsumptionState = Field(
        default=MlRetrainBatchConsumptionState.WAITING,
        sa_column=Column(String(32), nullable=False),
    )
    candidate_run_id: Optional[UUID] = Field(
        default=None,
        foreign_key="ml_retrain_candidate_runs.id",
        nullable=True,
    )
    dataset_version_id: Optional[str] = Field(default=None, max_length=128)
    precheck_reasons_json: Optional[str] = Field(default=None)
    kaggle_run_id: Optional[str] = Field(default=None, max_length=255)
    artifact_location: Optional[str] = Field(default=None, max_length=512)
    metrics_summary_json: Optional[str] = Field(default=None)
    promotion_eligible: bool = Field(default=False, nullable=False)
    error_code: Optional[str] = Field(default=None, max_length=64)
    error_message: Optional[str] = Field(default=None, max_length=600)
    claimed_at: Optional[datetime] = Field(default=None)
    completed_at: Optional[datetime] = Field(default=None)
    updated_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        nullable=False,
    )


class DatasetExportBatchItem(SQLModel, table=True):
    __tablename__ = "dataset_export_batch_items"
    __table_args__ = (
        Index("ix_dataset_export_batch_items_batch_id", "batch_id"),
    )

    batch_id: UUID = Field(foreign_key="dataset_export_batches.id", primary_key=True)
    correction_sample_id: UUID = Field(
        foreign_key="intent_correction_samples.id",
        primary_key=True,
        unique=True,
    )
    source_comment_id: str = Field(max_length=64, nullable=False)
    source_comment_text: str = Field(max_length=600, nullable=False)
    predicted_intent: str = Field(max_length=64, nullable=False)
    final_intent: str = Field(max_length=64, nullable=False)
    prediction_confidence: Optional[float] = Field(default=None)
    model_id: str = Field(max_length=128, nullable=False)
    model_version: str = Field(max_length=160, nullable=False)
    correction_created_at: datetime = Field(nullable=False)
    reviewed_at: datetime = Field(nullable=False)
