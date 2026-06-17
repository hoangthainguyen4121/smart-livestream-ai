from fastapi import APIRouter

from app.services.interaction_events import interaction_event_service


router = APIRouter(tags=["interaction-events"])


@router.get("/interaction-events/recent")
def list_recent_interaction_events() -> dict[str, list[dict[str, str]]]:
    return {"events": interaction_event_service.recent_events()}
