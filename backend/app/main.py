import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import (
    chat,
    desktop_events,
    face_profiles,
    face_registration,
    health,
    inference,
    interaction_events,
    nlp,
    realtime,
    video_feed,
)


DEFAULT_CORS_ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:5174",
    "http://127.0.0.1:5174",
]


def get_cors_origins() -> list[str]:
    configured = os.getenv("CORS_ORIGINS", "").strip()
    if not configured:
        return DEFAULT_CORS_ORIGINS

    return [origin.strip() for origin in configured.split(",") if origin.strip()]


app = FastAPI(title="Smart Livestream AI Backend", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=get_cors_origins(),
    allow_origin_regex=r"http://(localhost|127\.0\.0\.1):\d+",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router, prefix="/api")
app.include_router(face_profiles.router, prefix="/api")
app.include_router(face_registration.router, prefix="/api")
app.include_router(interaction_events.router, prefix="/api")
app.include_router(desktop_events.router, prefix="/api")
app.include_router(inference.router, prefix="/api")
app.include_router(nlp.router, prefix="/api")
app.include_router(realtime.router)
app.include_router(video_feed.router)
app.include_router(chat.router)
