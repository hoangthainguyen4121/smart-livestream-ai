from __future__ import annotations

import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional, Tuple

from app.settings import get_settings

HOST_TOKEN_HASH_KEY = "host_token_hash"
HOST_LAST_SEEN_KEY = "host_last_seen_at"
MEDIA_LIVE_KEY = "media_live"
HOST_LEASE_EXPIRED_REASON = "host_lease_expired"

# Treat host as "present" if a heartbeat arrived within this many missed intervals.
DEFAULT_PRESENCE_STALE_SECONDS = 45


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def generate_host_resume_token() -> str:
    return secrets.token_urlsafe(32)


def hash_host_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def tokens_match(token: str, token_hash: Optional[str]) -> bool:
    if not token or not token_hash or not isinstance(token_hash, str):
        return False
    return secrets.compare_digest(hash_host_token(token), token_hash)


def parse_iso_datetime(value: Any) -> Optional[datetime]:
    if not isinstance(value, str) or not value.strip():
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def grace_seconds() -> int:
    return get_settings().host_lease_grace_seconds


def presence_stale_seconds() -> int:
    return min(DEFAULT_PRESENCE_STALE_SECONDS, grace_seconds())


def build_initial_host_metadata(base: Dict[str, Any], token: str) -> Dict[str, Any]:
    now = utc_now().isoformat()
    metadata = dict(base)
    metadata[HOST_TOKEN_HASH_KEY] = hash_host_token(token)
    metadata[HOST_LAST_SEEN_KEY] = now
    metadata[MEDIA_LIVE_KEY] = False
    return metadata


def host_last_seen_at(metadata: Dict[str, Any]) -> Optional[datetime]:
    return parse_iso_datetime(metadata.get(HOST_LAST_SEEN_KEY))


def is_host_lease_expired(metadata: Dict[str, Any], *, now: Optional[datetime] = None) -> bool:
    last_seen = host_last_seen_at(metadata)
    if last_seen is None:
        return False
    current = now or utc_now()
    return current - last_seen >= timedelta(seconds=grace_seconds())


def is_host_present(metadata: Dict[str, Any], *, now: Optional[datetime] = None) -> bool:
    last_seen = host_last_seen_at(metadata)
    if last_seen is None:
        return False
    current = now or utc_now()
    return current - last_seen < timedelta(seconds=presence_stale_seconds())


def lease_expires_at(metadata: Dict[str, Any]) -> Optional[datetime]:
    last_seen = host_last_seen_at(metadata)
    if last_seen is None:
        return None
    return last_seen + timedelta(seconds=grace_seconds())


def public_host_fields(metadata: Dict[str, Any]) -> Dict[str, Any]:
    expires = lease_expires_at(metadata)
    present = is_host_present(metadata)
    return {
        "host_present": present,
        "host_recoverable": not present and not is_host_lease_expired(metadata),
        "host_lease_expires_at": expires.isoformat() if expires else None,
        # Only advertise live media while the host lease is fresh.
        "media_live": present and bool(metadata.get(MEDIA_LIVE_KEY)),
    }


def strip_private_metadata(metadata: Dict[str, Any]) -> Dict[str, Any]:
    cleaned = dict(metadata)
    cleaned.pop(HOST_TOKEN_HASH_KEY, None)
    return cleaned


def touch_host_presence(
    metadata: Dict[str, Any],
    *,
    media_live: Optional[bool] = None,
) -> Dict[str, Any]:
    next_metadata = dict(metadata)
    next_metadata[HOST_LAST_SEEN_KEY] = utc_now().isoformat()
    if media_live is not None:
        next_metadata[MEDIA_LIVE_KEY] = bool(media_live)
    return next_metadata


def verify_host_token(metadata: Dict[str, Any], token: str) -> bool:
    return tokens_match(token, metadata.get(HOST_TOKEN_HASH_KEY) if isinstance(metadata, dict) else None)
