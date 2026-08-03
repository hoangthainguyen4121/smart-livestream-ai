from fastapi import APIRouter

from app.settings import get_settings


router = APIRouter(tags=["health"])


@router.get("/health")
def health_check() -> dict[str, object]:
    settings = get_settings()
    return {
        "status": "ok",
        "chat_persistence_mode": settings.chat_persistence_mode.value,
        "durable_chat_history": settings.durable_chat_history,
        "chat_retention_hours": settings.chat_retention_hours,
        "chat_retention_deletion_job": "not_implemented",
    }
