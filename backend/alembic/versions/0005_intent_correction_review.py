"""0005_intent_correction_review

Revision ID: 0005_intent_correction_review
Revises: 0004_intent_correction_samples
Create Date: 2026-08-03
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "0005_intent_correction_review"
down_revision = "0004_intent_correction_samples"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_constraint(
        "ck_intent_correction_samples_status_pending",
        "intent_correction_samples",
        type_="check",
    )
    op.add_column(
        "intent_correction_samples",
        sa.Column("final_intent", sa.String(length=64), nullable=True),
    )
    op.add_column(
        "intent_correction_samples",
        sa.Column("review_note", sa.String(length=600), nullable=True),
    )
    op.add_column(
        "intent_correction_samples",
        sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "intent_correction_samples",
        sa.Column("reviewed_by", sa.String(length=128), nullable=True),
    )
    op.create_check_constraint(
        "ck_intent_correction_samples_status",
        "intent_correction_samples",
        "status IN ('pending', 'approved', 'rejected')",
    )
    op.create_check_constraint(
        "ck_intent_correction_samples_pending_no_final",
        "intent_correction_samples",
        "(status = 'pending' AND final_intent IS NULL) OR status <> 'pending'",
    )
    op.create_check_constraint(
        "ck_intent_correction_samples_approved_final",
        "intent_correction_samples",
        "(status = 'approved' AND final_intent IS NOT NULL) OR status <> 'approved'",
    )
    op.create_index(
        "ix_intent_correction_samples_status_created_id",
        "intent_correction_samples",
        ["status", "created_at", "id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        "ix_intent_correction_samples_status_created_id",
        table_name="intent_correction_samples",
    )
    op.drop_constraint(
        "ck_intent_correction_samples_approved_final",
        "intent_correction_samples",
        type_="check",
    )
    op.drop_constraint(
        "ck_intent_correction_samples_pending_no_final",
        "intent_correction_samples",
        type_="check",
    )
    op.drop_constraint(
        "ck_intent_correction_samples_status",
        "intent_correction_samples",
        type_="check",
    )
    op.drop_column("intent_correction_samples", "reviewed_by")
    op.drop_column("intent_correction_samples", "reviewed_at")
    op.drop_column("intent_correction_samples", "review_note")
    op.drop_column("intent_correction_samples", "final_intent")
    op.create_check_constraint(
        "ck_intent_correction_samples_status_pending",
        "intent_correction_samples",
        "status = 'pending'",
    )
