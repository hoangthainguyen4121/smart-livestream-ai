from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, Optional
from typing import Optional
from uuid import UUID

from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, select

from app.db.models import LivestreamSession, SessionStatus


class SessionAlreadyEndedError(Exception):
    pass


class SessionNotFoundError(Exception):
    pass


class SessionService:
    def __init__(self, session: Session) -> None:
        self._session = session

    def get_active_session(self, room_id: str) -> Optional[LivestreamSession]:
        statement = select(LivestreamSession).where(
            LivestreamSession.room_id == room_id,
            LivestreamSession.status == SessionStatus.ACTIVE,
        )
        return self._session.exec(statement).first()

    def start_session(
        self,
        room_id: str,
        *,
        host_user_id: Optional[UUID] = None,
        metadata: Optional[dict] = None,
    ) -> LivestreamSession:
        existing = self.get_active_session(room_id)
        if existing is not None:
            return existing

        livestream_session = LivestreamSession(
            room_id=room_id,
            host_user_id=host_user_id,
            status=SessionStatus.ACTIVE,
            metadata_json=metadata or {},
        )
        self._session.add(livestream_session)
        try:
            self._session.commit()
        except IntegrityError:
            self._session.rollback()
            existing = self.get_active_session(room_id)
            if existing is None:
                raise
            return existing

        self._session.refresh(livestream_session)
        return livestream_session

    def end_session(self, session_id: UUID) -> LivestreamSession:
        livestream_session = self._session.get(LivestreamSession, session_id)
        if livestream_session is None:
            raise SessionNotFoundError(str(session_id))

        if livestream_session.status == SessionStatus.ENDED:
            raise SessionAlreadyEndedError(str(session_id))

        livestream_session.status = SessionStatus.ENDED
        livestream_session.ended_at = datetime.now(timezone.utc)
        self._session.add(livestream_session)
        self._session.commit()
        self._session.refresh(livestream_session)
        return livestream_session
