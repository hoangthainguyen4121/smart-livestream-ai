"""0004_intent_correction_samples

Revision ID: 0004_intent_correction_samples
Revises: 0003_comments
Create Date: 2026-08-03
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "0004_intent_correction_samples"
down_revision = "0003_comments"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "intent_correction_samples",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False, server_default="pending"),
        sa.Column("room_id", sa.String(length=64), nullable=False),
        sa.Column("livestream_session_id", sa.Uuid(), nullable=True),
        sa.Column("source_comment_id", sa.String(length=64), nullable=False),
        sa.Column("source_comment_text", sa.String(length=600), nullable=False),
        sa.Column("source_author_display_name", sa.String(length=32), nullable=False),
        sa.Column("source_author_user_id", sa.Uuid(), nullable=True),
        sa.Column("source_created_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("reporter_user_id", sa.Uuid(), nullable=True),
        sa.Column("reporter_viewer_key", sa.String(length=128), nullable=True),
        sa.Column("predicted_intent", sa.String(length=64), nullable=False),
        sa.Column("prediction_confidence", sa.Float(), nullable=False),
        sa.Column("model_id", sa.String(length=128), nullable=False),
        sa.Column("model_version", sa.String(length=160), nullable=False),
        sa.Column("proposed_intent", sa.String(length=64), nullable=False),
        sa.Column("user_note", sa.String(length=600), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("status = 'pending'", name="ck_intent_correction_samples_status_pending"),
        sa.CheckConstraint(
            "prediction_confidence >= 0 AND prediction_confidence <= 1",
            name="ck_intent_correction_samples_confidence_range",
        ),
        sa.CheckConstraint(
            "predicted_intent <> proposed_intent",
            name="ck_intent_correction_samples_distinct_intents",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_intent_correction_samples_room_created",
        "intent_correction_samples",
        ["room_id", "created_at"],
        unique=False,
    )
    op.create_index(
        "uq_intent_correction_pending_reporter",
        "intent_correction_samples",
        ["source_comment_id", "reporter_viewer_key"],
        unique=True,
        postgresql_where=sa.text("status = 'pending' AND reporter_viewer_key IS NOT NULL"),
    )


def downgrade() -> None:
    op.drop_index("uq_intent_correction_pending_reporter", table_name="intent_correction_samples")
    op.drop_index("ix_intent_correction_samples_room_created", table_name="intent_correction_samples")
    op.drop_table("intent_correction_samples")
