from __future__ import annotations

import os
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import text
from sqlmodel import Session


BACKEND_ROOT = Path(__file__).resolve().parents[1]


def _require_test_database_url() -> str:
    url = os.getenv("TEST_DATABASE_URL", "").strip()
    if not url:
        pytest.skip("TEST_DATABASE_URL is not configured.")
    return url


def _reset_runtime_caches() -> None:
    from app.db import engine as engine_module
    from app.settings import clear_settings_cache

    clear_settings_cache()
    engine_module.get_engine.cache_clear()


@pytest.fixture(scope="session")
def postgres_database_url() -> str:
    return _require_test_database_url()


@pytest.fixture(scope="session")
def apply_migrations(postgres_database_url: str) -> None:
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
    yield
    _reset_runtime_caches()


@pytest.fixture()
def feedback_env(postgres_database_url: str, apply_migrations, monkeypatch: pytest.MonkeyPatch) -> str:
    monkeypatch.setenv("CHAT_PERSISTENCE_MODE", "memory")
    monkeypatch.setenv("DATABASE_URL", postgres_database_url)
    _reset_runtime_caches()
    yield postgres_database_url
    _reset_runtime_caches()


@pytest.fixture()
def db_session_feedback(feedback_env: str):
    from app.db.engine import get_engine

    engine = get_engine()
    with Session(engine) as session:
        session.execute(
            text(
                "TRUNCATE TABLE ml_retrain_candidate_runs, dataset_export_processing_runs, "
                "dataset_export_batch_items, dataset_export_batches, "
                "intent_correction_samples, comments, "
                "livestream_sessions, profiles RESTART IDENTITY CASCADE"
            )
        )
        session.commit()
        yield session


@pytest.fixture()
def db_session(persistence_env: str):
    from app.db.engine import get_engine

    engine = get_engine()
    with Session(engine) as session:
        session.execute(text("TRUNCATE TABLE dataset_export_batch_items, dataset_export_batches, intent_correction_samples, comments, livestream_sessions, profiles RESTART IDENTITY CASCADE"))
        session.commit()
        yield session
