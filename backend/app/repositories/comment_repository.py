from __future__ import annotations

from datetime import datetime
from typing import Any, Optional, Tuple
from uuid import UUID

from sqlalchemy.dialects.postgresql import insert
from sqlalchemy import and_, or_
from sqlmodel import Session, select

from app.db.models import Comment
from app.services.chat_manager import ChatMessage


MAX_COMMENT_HISTORY_LIMIT = 100
DEFAULT_COMMENT_HISTORY_LIMIT = 50


class CommentRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def save_comment(self, message: ChatMessage, session_id: UUID) -> Comment:
        created_at = datetime.fromisoformat(message.created_at.replace("Z", "+00:00"))
        row = Comment(
            id=message.id,
            session_id=session_id,
            room_id=message.room_id,
            author_display_name=message.author,
            author_user_id=None,
            text=message.text,
            reply_to_comment_id=message.reply_to_message_id,
            reply_to_author=message.reply_to_author,
            reply_to_text=message.reply_to_text,
            commerce_actions=(
                list(message.commerce_actions) if message.commerce_actions is not None else None
            ),
            created_at=created_at,
        )
        statement = (
            insert(Comment)
            .values(
                id=row.id,
                session_id=row.session_id,
                room_id=row.room_id,
                author_display_name=row.author_display_name,
                author_user_id=row.author_user_id,
                text=row.text,
                reply_to_comment_id=row.reply_to_comment_id,
                reply_to_author=row.reply_to_author,
                reply_to_text=row.reply_to_text,
                commerce_actions=row.commerce_actions,
                created_at=row.created_at,
            )
            .on_conflict_do_nothing(index_elements=["id"])
        )
        self._session.execute(statement)
        self._session.commit()
        persisted = self._session.get(Comment, row.id)
        if persisted is None:
            raise RuntimeError(f"Comment {row.id} was not persisted.")
        return persisted

    def list_comments(
        self,
        room_id: str,
        *,
        limit: int = DEFAULT_COMMENT_HISTORY_LIMIT,
        before_created_at: Optional[datetime] = None,
        before_id: Optional[str] = None,
    ) -> list[Comment]:
        bounded_limit = max(1, min(limit, MAX_COMMENT_HISTORY_LIMIT))
        statement = select(Comment).where(Comment.room_id == room_id)

        if before_created_at is not None and before_id is not None:
            statement = statement.where(
                or_(
                    Comment.created_at < before_created_at,
                    and_(Comment.created_at == before_created_at, Comment.id < before_id),
                )
            )

        statement = statement.order_by(Comment.created_at.desc(), Comment.id.desc()).limit(
            bounded_limit
        )
        rows = list(self._session.exec(statement).all())
        rows.reverse()
        return rows
