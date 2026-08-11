from __future__ import annotations

import pytest

from db_safety import (
    ALLOW_NONTEST_DB_ENV,
    REFUSAL_MESSAGE,
    UnsafeTestDatabaseError,
    assert_safe_connected_database,
    assert_safe_test_database,
    database_name_from_url,
)


TEST_URL = "postgresql+psycopg://postgres:postgres@127.0.0.1:5432/smart_livestream_test"
LOCAL_URL = "postgresql+psycopg://postgres:postgres@127.0.0.1:5432/smart_livestream_local"


def test_database_name_from_url() -> None:
    assert database_name_from_url(TEST_URL) == "smart_livestream_test"
    assert database_name_from_url(LOCAL_URL) == "smart_livestream_local"


def test_allows_dedicated_test_database() -> None:
    name = assert_safe_test_database(
        TEST_URL,
        runtime_database_url=LOCAL_URL,
        environ={},
    )
    assert name == "smart_livestream_test"


def test_refuses_local_demo_database() -> None:
    with pytest.raises(UnsafeTestDatabaseError, match=REFUSAL_MESSAGE):
        assert_safe_test_database(
            LOCAL_URL,
            runtime_database_url=None,
            environ={},
        )


def test_refuses_when_test_url_matches_runtime_database() -> None:
    with pytest.raises(UnsafeTestDatabaseError, match=REFUSAL_MESSAGE):
        assert_safe_test_database(
            TEST_URL,
            runtime_database_url=TEST_URL,
            environ={},
        )


def test_refuses_missing_test_database_url_without_runtime_fallback() -> None:
    with pytest.raises(UnsafeTestDatabaseError, match="no fallback to DATABASE_URL"):
        assert_safe_test_database(
            "",
            runtime_database_url=LOCAL_URL,
            environ={},
        )


def test_refuses_name_without_test_marker() -> None:
    with pytest.raises(UnsafeTestDatabaseError, match=REFUSAL_MESSAGE):
        assert_safe_test_database(
            "postgresql+psycopg://postgres:postgres@127.0.0.1:5432/smart_livestream_demo",
            runtime_database_url=LOCAL_URL,
            environ={},
        )


def test_explicit_override_allows_nontest_name_not_on_forbid_list() -> None:
    name = assert_safe_test_database(
        "postgresql+psycopg://postgres:postgres@127.0.0.1:5432/smart_livestream_demo",
        runtime_database_url=LOCAL_URL,
        environ={ALLOW_NONTEST_DB_ENV: "true"},
    )
    assert name == "smart_livestream_demo"


def test_override_cannot_unlock_forbidden_local_demo() -> None:
    with pytest.raises(UnsafeTestDatabaseError, match=REFUSAL_MESSAGE):
        assert_safe_test_database(
            LOCAL_URL,
            runtime_database_url=None,
            environ={ALLOW_NONTEST_DB_ENV: "true"},
        )


def test_connected_database_guard_refuses_local_before_truncate() -> None:
    with pytest.raises(UnsafeTestDatabaseError, match=REFUSAL_MESSAGE):
        assert_safe_connected_database("smart_livestream_local")


def test_connected_database_guard_allows_test_db() -> None:
    assert assert_safe_connected_database("smart_livestream_test") == "smart_livestream_test"
