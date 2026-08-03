from __future__ import annotations

from typing import Optional

from fastapi import Header, HTTPException, status

from app.settings import get_settings

ADMIN_API_DISABLED_CODE = "admin_api_disabled"
ADMIN_UNAUTHORIZED_CODE = "admin_unauthorized"


def require_admin_api_key(
    x_admin_api_key: Optional[str] = Header(default=None, alias="X-Admin-Api-Key"),
) -> None:
    configured_key = get_settings().admin_api_key
    if not configured_key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={
                "code": ADMIN_API_DISABLED_CODE,
                "message": (
                    "Admin API requires ADMIN_API_KEY. "
                    "This is a config-based local MVP guard, not full RBAC."
                ),
            },
        )
    if not x_admin_api_key or x_admin_api_key != configured_key:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={
                "code": ADMIN_UNAUTHORIZED_CODE,
                "message": "Invalid or missing X-Admin-Api-Key header.",
            },
        )


def resolve_reviewer_label(
    x_admin_reviewer: Optional[str] = Header(default=None, alias="X-Admin-Reviewer"),
) -> Optional[str]:
    if not x_admin_reviewer:
        return None
    normalized = x_admin_reviewer.strip()
    return normalized or None
