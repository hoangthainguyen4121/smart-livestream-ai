from __future__ import annotations

import os
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import text
from sqlmodel import Session

from db_safety import (
    UnsafeTestDatabaseError,
    assert_safe_connected_database,
    assert_safe_test_database,
)


BACKEND_ROOT = Path(__file__).resolve().parents[1]


def _read_env_file_database_url() -> str | None:
    env_path = BACKEND_ROOT / ".env"
    if not env_path.is_file():
        return None
    for raw_line in env_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        if key.strip() != "DATABASE_URL":
            continue
        cleaned = value.strip().strip('"').strip("'")
        return cleaned or None
    return None


def _snapshot_runtime_database_url() -> str | None:
    # Prefer process env, then backend/.env demo/runtime value. Never fall back TEST→runtime.
    from_env = os.getenv("DATABASE_URL", "").strip()
    if from_env:
        return from_env
    return _read_env_file_database_url()


# Snapshot runtime/demo DATABASE_URL before fixtures overwrite it with TEST_DATABASE_URL.
_RUNTIME_DATABASE_URL_AT_IMPORT = _snapshot_runtime_database_url()


def _require_test_database_url() -> str:
    url = os.getenv("TEST_DATABASE_URL", "").strip()
    if not url:
        pytest.skip("TEST_DATABASE_URL is not configured.")
    try:
        assert_safe_test_database(
            url,
            runtime_database_url=_RUNTIME_DATABASE_URL_AT_IMPORT,
            environ=dict(os.environ),
        )
    except UnsafeTestDatabaseError as error:
        pytest.fail(str(error))
    return url


def _reset_runtime_caches() -> None:
    from app.db import engine as engine_module
    from app.settings import clear_settings_cache

    clear_settings_cache()
    engine_module.get_engine.cache_clear()
    try:
        from app.services.comment_spam_guard import clear_comment_spam_guard_cache

        clear_comment_spam_guard_cache()
    except ImportError:
        pass


def _truncate_after_guard(session: Session, sql: str) -> None:
    current_database = session.execute(text("SELECT current_database()")).scalar_one()
    assert_safe_connected_database(str(current_database))
    session.execute(text(sql))
    session.commit()


@pytest.fixture(scope="session")
def postgres_database_url() -> str:
    return _require_test_database_url()


@pytest.fixture(scope="session")
def apply_migrations(postgres_database_url: str) -> None:
    # Guard already ran in postgres_database_url; re-check URL before Alembic touches DB.
    assert_safe_test_database(
        postgres_database_url,
        runtime_database_url=_RUNTIME_DATABASE_URL_AT_IMPORT,
        environ=dict(os.environ),
    )
    os.environ["DATABASE_URL"] = postgres_database_url
    config = Config(str(BACKEND_ROOT / "alembic.ini"))
    config.set_main_option("script_location", str(BACKEND_ROOT / "alembic"))
    command.upgrade(config, "head")


@pytest.fixture()
def persistence_env(postgres_database_url: str, apply_migrations, monkeypatch: pytest.MonkeyPatch) -> str:
    monkeypatch.setenv("CHAT_PERSISTENCE_MODE", "short_retention")
    monkeypatch.setenv("DATABASE_URL", postgres_database_url)
    _reset_runtime_caches()
    yield postgres_database_url
    _reset_runtime_caches()


@pytest.fixture()
def memory_mode_env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("DATABASE_URL", raising=False)
    monkeypatch.setenv("CHAT_PERSISTENCE_MODE", "memory")
    _reset_runtime_caches()
    try:
        from app.services.memory_live_sessions import get_memory_live_session_store

        get_memory_live_session_store().clear()
    except ImportError:
        pass
    yield
    try:
        from app.services.memory_live_sessions import get_memory_live_session_store

        get_memory_live_session_store().clear()
    except ImportError:
        pass
    _reset_runtime_caches()


@pytest.fixture()
def spam_guard_env(memory_mode_env: None, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("COMMENT_SPAM_GUARD_ENABLED", "true")
    monkeypatch.setenv("COMMENT_RATE_LIMIT_COUNT", "5")
    monkeypatch.setenv("COMMENT_DUPLICATE_STREAK_LIMIT", "3")
    monkeypatch.setenv("COMMENT_RATE_LIMIT_WINDOW_SECONDS", "10")
    monkeypatch.setenv("COMMENT_VIOLATION_WINDOW_SECONDS", "60")
    monkeypatch.setenv("COMMENT_VIOLATIONS_BEFORE_BLOCK", "2")
    monkeypatch.setenv("COMMENT_BLOCK_SECONDS", "120")
    monkeypatch.setenv("COMMENT_SPAM_STATE_MAX_VIEWERS", "5000")
    _reset_runtime_caches()
    from app.services.comment_spam_guard import clear_comment_spam_guard_cache

    clear_comment_spam_guard_cache()
    yield
    clear_comment_spam_guard_cache()
    _reset_runtime_caches()


@pytest.fixture()
def feedback_env(postgres_database_url: str, apply_migrations, monkeypatch: pytest.MonkeyPatch) -> str:
    monkeypatch.setenv("CHAT_PERSISTENCE_MODE", "memory")
    monkeypatch.setenv("DATABASE_URL", postgres_database_url)
    _reset_runtime_caches()
    from app.services.memory_live_sessions import get_memory_live_session_store

    get_memory_live_session_store().clear()
    yield postgres_database_url
    get_memory_live_session_store().clear()
    _reset_runtime_caches()


@pytest.fixture()
def db_session_feedback(feedback_env: str):
    from app.db.engine import get_engine

    engine = get_engine()
    with Session(engine) as session:
        _truncate_after_guard(
            session,
            "TRUNCATE TABLE ml_retrain_candidate_runs, dataset_export_processing_runs, "
            "dataset_export_batch_items, dataset_export_batches, "
            "intent_correction_samples, comments, "
            "payments, order_items, orders, room_products, products, shops, auth_tokens, users, "
            "livestream_sessions, profiles RESTART IDENTITY CASCADE",
        )
        yield session


@pytest.fixture()
def db_session(persistence_env: str):
    from app.db.engine import get_engine

    engine = get_engine()
    with Session(engine) as session:
        _truncate_after_guard(
            session,
            "TRUNCATE TABLE dataset_export_batch_items, dataset_export_batches, "
            "intent_correction_samples, comments, "
            "payments, order_items, orders, room_products, products, shops, auth_tokens, users, "
            "livestream_sessions, profiles "
            "RESTART IDENTITY CASCADE",
        )
        yield session
