from __future__ import annotations

from typing import Optional

from fastapi import Header, HTTPException

from app.settings import get_settings


def require_ml_retrain_worker_api_key(
    x_ml_retrain_worker_key: Optional[str] = Header(default=None, alias="X-ML-Retrain-Worker-Key"),
) -> None:
    configured_key = get_settings().ml_retrain_worker_api_key
    if not configured_key:
        raise HTTPException(
            status_code=503,
            detail={"code": "ml_retrain_worker_disabled", "message": "ML retrain worker API is not configured."},
        )
    if not x_ml_retrain_worker_key or x_ml_retrain_worker_key != configured_key:
        raise HTTPException(
            status_code=401,
            detail={"code": "ml_retrain_worker_unauthorized", "message": "Invalid worker API key."},
        )
