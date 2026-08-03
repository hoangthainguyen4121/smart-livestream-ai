from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, Optional
from uuid import UUID

from pydantic import BaseModel, Field


class StartSessionRequest(BaseModel):
    room_id: str = Field(min_length=1, max_length=64)


class SessionResponse(BaseModel):
    id: UUID
    room_id: str
    status: str
    started_at: datetime
    ended_at: Optional[datetime] = None
    host_user_id: Optional[UUID] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)

    @classmethod
    def from_model(cls, livestream_session) -> "SessionResponse":
        return cls(
            id=livestream_session.id,
            room_id=livestream_session.room_id,
            status=livestream_session.status.value
            if hasattr(livestream_session.status, "value")
            else str(livestream_session.status),
            started_at=livestream_session.started_at,
            ended_at=livestream_session.ended_at,
            host_user_id=livestream_session.host_user_id,
            metadata=livestream_session.metadata_json or {},
        )
