from __future__ import annotations

import logging
from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, Query, status
from pydantic import ValidationError
from app.db.engine import get_session_factory
from app.db.models import User
from app.repositories.commerce_repository import CommerceRepository
from app.services.auth_service import get_optional_user
from app.services.host_lease import verify_host_token
from app.services.live_room_types import room_type_requires_commerce

from app.schemas.live_sessions import (
    CreateLiveRoomRequest,
    CreateLiveRoomResponse,
    HostHeartbeatRequest,
    LiveRoomResponse,
    LiveSessionResponse,
    ModerationViolationRequest,
    ReclaimHostRequest,
    StartLiveSessionRequest,
)
from app.services.live_session_moderation import (
    HostLeaseError,
    LiveRoomValidationError,
    LiveSessionModerationError,
    apply_moderation_violation,
    create_live_room,
    end_live_session,
    get_active_live_session,
    get_live_session,
    host_heartbeat,
    list_active_live_sessions,
    reclaim_host,
    start_live_session,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/live-sessions", tags=["live-sessions"])


def _authorize_session_control(
    session_id: UUID,
    user: Optional[User],
    host_token: Optional[str],
) -> object:
    session = get_live_session(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Session was not found.")
    if user is not None and getattr(session, "seller_user_id", None) == user.id:
        return session
    metadata = dict(getattr(session, "metadata_json", None) or {})
    if host_token and verify_host_token(metadata, host_token):
        return session
    if user is None and not host_token:
        raise HTTPException(status_code=401, detail="Host authorization required.")
    raise HTTPException(status_code=403, detail="Caller cannot control this session.")


@router.get("", response_model=List[LiveRoomResponse], include_in_schema=True)
@router.get("/", response_model=List[LiveRoomResponse], include_in_schema=False)
def api_list_live_sessions(
    status_filter: Optional[str] = Query(default="active", alias="status"),
) -> List[LiveRoomResponse]:
    normalized = (status_filter or "active").strip().lower()
    if normalized != "active":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only status=active is supported in this MVP.",
        )
    sessions = list_active_live_sessions()
    return [LiveRoomResponse.from_session(session) for session in sessions]


@router.post(
    "",
    response_model=CreateLiveRoomResponse,
    status_code=status.HTTP_201_CREATED,
    include_in_schema=True,
)
@router.post(
    "/",
    response_model=CreateLiveRoomResponse,
    status_code=status.HTTP_201_CREATED,
    include_in_schema=False,
)
def api_create_live_room(
    request: CreateLiveRoomRequest,
    user: Optional[User] = Depends(get_optional_user),
) -> CreateLiveRoomResponse:
    try:
        shop_id = None
        if room_type_requires_commerce(request.room_type):
            if user is None:
                raise HTTPException(
                    status_code=401,
                    detail="Sign in before creating a commerce room.",
                )
            with get_session_factory() as db_session:
                repo = CommerceRepository(db_session)
                shop = repo.shop_for_owner(user.id)
                if shop is None:
                    raise HTTPException(
                        status_code=409,
                        detail="Create a shop before a commerce room.",
                    )
                if not request.product_ids:
                    raise HTTPException(
                        status_code=422,
                        detail="Select at least one product for a commerce room.",
                    )
                for product_id in set(request.product_ids):
                    product = repo.product(product_id, include_inactive=True)
                    if (
                        product is None
                        or product.shop_id != shop.id
                        or not product.is_active
                    ):
                        raise HTTPException(
                            status_code=409,
                            detail="All selected products must be active and belong to your shop.",
                        )
                shop_id = shop.id
        session, host_token = create_live_room(
            request.name,
            request.room_type,
            seller_user_id=user.id if user else None,
            shop_id=shop_id,
        )
    except LiveRoomValidationError as error:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": error.code, "message": error.message},
        ) from error
    except ValidationError as error:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=error.errors(),
        ) from error
    base = LiveRoomResponse.from_session(session)
    return CreateLiveRoomResponse(**base.model_dump(), host_resume_token=host_token)


