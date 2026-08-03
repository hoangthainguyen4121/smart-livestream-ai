"""0006_dataset_export_batches

Revision ID: 0006_dataset_export_batches
Revises: 0005_intent_correction_review
Create Date: 2026-08-03
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "0006_dataset_export_batches"
down_revision = "0005_intent_correction_review"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "dataset_export_batches",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("format_version", sa.String(length=64), nullable=False),
        sa.Column("record_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("artifact_filename", sa.String(length=255), nullable=True),
        sa.Column("artifact_sha256", sa.String(length=64), nullable=True),
        sa.Column("manifest_sha256", sa.String(length=64), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_by", sa.String(length=128), nullable=True),
        sa.Column("failure_reason", sa.String(length=600), nullable=True),
        sa.CheckConstraint(
            "status IN ('creating', 'completed', 'failed')",
            name="ck_dataset_export_batches_status",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_dataset_export_batches_status_created",
        "dataset_export_batches",
        ["status", "created_at"],
        unique=False,
    )

    op.create_table(
        "dataset_export_batch_items",
        sa.Column("batch_id", sa.Uuid(), nullable=False),
        sa.Column("correction_sample_id", sa.Uuid(), nullable=False),
        sa.Column("source_comment_id", sa.String(length=64), nullable=False),
        sa.Column("source_comment_text", sa.String(length=600), nullable=False),
        sa.Column("predicted_intent", sa.String(length=64), nullable=False),
        sa.Column("final_intent", sa.String(length=64), nullable=False),
        sa.Column("prediction_confidence", sa.Float(), nullable=True),
        sa.Column("model_id", sa.String(length=128), nullable=False),
        sa.Column("model_version", sa.String(length=160), nullable=False),
        sa.Column("correction_created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["batch_id"],
            ["dataset_export_batches.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["correction_sample_id"],
            ["intent_correction_samples.id"],
        ),
        sa.PrimaryKeyConstraint("batch_id", "correction_sample_id"),
        sa.UniqueConstraint(
            "correction_sample_id",
            name="uq_dataset_export_batch_items_correction_sample",
        ),
    )
    op.create_index(
        "ix_intent_correction_samples_approved_reviewed",
        "intent_correction_samples",
        ["reviewed_at", "id"],
        unique=False,
        postgresql_where=sa.text("status = 'approved' AND final_intent IS NOT NULL"),
    )


def downgrade() -> None:
    op.drop_index(
        "ix_intent_correction_samples_approved_reviewed",
        table_name="intent_correction_samples",
    )
    op.drop_table("dataset_export_batch_items")
    op.drop_index("ix_dataset_export_batches_status_created", table_name="dataset_export_batches")
    op.drop_table("dataset_export_batches")
