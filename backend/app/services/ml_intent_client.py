from __future__ import annotations

import logging
import os
from typing import Any

import httpx

logger = logging.getLogger(__name__)

DEFAULT_ML_INTENT_API_URL = "http://127.0.0.1:8010"
DEFAULT_TIMEOUT_SECONDS = 2.0


def get_ml_intent_api_url() -> str:
    return os.getenv("ML_INTENT_API_URL", DEFAULT_ML_INTENT_API_URL).rstrip("/")


def get_ml_timeout_seconds() -> float:
    raw = os.getenv("ML_INTENT_TIMEOUT_SECONDS", str(DEFAULT_TIMEOUT_SECONDS)).strip()
    try:
        return max(0.5, float(raw))
    except ValueError:
        return DEFAULT_TIMEOUT_SECONDS


async def fetch_ml_health() -> tuple[str, str | None]:
    url = f"{get_ml_intent_api_url()}/health"
    try:
        async with httpx.AsyncClient(timeout=get_ml_timeout_seconds()) as client:
            response = await client.get(url)
            response.raise_for_status()
            payload = response.json()
            detail = payload.get("status") or payload.get("model") or "ok"
            return "ok", str(detail)
    except Exception as error:
        logger.warning("ML intent health check failed: %s", error)
        return "unavailable", str(error)


async def predict_ml_intent(text: str) -> dict[str, Any] | None:
    url = f"{get_ml_intent_api_url()}/predict-intent"
    try:
        async with httpx.AsyncClient(timeout=get_ml_timeout_seconds()) as client:
            response = await client.post(url, json={"text": text})
            response.raise_for_status()
            return response.json()
    except Exception as error:
        logger.warning("ML intent prediction failed: %s", error)
        return None
