import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import (
    chat,
    face_profiles,
    face_registration,
    health,
    inference,
    interaction_events,
    nlp,
    realtime,
    video_feed,
)
from app.services.web_face_registration import face_registration_service


logger = logging.getLogger(__name__)

DEFAULT_CORS_ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:5174",
    "http://127.0.0.1:5174",
    "http://localhost:8080",
    "http://127.0.0.1:8080",
]

# Matches localhost dev and Railway public HTTPS domains (PoC/demo).
CORS_ORIGIN_REGEX = (
    r"https?://(localhost|127\.0\.0\.1)(:\d+)?"
    r"|https://([a-z0-9-]+\.)*(railway\.app|up\.railway\.app)"
)


def get_cors_origins() -> list[str]:
    configured = os.getenv("CORS_ORIGINS", "").strip()
    if not configured:
        return DEFAULT_CORS_ORIGINS

    return [origin.strip() for origin in configured.split(",") if origin.strip()]


@asynccontextmanager
async def lifespan(app: FastAPI):
    del app
    if os.getenv("SKIP_FACE_RECOGNIZER_WARMUP", "").lower() in {"1", "true", "yes"}:
        logger.info("Skipping face recognizer warmup (SKIP_FACE_RECOGNIZER_WARMUP).")
    else:
        logger.info("Warming up face registration recognizer...")
        try:
            await run_face_registration_warmup()
            logger.info("Face registration recognizer ready.")
        except Exception as error:
            logger.warning("Face recognizer warmup failed: %s", error)
    yield


async def run_face_registration_warmup() -> None:
    import asyncio

    await asyncio.to_thread(face_registration_service.warmup_recognizer)


app = FastAPI(
    title="Smart Livestream AI Backend",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=get_cors_origins(),
    allow_origin_regex=CORS_ORIGIN_REGEX,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router, prefix="/api")
app.include_router(face_profiles.router, prefix="/api")
app.include_router(face_registration.router, prefix="/api")
app.include_router(interaction_events.router, prefix="/api")
app.include_router(inference.router, prefix="/api")
app.include_router(nlp.router, prefix="/api")
app.include_router(realtime.router)
app.include_router(video_feed.router)
app.include_router(chat.router)
