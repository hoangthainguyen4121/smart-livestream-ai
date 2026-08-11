"""Fail-fast guards so destructive pytest setup never targets demo/runtime DBs."""

from __future__ import annotations

from urllib.parse import urlparse


REFUSAL_MESSAGE = "Refusing to run destructive tests against non-test database"

# Known local/demo database names that must never be truncated by pytest.
FORBIDDEN_DATABASE_NAMES = frozenset(
    {
        "smart_livestream_local",
        "postgres",
        "template0",
        "template1",
    }
)

ALLOW_NONTEST_DB_ENV = "ALLOW_DESTRUCTIVE_TESTS_ON_NONTEST_DB"


class UnsafeTestDatabaseError(RuntimeError):
    """Raised when TEST_DATABASE_URL points at a non-test / runtime database."""


def database_name_from_url(url: str) -> str:
    raw = (url or "").strip()
    if not raw:
        raise UnsafeTestDatabaseError(f"{REFUSAL_MESSAGE}: empty database URL.")

    parsed = urlparse(raw)
    name = parsed.path.lstrip("/").split("/")[0].strip()
    if not name:
        raise UnsafeTestDatabaseError(
            f"{REFUSAL_MESSAGE}: could not resolve database name from URL."
        )
    return name


def _allows_nontest_database_override(environ: dict[str, str]) -> bool:
    raw = environ.get(ALLOW_NONTEST_DB_ENV, "").strip().lower()
    return raw in {"1", "true", "yes", "on"}


def assert_safe_test_database(
    test_database_url: str,
    *,
    runtime_database_url: str | None = None,
    environ: dict[str, str] | None = None,
) -> str:
    """Validate TEST_DATABASE_URL before migrations/TRUNCATE.

    Returns the resolved test database name when safe.
    """
    env = environ if environ is not None else {}
    test_url = (test_database_url or "").strip()
    if not test_url:
        raise UnsafeTestDatabaseError(
            f"{REFUSAL_MESSAGE}: TEST_DATABASE_URL is required "
            "(no fallback to DATABASE_URL)."
        )

    test_name = database_name_from_url(test_url).lower()
    runtime_url = (runtime_database_url or "").strip()
    if runtime_url:
        runtime_name = database_name_from_url(runtime_url).lower()
        if test_name == runtime_name:
            raise UnsafeTestDatabaseError(
                f"{REFUSAL_MESSAGE}: TEST_DATABASE_URL database "
                f"{test_name!r} matches DATABASE_URL."
            )

    if test_name in FORBIDDEN_DATABASE_NAMES:
        raise UnsafeTestDatabaseError(
            f"{REFUSAL_MESSAGE}: {test_name!r} is a forbidden non-test database."
        )

    if "test" not in test_name and not _allows_nontest_database_override(env):
        raise UnsafeTestDatabaseError(
            f"{REFUSAL_MESSAGE}: database name {test_name!r} does not look like a "
            f"test database (missing 'test'). Set {ALLOW_NONTEST_DB_ENV}=true only "
            "for an explicitly reviewed exception."
        )

    return test_name


def assert_safe_connected_database(current_database: str) -> str:
    """Validate the live connection target immediately before destructive SQL."""
    name = (current_database or "").strip().lower()
    if not name:
        raise UnsafeTestDatabaseError(
            f"{REFUSAL_MESSAGE}: could not read current_database()."
        )
    if name in FORBIDDEN_DATABASE_NAMES:
        raise UnsafeTestDatabaseError(
            f"{REFUSAL_MESSAGE}: connected to forbidden database {name!r}."
        )
    if "test" not in name:
        raise UnsafeTestDatabaseError(
            f"{REFUSAL_MESSAGE}: connected database {name!r} does not look like a "
            "test database (missing 'test')."
        )
    return name
