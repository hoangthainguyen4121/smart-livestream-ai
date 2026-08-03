from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, HTTPException, status

from app.db.engine import get_session_factory, is_persistence_enabled
from app.schemas.sessions import SessionResponse, StartSessionRequest
from app.services.session_service import (
    SessionAlreadyEndedError,
    SessionNotFoundError,
    SessionService,
)
from app.settings import ChatPersistenceMode, DURABLE_CHAT_DISABLED_CODE, get_settings


router = APIRouter(prefix="/sessions", tags=["sessions"])


def _require_short_retention() -> None:
    settings = get_settings()
    if settings.chat_persistence_mode != ChatPersistenceMode.SHORT_RETENTION:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={
                "code": DURABLE_CHAT_DISABLED_CODE,
                "message": (
                    "Durable livestream sessions are disabled. "
                    "Set CHAT_PERSISTENCE_MODE=short_retention to enable."
                ),
                "chat_persistence_mode": settings.chat_persistence_mode.value,
            },
        )
    if not is_persistence_enabled():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={
                "code": "database_not_configured",
                "message": "DATABASE_URL is required for short_retention mode.",
            },
        )


@router.post("/start", response_model=SessionResponse)
def start_session(request: StartSessionRequest) -> SessionResponse:
    _require_short_retention()
    with get_session_factory() as db_session:
        service = SessionService(db_session)
        livestream_session = service.start_session(request.room_id.strip())
        return SessionResponse.from_model(livestream_session)


@router.post("/{session_id}/end", response_model=SessionResponse)
def end_session(session_id: UUID) -> SessionResponse:
    _require_short_retention()
    with get_session_factory() as db_session:
        service = SessionService(db_session)
        try:
            livestream_session = service.end_session(session_id)
        except SessionNotFoundError as error:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(error)) from error
        except SessionAlreadyEndedError as error:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(error)) from error
        return SessionResponse.from_model(livestream_session)


@router.get("/{room_id}/current", response_model=SessionResponse)
def get_current_session(room_id: str) -> SessionResponse:
    _require_short_retention()
    with get_session_factory() as db_session:
        service = SessionService(db_session)
        livestream_session = service.get_active_session(room_id.strip())
        if livestream_session is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"No active session for room '{room_id}'.",
            )
        return SessionResponse.from_model(livestream_session)