@router.post("/start", response_model=LiveSessionResponse)
def api_start_live_session(
    request: StartLiveSessionRequest,
    user: Optional[User] = Depends(get_optional_user),
) -> LiveSessionResponse:
    shop_id = None
    if user is not None:
        with get_session_factory() as db_session:
            shop = CommerceRepository(db_session).shop_for_owner(user.id)
            if shop is None:
                raise HTTPException(409, detail="Create a shop before starting a seller room.")
            shop_id = shop.id
    session = start_live_session(
        request.room_id,
        seller_user_id=user.id if user else None,
        shop_id=shop_id,
    )
    return LiveSessionResponse.from_session(session)


@router.get("/by-room/{room_id}/current", response_model=LiveSessionResponse)
def api_get_current_live_session(room_id: str) -> LiveSessionResponse:
    session = get_active_live_session(room_id)
    if session is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No active live session for room '{room_id}'.",
        )
    return LiveSessionResponse.from_session(session)


@router.post("/by-room/{room_id}/reclaim-host", response_model=LiveSessionResponse)
def api_reclaim_host(room_id: str, request: ReclaimHostRequest) -> LiveSessionResponse:
    try:
        session = reclaim_host(room_id, host_token=request.host_token)
    except HostLeaseError as error:
        status_code = (
            status.HTTP_404_NOT_FOUND
            if error.code in {"session_not_found", "host_lease_expired"}
            else status.HTTP_403_FORBIDDEN
        )
        raise HTTPException(
            status_code=status_code,
            detail={"code": error.code, "message": error.message},
        ) from error
    return LiveSessionResponse.from_session(session, is_host=True)


@router.post("/{session_id}/host-heartbeat", response_model=LiveSessionResponse)
def api_host_heartbeat(session_id: UUID, request: HostHeartbeatRequest) -> LiveSessionResponse:
    try:
        session = host_heartbeat(
            session_id,
            host_token=request.host_token,
            media_live=request.media_live,
        )
    except HostLeaseError as error:
        status_code = (
            status.HTTP_404_NOT_FOUND
            if error.code in {"session_not_found", "host_lease_expired"}
            else status.HTTP_403_FORBIDDEN
        )
        raise HTTPException(
            status_code=status_code,
            detail={"code": error.code, "message": error.message},
        ) from error
    return LiveSessionResponse.from_session(session, is_host=True)


@router.post("/{session_id}/end", response_model=LiveSessionResponse)
async def api_end_live_session(
    session_id: UUID,
    user: Optional[User] = Depends(get_optional_user),
    host_token: Optional[str] = Header(default=None, alias="X-Host-Token"),
) -> LiveSessionResponse:
    _authorize_session_control(session_id, user, host_token)
    try:
        session, already_ended = end_live_session(session_id, ended_reason="host_stopped")
    except LiveSessionModerationError as error:
        if error.code == "session_not_found":
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={"code": error.code, "message": error.message},
            ) from error
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": error.code, "message": error.message},
        ) from error

    if not already_ended:
        await _broadcast_session_ended(session)

    return LiveSessionResponse.from_session(session, already_ended=already_ended)


@router.post("/{session_id}/moderation-violations", response_model=LiveSessionResponse)
async def api_report_moderation_violation(
    session_id: UUID,
    request: ModerationViolationRequest,
    user: Optional[User] = Depends(get_optional_user),
    host_token: Optional[str] = Header(default=None, alias="X-Host-Token"),
) -> LiveSessionResponse:
    _authorize_session_control(session_id, user, host_token)
    try:
        session, already_ended = apply_moderation_violation(session_id, request)
    except LiveSessionModerationError as error:
        if error.code == "session_not_found":
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={"code": error.code, "message": error.message},
            ) from error
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": error.code, "message": error.message},
        ) from error

    if not already_ended:
        await _broadcast_session_ended(session)

    return LiveSessionResponse.from_session(session, already_ended=already_ended)


async def _broadcast_session_ended(session: object) -> None:
    from app.api.chat import chat_manager
    from app.services.memory_live_sessions import VISUAL_MODERATION_ENDED_REASON

    metadata = getattr(session, "metadata_json", None) or {}
    room_id = getattr(session, "room_id")
    session_id = getattr(session, "id")
    ended_at = getattr(session, "ended_at", None)
    await chat_manager.broadcast_event(
        room_id,
        {
            "type": "live_session_ended",
            "reason": metadata.get("ended_reason") or VISUAL_MODERATION_ENDED_REASON,
            "session_id": str(session_id),
            "room_id": room_id,
            "ended_at": ended_at.isoformat() if ended_at is not None else None,
        },
    )
