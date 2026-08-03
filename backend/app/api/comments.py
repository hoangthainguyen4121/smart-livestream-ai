from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional, Tuple

from fastapi import APIRouter, HTTPException, Query, status

from app.db.engine import get_session_factory, is_persistence_enabled
from app.repositories.comment_repository import (
    DEFAULT_COMMENT_HISTORY_LIMIT,
    MAX_COMMENT_HISTORY_LIMIT,
    CommentRepository,
)
from app.schemas.comments import CommentHistoryResponse, CommentResponse
from app.settings import ChatPersistenceMode, DURABLE_CHAT_DISABLED_CODE, get_settings


router = APIRouter(prefix="/comments", tags=["comments"])


def _parse_before_cursor(raw: Optional[str]) -> Tuple[Optional[datetime], Optional[str]]:
    if raw is None or not raw.strip():
        return None, None

    parts = raw.split("|", 1)
    if len(parts) != 2 or not parts[0].strip() or not parts[1].strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid before cursor. Expected '<iso8601>|<comment_id>'.",
        )

    try:
        created_at = datetime.fromisoformat(parts[0].replace("Z", "+00:00"))
    except ValueError as error:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid before cursor timestamp.",
        ) from error

    return created_at, parts[1].strip()


def _format_before_cursor(created_at: datetime, comment_id: str) -> str:
    utc_value = created_at.astimezone(timezone.utc)
    timestamp = utc_value.strftime("%Y-%m-%dT%H:%M:%S.%fZ")
    return f"{timestamp}|{comment_id}"


def _require_short_retention_history() -> None:
    settings = get_settings()
    if settings.chat_persistence_mode != ChatPersistenceMode.SHORT_RETENTION:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={
                "code": DURABLE_CHAT_DISABLED_CODE,
                "message": (
                    "Durable comment history is disabled. "
                    "Set CHAT_PERSISTENCE_MODE=short_retention to enable."
                ),
                "chat_persistence_mode": settings.chat_persistence_mode.value,
                "durable_chat_history": False,
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


@router.get("", response_model=CommentHistoryResponse)
def list_comments(
    room_id: str = Query(min_length=1, max_length=64),
    limit: int = Query(default=DEFAULT_COMMENT_HISTORY_LIMIT, ge=1, le=MAX_COMMENT_HISTORY_LIMIT),
    before: Optional[str] = Query(default=None),
) -> CommentHistoryResponse:
    _require_short_retention_history()

    before_created_at, before_id = _parse_before_cursor(before)

    with get_session_factory() as db_session:
        repository = CommentRepository(db_session)
        rows = repository.list_comments(
            room_id.strip(),
            limit=limit,
            before_created_at=before_created_at,
            before_id=before_id,
        )

    comments = [CommentResponse.from_model(row) for row in rows]
    next_before = None
    if comments:
        oldest = comments[0]
        next_before = _format_before_cursor(oldest.created_at, oldest.id)

    return CommentHistoryResponse(
        room_id=room_id.strip(),
        comments=comments,
        next_before=next_before,
    )
