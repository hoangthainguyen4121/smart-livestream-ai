from __future__ import annotations

from typing import Any, Dict, List, Optional, Tuple
from uuid import UUID

from app.db.engine import get_session_factory, is_persistence_enabled
from app.db.models import SessionStatus
from app.schemas.live_sessions import ModerationViolationRequest
from app.services.host_lease import (
    HOST_LEASE_EXPIRED_REASON,
    build_initial_host_metadata,
    generate_host_resume_token,
    is_host_lease_expired,
    touch_host_presence,
    verify_host_token,
)
from app.services.live_room_types import (
    generate_room_id,
    normalize_room_name,
    validate_room_type,
)
from app.services.memory_live_sessions import (
    VISUAL_MODERATION_ENDED_REASON,
    get_memory_live_session_store,
)
from app.services.session_service import (
    SessionAlreadyEndedError,
    SessionNotFoundError,
    SessionService,
)


class LiveSessionModerationError(Exception):
    def __init__(self, code: str, message: str) -> None:
        self.code = code
        self.message = message
        super().__init__(message)


class LiveRoomValidationError(Exception):
    def __init__(self, code: str, message: str) -> None:
        self.code = code
        self.message = message
        super().__init__(message)


class HostLeaseError(Exception):
    def __init__(self, code: str, message: str) -> None:
        self.code = code
        self.message = message
        super().__init__(message)


def start_live_session(room_id: str, *, metadata: Optional[Dict[str, Any]] = None) -> Any:
    normalized = room_id.strip()
    if is_persistence_enabled():
        with get_session_factory() as db_session:
            return SessionService(db_session).start_session(normalized, metadata=metadata)
    return get_memory_live_session_store().start_session(normalized, metadata=metadata)


def create_live_room(name: str, room_type: str) -> Tuple[Any, str]:
    cleaned_name = normalize_room_name(name)
    if not cleaned_name:
        raise LiveRoomValidationError("empty_name", "Room name is required.")
    try:
        normalized_type = validate_room_type(room_type)
    except ValueError as error:
        raise LiveRoomValidationError("invalid_room_type", str(error)) from error

    room_id = generate_room_id(cleaned_name)
    host_token = generate_host_resume_token()
    metadata = build_initial_host_metadata(
        {
            "name": cleaned_name,
            "room_type": normalized_type,
        },
        host_token,
    )
    session = start_live_session(room_id, metadata=metadata)
    return session, host_token


def _update_metadata(session_id: UUID, metadata: Dict[str, Any]) -> Any:
    if is_persistence_enabled():
        with get_session_factory() as db_session:
            try:
                return SessionService(db_session).update_metadata(session_id, metadata)
            except SessionNotFoundError as error:
                raise LiveSessionModerationError(
                    "session_not_found",
                    f"Session '{session_id}' was not found.",
                ) from error
    store = get_memory_live_session_store()
    try:
        return store.update_metadata(session_id, metadata)
    except KeyError as error:
        raise LiveSessionModerationError(
            "session_not_found",
            f"Session '{session_id}' was not found.",
        ) from error


def reap_expired_host_leases() -> List[Any]:
    """End active sessions whose host presence lease exceeded the grace window."""
    expired: List[Any] = []
    for session in list(list_active_live_sessions(reap=False)):
        metadata = getattr(session, "metadata_json", None) or {}
        if not is_host_lease_expired(metadata):
            continue
        try:
            ended, already_ended = end_live_session(
                session.id,
                ended_reason=HOST_LEASE_EXPIRED_REASON,
            )
        except LiveSessionModerationError:
            continue
        if not already_ended:
            expired.append(ended)
    return expired


def list_active_live_sessions(*, reap: bool = True) -> List[Any]:
    if reap:
        reap_expired_host_leases()
    if is_persistence_enabled():
        with get_session_factory() as db_session:
            return SessionService(db_session).list_active_sessions()
    return get_memory_live_session_store().list_active_sessions()


def get_active_live_session(room_id: str, *, reap: bool = True) -> Optional[Any]:
    if reap:
        reap_expired_host_leases()
    normalized = room_id.strip()
    if is_persistence_enabled():
        with get_session_factory() as db_session:
            return SessionService(db_session).get_active_session(normalized)
    return get_memory_live_session_store().get_active_session(normalized)


def get_live_session(session_id: UUID) -> Optional[Any]:
    if is_persistence_enabled():
        with get_session_factory() as db_session:
            return SessionService(db_session).get_session(session_id)
    return get_memory_live_session_store().get_session(session_id)


