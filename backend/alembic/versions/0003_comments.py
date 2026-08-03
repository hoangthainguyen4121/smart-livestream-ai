"""0003_comments

Revision ID: 0003_comments
Revises: 0002_livestream_sessions
Create Date: 2026-08-03
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0003_comments"
down_revision = "0002_livestream_sessions"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "comments",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("session_id", sa.Uuid(), nullable=False),
        sa.Column("room_id", sa.String(length=64), nullable=False),
        sa.Column("author_display_name", sa.String(length=32), nullable=False),
        sa.Column("author_user_id", sa.Uuid(), nullable=True),
        sa.Column("text", sa.String(length=600), nullable=False),
        sa.Column("reply_to_comment_id", sa.String(length=64), nullable=True),
        sa.Column("reply_to_author", sa.String(length=32), nullable=True),
        sa.Column("reply_to_text", sa.String(length=600), nullable=True),
        sa.Column("commerce_actions", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["author_user_id"], ["profiles.id"]),
        sa.ForeignKeyConstraint(["session_id"], ["livestream_sessions.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_comments_session_created", "comments", ["session_id", "created_at"], unique=False)
    op.create_index(
        "ix_comments_room_created_id",
        "comments",
        ["room_id", "created_at", "id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_comments_room_created_id", table_name="comments")
    op.drop_index("ix_comments_session_created", table_name="comments")
    op.drop_table("comments")
