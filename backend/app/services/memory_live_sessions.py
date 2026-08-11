from __future__ import annotations

import threading
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, Optional
from uuid import UUID, uuid4

from app.db.models import SessionStatus


VISUAL_MODERATION_ENDED_REASON = "visual_moderation_violation"


@dataclass
class MemoryLiveSession:
    id: UUID
    room_id: str
    status: SessionStatus = SessionStatus.ACTIVE
    started_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    ended_at: Optional[datetime] = None
    metadata_json: Dict[str, Any] = field(default_factory=dict)

    @property
    def metadata(self) -> Dict[str, Any]:
        return self.metadata_json


class MemoryLiveSessionStore:
    """Process-local live sessions for demos without short_retention DB mode."""

    def __init__(self) -> None:
        self._sessions: Dict[UUID, MemoryLiveSession] = {}
        self._active_by_room: Dict[str, UUID] = {}
        self._lock = threading.RLock()

    def get_active_session(self, room_id: str) -> Optional[MemoryLiveSession]:
        with self._lock:
            session_id = self._active_by_room.get(room_id)
            if session_id is None:
                return None
            return self._sessions.get(session_id)

    def get_session(self, session_id: UUID) -> Optional[MemoryLiveSession]:
        with self._lock:
            return self._sessions.get(session_id)

    def list_active_sessions(self) -> list[MemoryLiveSession]:
        with self._lock:
            sessions = [
                session
                for session in self._sessions.values()
                if session.status == SessionStatus.ACTIVE
            ]
            sessions.sort(key=lambda item: item.started_at, reverse=True)
            return sessions

    def start_session(
        self,
        room_id: str,
        *,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> MemoryLiveSession:
        with self._lock:
            existing_id = self._active_by_room.get(room_id)
            if existing_id is not None:
                existing = self._sessions[existing_id]
                if existing.status == SessionStatus.ACTIVE:
                    return existing

            session = MemoryLiveSession(
                id=uuid4(),
                room_id=room_id,
                metadata_json=dict(metadata or {}),
            )
            self._sessions[session.id] = session
            self._active_by_room[room_id] = session.id
            return session

    def update_metadata(
        self,
        session_id: UUID,
        metadata: Dict[str, Any],
    ) -> MemoryLiveSession:
        with self._lock:
            session = self._sessions.get(session_id)
            if session is None:
                raise KeyError(str(session_id))
            session.metadata_json = dict(metadata)
            return session

    def end_session(
        self,
        session_id: UUID,
        *,
        ended_reason: Optional[str] = None,
        moderation_event: Optional[Dict[str, Any]] = None,
    ) -> MemoryLiveSession:
        with self._lock:
            session = self._sessions.get(session_id)
            if session is None:
                raise KeyError(str(session_id))

            if session.status == SessionStatus.ENDED:
                return session

            session.status = SessionStatus.ENDED
            session.ended_at = datetime.now(timezone.utc)
            metadata = dict(session.metadata_json)
            if ended_reason:
                metadata["ended_reason"] = ended_reason
            if moderation_event is not None:
                events = list(metadata.get("moderation_events") or [])
                events.append(moderation_event)
                metadata["moderation_events"] = events
            session.metadata_json = metadata

            if self._active_by_room.get(session.room_id) == session.id:
                del self._active_by_room[session.room_id]
            return session

    def clear(self) -> None:
        with self._lock:
            self._sessions.clear()
            self._active_by_room.clear()


_memory_store = MemoryLiveSessionStore()


def get_memory_live_session_store() -> MemoryLiveSessionStore:
    return _memory_store
