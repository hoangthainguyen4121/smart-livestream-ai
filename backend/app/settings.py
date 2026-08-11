from __future__ import annotations

import os
from dataclasses import dataclass
from enum import Enum
from functools import lru_cache
from typing import Optional


DEFAULT_CHAT_PERSISTENCE_MODE = "memory"
DEFAULT_COMMENT_PERSIST_TIMEOUT_SECONDS = 3.0
DEFAULT_CHAT_RETENTION_HOURS = 24
MIN_CHAT_RETENTION_HOURS = 1
MAX_CHAT_RETENTION_HOURS = 168  # 7 days
DURABLE_CHAT_DISABLED_CODE = "durable_chat_history_disabled"
DEFAULT_DATASET_EXPORT_DIR = "dataset_exports"
DEFAULT_MAX_DATASET_EXPORT_RECORDS = 1000
MAX_DATASET_EXPORT_RECORDS = 5000
DATASET_EXPORT_FORMAT_VERSION = "intent-corrections-v1"
DEFAULT_ML_RETRAIN_STALE_CLAIM_MINUTES = 120
DEFAULT_ML_RETRAIN_MAX_CANDIDATE_BATCHES = 50
ML_RETRAIN_CONSUMER = "ml_retrain"
DEFAULT_COMMENT_SPAM_GUARD_ENABLED = True
DEFAULT_COMMENT_RATE_LIMIT_COUNT = 5
DEFAULT_COMMENT_RATE_LIMIT_WINDOW_SECONDS = 10
DEFAULT_COMMENT_DUPLICATE_STREAK_LIMIT = 3
DEFAULT_COMMENT_VIOLATION_WINDOW_SECONDS = 60
DEFAULT_COMMENT_VIOLATIONS_BEFORE_BLOCK = 2
DEFAULT_COMMENT_BLOCK_SECONDS = 120
DEFAULT_COMMENT_SPAM_STATE_MAX_VIEWERS = 5000
DEFAULT_HOST_LEASE_GRACE_SECONDS = 180


class ChatPersistenceMode(str, Enum):
    MEMORY = "memory"
    SHORT_RETENTION = "short_retention"


@dataclass(frozen=True)
class AppSettings:
    chat_persistence_mode: ChatPersistenceMode
    database_url: Optional[str]
    comment_persist_timeout_seconds: float
    chat_retention_hours: int
    admin_api_key: Optional[str]
    ml_retrain_worker_api_key: Optional[str]
    ml_retrain_stale_claim_minutes: int
    ml_retrain_max_candidate_batches: int
    dataset_export_dir: str
    max_dataset_export_records: int
    comment_spam_guard_enabled: bool
    comment_rate_limit_count: int
    comment_rate_limit_window_seconds: int
    comment_duplicate_streak_limit: int
    comment_violation_window_seconds: int
    comment_violations_before_block: int
    comment_block_seconds: int
    comment_spam_state_max_viewers: int
    host_lease_grace_seconds: int

    @property
    def durable_chat_history(self) -> bool:
        return self.chat_persistence_mode == ChatPersistenceMode.SHORT_RETENTION


def _parse_chat_persistence_mode(raw: str) -> ChatPersistenceMode:
    normalized = raw.strip().lower()
    try:
        return ChatPersistenceMode(normalized)
    except ValueError as error:
        allowed = ", ".join(mode.value for mode in ChatPersistenceMode)
        raise ValueError(
            f"Invalid CHAT_PERSISTENCE_MODE={raw!r}. Allowed values: {allowed}."
        ) from error


def _parse_positive_float(raw: str, *, env_name: str) -> float:
    try:
        value = float(raw.strip())
    except ValueError as error:
        raise ValueError(f"{env_name} must be a positive number.") from error
    if value <= 0:
        raise ValueError(f"{env_name} must be greater than 0.")
    return value


def _parse_retention_hours(raw: str) -> int:
    try:
        value = int(raw.strip())
    except ValueError as error:
        raise ValueError("CHAT_RETENTION_HOURS must be an integer.") from error
    if value < MIN_CHAT_RETENTION_HOURS or value > MAX_CHAT_RETENTION_HOURS:
        raise ValueError(
            f"CHAT_RETENTION_HOURS must be between "
            f"{MIN_CHAT_RETENTION_HOURS} and {MAX_CHAT_RETENTION_HOURS}."
        )
    return value


def _parse_positive_int(raw: str, *, env_name: str, minimum: int = 1, maximum: Optional[int] = None) -> int:
    try:
        value = int(raw.strip())
    except ValueError as error:
        raise ValueError(f"{env_name} must be an integer.") from error
    if value < minimum:
        raise ValueError(f"{env_name} must be at least {minimum}.")
    if maximum is not None and value > maximum:
        raise ValueError(f"{env_name} must be at most {maximum}.")
    return value


def _parse_bool(raw: str, *, env_name: str) -> bool:
    normalized = raw.strip().lower()
    if normalized in {"1", "true", "yes", "on"}:
        return True
    if normalized in {"0", "false", "no", "off"}:
        return False
    raise ValueError(f"{env_name} must be a boolean (true/false).")


