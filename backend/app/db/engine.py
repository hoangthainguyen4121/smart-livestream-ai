from __future__ import annotations

from functools import lru_cache
from typing import Optional

from sqlmodel import Session, create_engine

from app.settings import ChatPersistenceMode, get_settings


def get_database_url() -> Optional[str]:
    return get_settings().database_url


def is_persistence_enabled() -> bool:
    return get_settings().chat_persistence_mode == ChatPersistenceMode.SHORT_RETENTION


def is_feedback_db_configured() -> bool:
    return get_settings().database_url is not None


@lru_cache(maxsize=1)
def get_engine():
    database_url = get_database_url()
    if database_url is None:
        raise RuntimeError("DATABASE_URL is not configured.")
    return create_engine(database_url, pool_pre_ping=True)


def get_session_factory():
    return Session(get_engine())
