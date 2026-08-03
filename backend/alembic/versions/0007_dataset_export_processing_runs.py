"""0007_ml_retrain_processing

Revision ID: 0007_ml_retrain_processing
Revises: 0006_dataset_export_batches
Create Date: 2026-08-03
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "0007_ml_retrain_processing"
down_revision = "0006_dataset_export_batches"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "dataset_export_processing_runs",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("batch_id", sa.Uuid(), nullable=False),
        sa.Column("consumer", sa.String(length=64), nullable=False, server_default="ml_retrain"),
        sa.Column("status", sa.String(length=32), nullable=False),
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
        sa.ForeignKeyConstraint(["batch_id"], ["dataset_export_batches.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("batch_id", "consumer", name="uq_dataset_export_processing_runs_batch_consumer"),
    )
    op.create_index(
        "ix_dataset_export_processing_runs_consumer_status",
        "dataset_export_processing_runs",
        ["consumer", "status"],
    )


def downgrade() -> None:
    op.drop_index("ix_dataset_export_processing_runs_consumer_status", table_name="dataset_export_processing_runs")
    op.drop_table("dataset_export_processing_runs")
