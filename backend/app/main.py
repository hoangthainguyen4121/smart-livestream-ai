import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import chat, health, nlp, product_vision


def _load_backend_env_file() -> None:
    env_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".env"))
    if not os.path.exists(env_path):
        return

    with open(env_path, encoding="utf-8") as handle:
        for raw_line in handle:
            line = raw_line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            key = key.strip()
            value = value.strip().strip('"').strip("'")
            if key and key not in os.environ:
                os.environ[key] = value


_load_backend_env_file()


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


app = FastAPI(
    title="Smart Livestream AI Backend",
    version="0.1.0",
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
app.include_router(nlp.router, prefix="/api")
app.include_router(product_vision.router, prefix="/api")
app.include_router(chat.router)
