from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException

from app.schemas.desktop_events import (
    DesktopEventItem,
    DesktopEventsRequest,
    DesktopEventsResponse,
)
from app.services.interaction_events import interaction_event_service


logger = logging.getLogger(__name__)

router = APIRouter(tags=["desktop"])

ALLOWED_IDENTITY_EVENT_TYPES = {
    "identity_appeared",
    "identity_disappeared",
    "unknown_face_detected",
    "multiple_faces_detected",
}

ALLOWED_GESTURES = {
    "Raise Hand",
    "Thumbs Up",
}


@router.post("/desktop/events", response_model=DesktopEventsResponse)
def ingest_desktop_events(request: DesktopEventsRequest) -> DesktopEventsResponse:
    if not request.events:
        raise HTTPException(status_code=400, detail="At least one event is required.")

    stored = 0
    for item in request.events:
        event = store_desktop_event(item)
        if event is not None:
            stored += 1

    logger.info(
        "Desktop client %s submitted %s event(s); stored=%s",
        request.client_id,
        len(request.events),
        stored,
    )
    return DesktopEventsResponse(accepted=len(request.events), stored=stored)


def store_desktop_event(item: DesktopEventItem):
    gesture_name = resolve_gesture_name(item)
    if gesture_name is not None:
        if gesture_name not in ALLOWED_GESTURES:
            return None
        return interaction_event_service.append_gesture_event(
            username=item.username,
            gesture=gesture_name,
        )

    if item.type not in ALLOWED_IDENTITY_EVENT_TYPES:
        return None

    return interaction_event_service.append_event(
        event_type=item.type,
        username=item.username,
    )


def resolve_gesture_name(item: DesktopEventItem) -> str | None:
    if item.gesture.strip():
        if item.gesture.strip() == "Wave":
            return None
        return item.gesture.strip()

    if item.type == "raise_hand":
        return "Raise Hand"
    if item.type == "thumbs_up":
        return "Thumbs Up"
    if item.type == "wave":
        return None

    return None
