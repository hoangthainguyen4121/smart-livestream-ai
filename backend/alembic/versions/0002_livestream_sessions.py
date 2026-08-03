"""0002_livestream_sessions

Revision ID: 0002_livestream_sessions
Revises: 0001_profiles
Create Date: 2026-08-03
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0002_livestream_sessions"
down_revision = "0001_profiles"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "livestream_sessions",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("room_id", sa.String(length=64), nullable=False),
        sa.Column("host_user_id", sa.Uuid(), nullable=True),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("ended_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "metadata",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.CheckConstraint("status IN ('active', 'ended')", name="ck_livestream_sessions_status"),
        sa.ForeignKeyConstraint(["host_user_id"], ["profiles.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_livestream_sessions_room_started",
        "livestream_sessions",
        ["room_id", "started_at"],
        unique=False,
    )
    op.create_index(
        "uq_livestream_sessions_room_active",
        "livestream_sessions",
        ["room_id"],
        unique=True,
        postgresql_where=sa.text("status = 'active'"),
    )


def downgrade() -> None:
    op.drop_index("uq_livestream_sessions_room_active", table_name="livestream_sessions")
    op.drop_index("ix_livestream_sessions_room_started", table_name="livestream_sessions")
    op.drop_table("livestream_sessions")
