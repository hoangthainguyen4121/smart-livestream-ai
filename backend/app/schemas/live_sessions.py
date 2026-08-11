from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, Literal, Optional
from uuid import UUID

from pydantic import BaseModel, Field, field_validator

from app.services.host_lease import public_host_fields, strip_private_metadata
from app.services.live_room_types import (
    DEFAULT_ROOM_TYPE,
    MAX_ROOM_NAME_LENGTH,
    get_allowed_room_types,
    normalize_room_name,
)


ALLOWED_MODERATION_CODES = frozenset({"sharp_object_detected"})


class StartLiveSessionRequest(BaseModel):
    room_id: str = Field(min_length=1, max_length=64)


class CreateLiveRoomRequest(BaseModel):
    name: str = Field(min_length=1, max_length=MAX_ROOM_NAME_LENGTH)
    room_type: str = Field(default=DEFAULT_ROOM_TYPE, min_length=1, max_length=32)

    @field_validator("name")
    @classmethod
    def validate_name(cls, value: str) -> str:
        cleaned = normalize_room_name(value)
        if not cleaned:
            raise ValueError("Room name is required.")
        if len(cleaned) > MAX_ROOM_NAME_LENGTH:
            raise ValueError(f"Room name must be at most {MAX_ROOM_NAME_LENGTH} characters.")
        return cleaned

    @field_validator("room_type")
    @classmethod
    def validate_room_type_field(cls, value: str) -> str:
        normalized = value.strip().lower()
        allowed = get_allowed_room_types()
        if normalized not in allowed:
            raise ValueError(
                f"Invalid room_type. Allowed: {', '.join(sorted(allowed))}."
            )
        return normalized


class HostHeartbeatRequest(BaseModel):
    host_token: str = Field(min_length=16, max_length=256)
    media_live: Optional[bool] = None


class ReclaimHostRequest(BaseModel):
    host_token: str = Field(min_length=16, max_length=256)


class ModerationViolationRequest(BaseModel):
    code: Literal["sharp_object_detected"]
    label: Literal["knife", "scissors"]
    confidence: float = Field(ge=0.0, le=1.0)
    evidence_count: int = Field(ge=1, le=100)
    window_ms: int = Field(ge=1, le=60_000)
    detected_at: datetime


class LiveSessionResponse(BaseModel):
    id: UUID
    room_id: str
    status: str
    started_at: datetime
    ended_at: Optional[datetime] = None
    ended_reason: Optional[str] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)
    already_ended: bool = False
    name: Optional[str] = None
    room_type: Optional[str] = None
    host_present: bool = False
    host_recoverable: bool = False
    host_lease_expires_at: Optional[str] = None
    media_live: bool = False
    is_host: bool = False
    grace_remaining_seconds: Optional[int] = None

    @classmethod
    def from_session(
        cls,
        livestream_session: Any,
        *,
        already_ended: bool = False,
        is_host: bool = False,
    ) -> "LiveSessionResponse":
        metadata = getattr(livestream_session, "metadata_json", None) or {}
        status = livestream_session.status
        status_value = status.value if hasattr(status, "value") else str(status)
        host_fields = public_host_fields(metadata)
        expires_raw = host_fields.get("host_lease_expires_at")
        grace_remaining: Optional[int] = None
        if isinstance(expires_raw, str) and expires_raw:
            try:
                from datetime import datetime, timezone

                expires = datetime.fromisoformat(expires_raw.replace("Z", "+00:00"))
                if expires.tzinfo is None:
                    expires = expires.replace(tzinfo=timezone.utc)
                grace_remaining = max(
                    0,
                    int((expires - datetime.now(timezone.utc)).total_seconds()),
                )
            except ValueError:
                grace_remaining = None
        return cls(
            id=livestream_session.id,
            room_id=livestream_session.room_id,
            status=status_value,
            started_at=livestream_session.started_at,
            ended_at=livestream_session.ended_at,
            ended_reason=metadata.get("ended_reason"),
            metadata=strip_private_metadata(metadata),
            already_ended=already_ended,
            name=metadata.get("name") or livestream_session.room_id,
            room_type=metadata.get("room_type") or DEFAULT_ROOM_TYPE,
            host_present=bool(host_fields["host_present"]),
            host_recoverable=bool(host_fields["host_recoverable"]),
            host_lease_expires_at=host_fields["host_lease_expires_at"],
            media_live=bool(host_fields["media_live"]),
            is_host=is_host,
            grace_remaining_seconds=grace_remaining,
        )


class LiveRoomResponse(BaseModel):
    id: UUID
    room_id: str
    name: str
    room_type: str
    status: str
    started_at: datetime
    ended_at: Optional[datetime] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)
    host_present: bool = False
    host_recoverable: bool = False
    host_lease_expires_at: Optional[str] = None
    media_live: bool = False

    @classmethod
    def from_session(cls, livestream_session: Any) -> "LiveRoomResponse":
        metadata = getattr(livestream_session, "metadata_json", None) or {}
        status = livestream_session.status
        status_value = status.value if hasattr(status, "value") else str(status)
        host_fields = public_host_fields(metadata)
        return cls(
            id=livestream_session.id,
            room_id=livestream_session.room_id,
            name=str(metadata.get("name") or livestream_session.room_id),
            room_type=str(metadata.get("room_type") or DEFAULT_ROOM_TYPE),
            status=status_value,
            started_at=livestream_session.started_at,
            ended_at=livestream_session.ended_at,
            metadata=strip_private_metadata(metadata),
            host_present=bool(host_fields["host_present"]),
            host_recoverable=bool(host_fields["host_recoverable"]),
            host_lease_expires_at=host_fields["host_lease_expires_at"],
            media_live=bool(host_fields["media_live"]),
        )


class CreateLiveRoomResponse(LiveRoomResponse):
    """Create response includes the resumable host token once (never listed again)."""

    host_resume_token: str
