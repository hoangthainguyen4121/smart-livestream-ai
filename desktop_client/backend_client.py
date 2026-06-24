from __future__ import annotations

import logging
from typing import Any

import httpx


logger = logging.getLogger(__name__)


class BackendClient:
    def __init__(self, base_url: str, client_id: str, timeout_sec: float = 5.0) -> None:
        self.base_url = base_url.rstrip("/")
        self.client_id = client_id
        self.timeout_sec = timeout_sec

    def health_check(self) -> bool:
        try:
            with httpx.Client(timeout=self.timeout_sec) as client:
                response = client.get(f"{self.base_url}/api/health")
                return response.status_code == 200
        except httpx.HTTPError:
            logger.warning("Backend health check failed: %s", self.base_url)
            return False

    def post_events(self, events: list[dict[str, Any]]) -> bool:
        if not events:
            return True

        payload = {
            "client_id": self.client_id,
            "events": events,
        }
        try:
            with httpx.Client(timeout=self.timeout_sec) as client:
                response = client.post(
                    f"{self.base_url}/api/desktop/events",
                    json=payload,
                )
                response.raise_for_status()
                body = response.json()
                logger.debug(
                    "Posted desktop events accepted=%s stored=%s",
                    body.get("accepted"),
                    body.get("stored"),
                )
                return True
        except httpx.HTTPError as error:
            logger.warning("Failed to post desktop events: %s", error)
            return False

    def reload_face_profiles_hint(self) -> None:
        try:
            with httpx.Client(timeout=self.timeout_sec) as client:
                client.get(f"{self.base_url}/api/face-profiles")
        except httpx.HTTPError:
            logger.debug("Unable to reach face profiles endpoint during startup check.")
