from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import (
    chat,
    face_profiles,
    face_registration,
    health,
    interaction_events,
    realtime,
    video_feed,
)


app = FastAPI(title="Smart Livestream AI Backend", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5174",
    ],
    # Vite may pick another port when 5173 is busy (e.g. 5174, 5175).
    allow_origin_regex=r"http://(localhost|127\.0\.0\.1):\d+",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router, prefix="/api")
app.include_router(face_profiles.router, prefix="/api")
app.include_router(face_registration.router, prefix="/api")
app.include_router(interaction_events.router, prefix="/api")
app.include_router(realtime.router)
app.include_router(video_feed.router)
app.include_router(chat.router)
