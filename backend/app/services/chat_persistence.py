from __future__ import annotations

import asyncio
import logging

from app.db.engine import get_session_factory
from app.repositories.comment_repository import CommentRepository
from app.services.chat_manager import ChatManager, ChatMessage
from app.services.session_service import SessionService
from app.settings import ChatPersistenceMode, get_settings

logger = logging.getLogger(__name__)


class NoActiveSessionError(Exception):
    """Raised when short_retention mode is active but the room has no active session."""


class CommentPersistenceError(Exception):
    """Raised when a comment could not be durably stored."""


class ChatPersistenceService:
    def __init__(self, chat_manager: ChatManager) -> None:
        self._chat_manager = chat_manager

    async def handle_chat_message(self, room_id: str, payload: dict) -> ChatMessage:
        settings = get_settings()
        if settings.chat_persistence_mode == ChatPersistenceMode.MEMORY:
            return await self._chat_manager.broadcast_message(room_id, payload)

        requested_id = payload.get("id")
        if isinstance(requested_id, str) and requested_id.strip():
            existing = self._chat_manager.find_message_by_id(room_id, requested_id.strip())
            if existing is not None:
                return existing

        message = self._chat_manager.build_message(room_id, payload)

        try:
            await asyncio.wait_for(
                asyncio.to_thread(self._persist_comment, room_id, message),
                timeout=settings.comment_persist_timeout_seconds,
            )
        except asyncio.TimeoutError as error:
            raise CommentPersistenceError("Comment persistence timed out.") from error
        except NoActiveSessionError:
            raise
        except Exception as error:
            logger.exception("Comment persistence failed")
            raise CommentPersistenceError("Comment persistence failed.") from error

        return await self._chat_manager.broadcast_existing_message(room_id, message)

    def _persist_comment(self, room_id: str, message: ChatMessage) -> None:
        with get_session_factory() as db_session:
            session_service = SessionService(db_session)
            active_session = session_service.get_active_session(room_id)
            if active_session is None:
                raise NoActiveSessionError(room_id)

            comment_repo = CommentRepository(db_session)
            comment_repo.save_comment(message, active_session.id)