def end_live_session(
    session_id: UUID,
    *,
    ended_reason: str = "host_stopped",
) -> Tuple[Any, bool]:
    """End an active live session. Returns (session, already_ended)."""
    if is_persistence_enabled():
        with get_session_factory() as db_session:
            service = SessionService(db_session)
            existing = service.get_session(session_id)
            if existing is None:
                raise LiveSessionModerationError(
                    "session_not_found",
                    f"Session '{session_id}' was not found.",
                )
            if existing.status == SessionStatus.ENDED:
                return existing, True
            try:
                ended = service.end_session(
                    session_id,
                    ended_reason=ended_reason,
                    idempotent=True,
                )
            except SessionNotFoundError as error:
                raise LiveSessionModerationError(
                    "session_not_found",
                    f"Session '{session_id}' was not found.",
                ) from error
            except SessionAlreadyEndedError:
                ended = service.get_session(session_id)
                return ended, True
            return ended, False

    store = get_memory_live_session_store()
    existing = store.get_session(session_id)
    if existing is None:
        raise LiveSessionModerationError(
            "session_not_found",
            f"Session '{session_id}' was not found.",
        )
    if existing.status == SessionStatus.ENDED:
        return existing, True
    ended = store.end_session(session_id, ended_reason=ended_reason)
    return ended, False


def host_heartbeat(
    session_id: UUID,
    *,
    host_token: str,
    media_live: Optional[bool] = None,
) -> Any:
    reap_expired_host_leases()
    session = get_live_session(session_id)
    if session is None or session.status != SessionStatus.ACTIVE:
        raise HostLeaseError("session_not_found", f"Session '{session_id}' was not found or is not active.")

    metadata = dict(getattr(session, "metadata_json", None) or {})
    if not verify_host_token(metadata, host_token):
        raise HostLeaseError("invalid_host_token", "Host resume token is invalid.")

    if is_host_lease_expired(metadata):
        end_live_session(session_id, ended_reason=HOST_LEASE_EXPIRED_REASON)
        raise HostLeaseError("host_lease_expired", "Host lease expired; room was reaped.")

    next_metadata = touch_host_presence(metadata, media_live=media_live)
    return _update_metadata(session_id, next_metadata)


def reclaim_host(room_id: str, *, host_token: str) -> Any:
    reap_expired_host_leases()
    session = get_active_live_session(room_id, reap=False)
    if session is None:
        raise HostLeaseError(
            "session_not_found",
            f"No active live session for room '{room_id}'.",
        )

    metadata = dict(getattr(session, "metadata_json", None) or {})
    if not verify_host_token(metadata, host_token):
        raise HostLeaseError("invalid_host_token", "Host resume token is invalid.")

    if is_host_lease_expired(metadata):
        end_live_session(session.id, ended_reason=HOST_LEASE_EXPIRED_REASON)
        raise HostLeaseError("host_lease_expired", "Host lease expired; room was reaped.")

    next_metadata = touch_host_presence(metadata, media_live=bool(metadata.get("media_live")))
    return _update_metadata(session.id, next_metadata)


def apply_moderation_violation(
    session_id: UUID,
    payload: ModerationViolationRequest,
) -> Tuple[Any, bool]:
    """End an active live session for an allowlisted visual moderation code.

    Returns (session, already_ended).
    """
    event: Dict[str, Any] = {
        "code": payload.code,
        "label": payload.label,
        "confidence": payload.confidence,
        "evidence_count": payload.evidence_count,
        "window_ms": payload.window_ms,
        "detected_at": payload.detected_at.isoformat(),
    }

    if is_persistence_enabled():
        with get_session_factory() as db_session:
            service = SessionService(db_session)
            existing = service.get_session(session_id)
            if existing is None:
                raise LiveSessionModerationError(
                    "session_not_found",
                    f"Session '{session_id}' was not found.",
                )
            already_ended = existing.status == SessionStatus.ENDED
            if already_ended:
                return existing, True

            ended = service.end_session(
                session_id,
                ended_reason=VISUAL_MODERATION_ENDED_REASON,
                moderation_event=event,
                idempotent=True,
            )
            return ended, False

    store = get_memory_live_session_store()
    existing = store.get_session(session_id)
    if existing is None:
        raise LiveSessionModerationError(
            "session_not_found",
            f"Session '{session_id}' was not found.",
        )
    already_ended = existing.status == SessionStatus.ENDED
    if already_ended:
        return existing, True

    ended = store.end_session(
        session_id,
        ended_reason=VISUAL_MODERATION_ENDED_REASON,
        moderation_event=event,
    )
    return ended, False
