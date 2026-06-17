from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import face_profiles, health, realtime


app = FastAPI(title="Smart Livestream AI Backend", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router, prefix="/api")
app.include_router(face_profiles.router, prefix="/api")
app.include_router(realtime.router)
