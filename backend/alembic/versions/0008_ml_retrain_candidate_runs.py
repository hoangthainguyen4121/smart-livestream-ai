"""0008_ml_retrain_candidate_runs

Revision ID: 0008_ml_retrain_candidate
Revises: 0007_ml_retrain_processing
Create Date: 2026-08-03
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "0008_ml_retrain_candidate"
down_revision = "0007_ml_retrain_processing"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "ml_retrain_candidate_runs",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("consumer", sa.String(length=64), nullable=False, server_default="ml_retrain"),
        sa.Column("batch_ids_json", sa.Text(), nullable=False),
        sa.Column("status", sa.String(length=64), nullable=False),
        sa.Column("dataset_version_id", sa.String(length=128), nullable=True),
        sa.Column("precheck_reasons_json", sa.Text(), nullable=True),
        sa.Column("kaggle_run_id", sa.String(length=255), nullable=True),
        sa.Column("artifact_location", sa.String(length=512), nullable=True),
        sa.Column("metrics_summary_json", sa.Text(), nullable=True),
        sa.Column("promotion_eligible", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("error_code", sa.String(length=64), nullable=True),
        sa.Column("error_message", sa.String(length=600), nullable=True),
        sa.Column("claimed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_ml_retrain_candidate_runs_consumer_status",
        "ml_retrain_candidate_runs",
        ["consumer", "status"],
    )

    op.add_column(
        "dataset_export_processing_runs",
        sa.Column("consumption_state", sa.String(length=32), nullable=False, server_default="waiting"),
    )
    op.add_column(
        "dataset_export_processing_runs",
        sa.Column("candidate_run_id", sa.Uuid(), nullable=True),
    )
    op.create_foreign_key(
        "fk_dataset_export_processing_runs_candidate_run_id",
        "dataset_export_processing_runs",
        "ml_retrain_candidate_runs",
        ["candidate_run_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index(
        "ix_dataset_export_processing_runs_consumption_state",
        "dataset_export_processing_runs",
        ["consumer", "consumption_state"],
    )

    # Release batches previously terminal-blocked for insufficient feedback.
    op.execute(
        """
        UPDATE dataset_export_processing_runs
        SET consumption_state = 'waiting',
            status = 'pending',
            completed_at = NULL,
            error_code = NULL,
            error_message = NULL,
            candidate_run_id = NULL
        WHERE status = 'blocked_by_policy'
        """
    )


def downgrade() -> None:
    op.drop_index("ix_dataset_export_processing_runs_consumption_state", table_name="dataset_export_processing_runs")
    op.drop_constraint(
        "fk_dataset_export_processing_runs_candidate_run_id",
        "dataset_export_processing_runs",
        type_="foreignkey",
    )
    op.drop_column("dataset_export_processing_runs", "candidate_run_id")
    op.drop_column("dataset_export_processing_runs", "consumption_state")
    op.drop_index("ix_ml_retrain_candidate_runs_consumer_status", table_name="ml_retrain_candidate_runs")
    op.drop_table("ml_retrain_candidate_runs")