def load_settings() -> AppSettings:
    mode = _parse_chat_persistence_mode(
        os.getenv("CHAT_PERSISTENCE_MODE", DEFAULT_CHAT_PERSISTENCE_MODE)
    )
    database_url = os.getenv("DATABASE_URL", "").strip() or None
    timeout = _parse_positive_float(
        os.getenv(
            "COMMENT_PERSIST_TIMEOUT_SECONDS",
            str(DEFAULT_COMMENT_PERSIST_TIMEOUT_SECONDS),
        ),
        env_name="COMMENT_PERSIST_TIMEOUT_SECONDS",
    )
    retention_hours = _parse_retention_hours(
        os.getenv("CHAT_RETENTION_HOURS", str(DEFAULT_CHAT_RETENTION_HOURS))
    )
    dataset_export_dir = os.getenv("DATASET_EXPORT_DIR", DEFAULT_DATASET_EXPORT_DIR).strip()
    if not dataset_export_dir:
        dataset_export_dir = DEFAULT_DATASET_EXPORT_DIR
    max_dataset_export_records = _parse_positive_int(
        os.getenv("MAX_DATASET_EXPORT_RECORDS", str(DEFAULT_MAX_DATASET_EXPORT_RECORDS)),
        env_name="MAX_DATASET_EXPORT_RECORDS",
        minimum=1,
        maximum=MAX_DATASET_EXPORT_RECORDS,
    )

    if mode == ChatPersistenceMode.SHORT_RETENTION and database_url is None:
        raise ValueError(
            "CHAT_PERSISTENCE_MODE=short_retention requires DATABASE_URL to be set."
        )

    return AppSettings(
        chat_persistence_mode=mode,
        database_url=database_url,
        comment_persist_timeout_seconds=timeout,
        chat_retention_hours=retention_hours,
        admin_api_key=os.getenv("ADMIN_API_KEY", "").strip() or None,
        ml_retrain_worker_api_key=os.getenv("ML_RETRAIN_WORKER_API_KEY", "").strip() or None,
        ml_retrain_stale_claim_minutes=_parse_positive_int(
            os.getenv("ML_RETRAIN_STALE_CLAIM_MINUTES", str(DEFAULT_ML_RETRAIN_STALE_CLAIM_MINUTES)),
            env_name="ML_RETRAIN_STALE_CLAIM_MINUTES",
            minimum=1,
            maximum=24 * 60,
        ),
        ml_retrain_max_candidate_batches=_parse_positive_int(
            os.getenv("ML_RETRAIN_MAX_CANDIDATE_BATCHES", str(DEFAULT_ML_RETRAIN_MAX_CANDIDATE_BATCHES)),
            env_name="ML_RETRAIN_MAX_CANDIDATE_BATCHES",
            minimum=1,
            maximum=500,
        ),
        dataset_export_dir=dataset_export_dir,
        max_dataset_export_records=max_dataset_export_records,
        comment_spam_guard_enabled=_parse_bool(
            os.getenv("COMMENT_SPAM_GUARD_ENABLED", str(DEFAULT_COMMENT_SPAM_GUARD_ENABLED)),
            env_name="COMMENT_SPAM_GUARD_ENABLED",
        ),
        comment_rate_limit_count=_parse_positive_int(
            os.getenv("COMMENT_RATE_LIMIT_COUNT", str(DEFAULT_COMMENT_RATE_LIMIT_COUNT)),
            env_name="COMMENT_RATE_LIMIT_COUNT",
            minimum=1,
            maximum=100,
        ),
        comment_rate_limit_window_seconds=_parse_positive_int(
            os.getenv(
                "COMMENT_RATE_LIMIT_WINDOW_SECONDS",
                str(DEFAULT_COMMENT_RATE_LIMIT_WINDOW_SECONDS),
            ),
            env_name="COMMENT_RATE_LIMIT_WINDOW_SECONDS",
            minimum=1,
            maximum=3600,
        ),
        comment_duplicate_streak_limit=_parse_positive_int(
            os.getenv(
                "COMMENT_DUPLICATE_STREAK_LIMIT",
                str(DEFAULT_COMMENT_DUPLICATE_STREAK_LIMIT),
            ),
            env_name="COMMENT_DUPLICATE_STREAK_LIMIT",
            minimum=2,
            maximum=20,
        ),
        comment_violation_window_seconds=_parse_positive_int(
            os.getenv(
                "COMMENT_VIOLATION_WINDOW_SECONDS",
                str(DEFAULT_COMMENT_VIOLATION_WINDOW_SECONDS),
            ),
            env_name="COMMENT_VIOLATION_WINDOW_SECONDS",
            minimum=1,
            maximum=3600,
        ),
        comment_violations_before_block=_parse_positive_int(
            os.getenv(
                "COMMENT_VIOLATIONS_BEFORE_BLOCK",
                str(DEFAULT_COMMENT_VIOLATIONS_BEFORE_BLOCK),
            ),
            env_name="COMMENT_VIOLATIONS_BEFORE_BLOCK",
            minimum=1,
            maximum=20,
        ),
        comment_block_seconds=_parse_positive_int(
            os.getenv("COMMENT_BLOCK_SECONDS", str(DEFAULT_COMMENT_BLOCK_SECONDS)),
            env_name="COMMENT_BLOCK_SECONDS",
            minimum=1,
            maximum=24 * 3600,
        ),
        comment_spam_state_max_viewers=_parse_positive_int(
            os.getenv(
                "COMMENT_SPAM_STATE_MAX_VIEWERS",
                str(DEFAULT_COMMENT_SPAM_STATE_MAX_VIEWERS),
            ),
            env_name="COMMENT_SPAM_STATE_MAX_VIEWERS",
            minimum=100,
            maximum=100_000,
        ),
        host_lease_grace_seconds=_parse_positive_int(
            os.getenv(
                "HOST_LEASE_GRACE_SECONDS",
                str(DEFAULT_HOST_LEASE_GRACE_SECONDS),
            ),
            env_name="HOST_LEASE_GRACE_SECONDS",
            minimum=30,
            maximum=3600,
        ),
    )


@lru_cache(maxsize=1)
def get_settings() -> AppSettings:
    return load_settings()


def clear_settings_cache() -> None:
    get_settings.cache_clear()
