from __future__ import annotations

import threading
import time
from dataclasses import replace
from pathlib import Path
import sys
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient


BACKEND_ROOT = Path(__file__).resolve().parents[1]
PROJECT_ROOT = BACKEND_ROOT.parent

for path in (BACKEND_ROOT, PROJECT_ROOT):
    path_text = str(path)
    if path_text not in sys.path:
        sys.path.insert(0, path_text)

from app.api import chat as chat_api  # noqa: E402
from app.main import app  # noqa: E402
from app.services.comment_spam_guard import (  # noqa: E402
    CommentSpamGuard,
    CommentSpamGuardError,
    clear_comment_spam_guard_cache,
    normalize_comment_text,
    resolve_viewer_identity,
)
from app.settings import load_settings  # noqa: E402


def unique_room_id() -> str:
    return f"spam-{uuid4()}"


def viewer_payload(*, author: str = "viewer-a", text: str, viewer_key: str | None = None) -> dict:
    payload = {
        "type": "chat_message",
        "author": author,
        "text": text,
    }
    if viewer_key is not None:
        payload["viewer_key"] = viewer_key
    return payload


def spam_settings(**overrides):
    base = load_settings()
    values = {
        "comment_spam_guard_enabled": True,
        "comment_rate_limit_count": 5,
        "comment_rate_limit_window_seconds": 10,
        "comment_duplicate_streak_limit": 3,
        "comment_violation_window_seconds": 60,
        "comment_violations_before_block": 2,
        "comment_block_seconds": 120,
        "comment_spam_state_max_viewers": 100,
    }
    values.update(overrides)
    return replace(base, **values)


@pytest.fixture()
def guard() -> CommentSpamGuard:
    clear_comment_spam_guard_cache()
    return CommentSpamGuard(spam_settings())


@pytest.fixture()
def ws_client(spam_guard_env: None) -> TestClient:
    clear_comment_spam_guard_cache()
    return TestClient(app)


def test_normalize_comment_text_collapses_whitespace_and_case() -> None:
    assert normalize_comment_text("  Hello   WORLD  ") == "hello world"


def test_resolve_viewer_identity_priority() -> None:
    payload = {
        "author_user_id": "user-1",
        "viewer_key": "viewer-key-12345678",
        "author": "guest",
    }
    assert resolve_viewer_identity(payload, websocket_id=999) == "user:user-1"

    payload.pop("author_user_id")
    assert resolve_viewer_identity(payload, websocket_id=999) == "viewer:viewer-key-12345678"

    payload.pop("viewer_key")
    assert resolve_viewer_identity(payload, websocket_id=999) == "conn:999"


def test_five_comments_within_window_are_allowed(guard: CommentSpamGuard) -> None:
    room_id = "room-a"
    viewer_key = "viewer-allowed-1"
    for index in range(5):
        guard.check_viewer_message(
            room_id=room_id,
            payload=viewer_payload(text=f"msg-{index}", viewer_key=viewer_key),
            websocket_id=None,
        )


def test_sixth_comment_is_rate_limited(guard: CommentSpamGuard) -> None:
    room_id = "room-a"
    viewer_key = "viewer-rate-1"
    for index in range(5):
        guard.check_viewer_message(
            room_id=room_id,
            payload=viewer_payload(text=f"msg-{index}", viewer_key=viewer_key),
            websocket_id=None,
        )

    with pytest.raises(CommentSpamGuardError) as error:
        guard.check_viewer_message(
            room_id=room_id,
            payload=viewer_payload(text="too-fast", viewer_key=viewer_key),
            websocket_id=None,
        )

    assert error.value.code == "comment_rate_limited"
    assert error.value.retry_after_seconds >= 1


def test_retry_after_seconds_is_non_negative(guard: CommentSpamGuard) -> None:
    room_id = "room-a"
    viewer_key = "viewer-retry-1"
    for index in range(5):
        guard.check_viewer_message(
            room_id=room_id,
            payload=viewer_payload(text=f"msg-{index}", viewer_key=viewer_key),
            websocket_id=None,
        )

    with pytest.raises(CommentSpamGuardError) as error:
        guard.check_viewer_message(
            room_id=room_id,
            payload=viewer_payload(text="blocked", viewer_key=viewer_key),
            websocket_id=None,
        )

    assert error.value.retry_after_seconds >= 0


def test_three_normalized_duplicates_create_violation(guard: CommentSpamGuard) -> None:
    room_id = "room-a"
    viewer_key = "viewer-dup-1"
    guard.check_viewer_message(
        room_id=room_id,
        payload=viewer_payload(text="Same Text", viewer_key=viewer_key),
        websocket_id=None,
    )
    guard.check_viewer_message(
        room_id=room_id,
        payload=viewer_payload(text="same   text", viewer_key=viewer_key),
        websocket_id=None,
    )

    with pytest.raises(CommentSpamGuardError) as error:
        guard.check_viewer_message(
            room_id=room_id,
            payload=viewer_payload(text="SAME TEXT", viewer_key=viewer_key),
            websocket_id=None,
        )

    assert error.value.code == "comment_rate_limited"


def test_two_violations_create_temporary_block(guard: CommentSpamGuard) -> None:
    room_id = "room-a"
    viewer_key = "viewer-block-1"
    duplicate_text = "duplicate spam text"

    guard.check_viewer_message(
        room_id=room_id,
        payload=viewer_payload(text=duplicate_text, viewer_key=viewer_key),
        websocket_id=None,
    )
    guard.check_viewer_message(
        room_id=room_id,
        payload=viewer_payload(text=duplicate_text, viewer_key=viewer_key),
        websocket_id=None,
    )
    with pytest.raises(CommentSpamGuardError) as first_violation:
        guard.check_viewer_message(
            room_id=room_id,
            payload=viewer_payload(text=duplicate_text, viewer_key=viewer_key),
            websocket_id=None,
        )
    assert first_violation.value.code == "comment_rate_limited"

    guard.check_viewer_message(
        room_id=room_id,
        payload=viewer_payload(text=duplicate_text, viewer_key=viewer_key),
        websocket_id=None,
    )
    guard.check_viewer_message(
        room_id=room_id,
        payload=viewer_payload(text=duplicate_text, viewer_key=viewer_key),
        websocket_id=None,
    )
    with pytest.raises(CommentSpamGuardError) as error:
        guard.check_viewer_message(
            room_id=room_id,
            payload=viewer_payload(text=duplicate_text, viewer_key=viewer_key),
            websocket_id=None,
        )

    assert error.value.code == "comment_temporarily_blocked"
    assert error.value.retry_after_seconds >= 1


def test_block_expires_automatically() -> None:
    settings = spam_settings(comment_block_seconds=1, comment_rate_limit_count=100)
    guard = CommentSpamGuard(settings)
    room_id = "room-a"
    viewer_key = "viewer-expire-1"
    duplicate_text = "expire duplicate"

    for _ in range(2):
        guard.check_viewer_message(
            room_id=room_id,
            payload=viewer_payload(text=duplicate_text, viewer_key=viewer_key),
            websocket_id=None,
        )
    with pytest.raises(CommentSpamGuardError):
        guard.check_viewer_message(
            room_id=room_id,
            payload=viewer_payload(text=duplicate_text, viewer_key=viewer_key),
            websocket_id=None,
        )

    for _ in range(2):
        guard.check_viewer_message(
            room_id=room_id,
            payload=viewer_payload(text=duplicate_text, viewer_key=viewer_key),
            websocket_id=None,
        )
    with pytest.raises(CommentSpamGuardError):
        guard.check_viewer_message(
            room_id=room_id,
            payload=viewer_payload(text=duplicate_text, viewer_key=viewer_key),
            websocket_id=None,
        )

    time.sleep(1.1)
    guard.check_viewer_message(
        room_id=room_id,
        payload=viewer_payload(text="after block", viewer_key=viewer_key),
        websocket_id=None,
    )


def test_other_viewer_is_not_affected(guard: CommentSpamGuard) -> None:
    room_id = "room-a"
    blocked_viewer = "viewer-blocked-peer"
    allowed_viewer = "viewer-allowed-peer"

    for index in range(5):
        guard.check_viewer_message(
            room_id=room_id,
            payload=viewer_payload(text=f"fast-{index}", viewer_key=blocked_viewer),
            websocket_id=None,
        )
    with pytest.raises(CommentSpamGuardError):
        guard.check_viewer_message(
            room_id=room_id,
            payload=viewer_payload(text="blocked", viewer_key=blocked_viewer),
            websocket_id=None,
        )

    guard.check_viewer_message(
        room_id=room_id,
        payload=viewer_payload(text="still ok", viewer_key=allowed_viewer),
        websocket_id=None,
    )


def test_different_room_has_separate_state(guard: CommentSpamGuard) -> None:
    viewer_key = "viewer-room-scope"
    for index in range(5):
        guard.check_viewer_message(
            room_id="room-one",
            payload=viewer_payload(text=f"msg-{index}", viewer_key=viewer_key),
            websocket_id=None,
        )
    with pytest.raises(CommentSpamGuardError):
        guard.check_viewer_message(
            room_id="room-one",
            payload=viewer_payload(text="blocked", viewer_key=viewer_key),
            websocket_id=None,
        )

    guard.check_viewer_message(
        room_id="room-two",
        payload=viewer_payload(text="other room ok", viewer_key=viewer_key),
        websocket_id=None,
    )


def test_blocked_comment_does_not_broadcast(ws_client: TestClient) -> None:
    room_id = unique_room_id()
    viewer_key = f"viewer-broadcast-{uuid4()}"

    with ws_client.websocket_connect(f"/ws/chat/{room_id}") as websocket:
        websocket.receive_json()
        for index in range(5):
            websocket.send_json(viewer_payload(text=f"msg-{index}", viewer_key=viewer_key))
            assert websocket.receive_json()["type"] == "chat_message"

        websocket.send_json(viewer_payload(text="sixth", viewer_key=viewer_key))
        response = websocket.receive_json()

    assert response["type"] == "error"
    assert response["code"] == "comment_rate_limited"
    assert response["retry_after_seconds"] >= 1


def test_blocked_comment_does_not_persist(
    monkeypatch: pytest.MonkeyPatch,
    spam_guard_env: None,
) -> None:
    import asyncio

    from app.services.chat_persistence import ChatPersistenceService

    persist_calls: list[str] = []

    def fake_persist(self, room_id: str, message) -> None:  # noqa: ANN001
        persist_calls.append(message.text)

    monkeypatch.setenv("CHAT_PERSISTENCE_MODE", "short_retention")
    monkeypatch.setenv("DATABASE_URL", "postgresql+psycopg://example")
    clear_comment_spam_guard_cache()
    from app.settings import clear_settings_cache

    clear_settings_cache()

    service = ChatPersistenceService(chat_api.chat_manager)
    monkeypatch.setattr(ChatPersistenceService, "_persist_comment", fake_persist)

    viewer_key = f"viewer-db-{uuid4()}"
    room_id = unique_room_id()

    async def run_allowed() -> None:
        for index in range(5):
            await service.handle_chat_message(
                room_id,
                viewer_payload(text=f"msg-{index}", viewer_key=viewer_key),
                websocket_id=111,
            )

    asyncio.run(run_allowed())

    with pytest.raises(CommentSpamGuardError):
        asyncio.run(
            service.handle_chat_message(
                room_id,
                viewer_payload(text="blocked", viewer_key=viewer_key),
                websocket_id=111,
            )
        )

    assert persist_calls == [f"msg-{index}" for index in range(5)]


def test_state_cleanup_and_upper_bound() -> None:
    settings = spam_settings(comment_spam_state_max_viewers=2)
    guard = CommentSpamGuard(settings)

    guard.check_viewer_message(
        room_id="room-a",
        payload=viewer_payload(text="one", viewer_key="viewer-cap-1"),
        websocket_id=None,
    )
    guard.check_viewer_message(
        room_id="room-a",
        payload=viewer_payload(text="two", viewer_key="viewer-cap-2"),
        websocket_id=None,
    )
    guard.check_viewer_message(
        room_id="room-a",
        payload=viewer_payload(text="three", viewer_key="viewer-cap-3"),
        websocket_id=None,
    )

    assert len(guard._states) <= 2


def test_concurrent_submissions_do_not_bypass_limit(guard: CommentSpamGuard) -> None:
    room_id = "room-a"
    viewer_key = "viewer-concurrent-1"
    errors: list[CommentSpamGuardError] = []
    barrier = threading.Barrier(6)

    def worker(index: int) -> None:
        barrier.wait()
        try:
            guard.check_viewer_message(
                room_id=room_id,
                payload=viewer_payload(text=f"parallel-{index % 3}", viewer_key=viewer_key),
                websocket_id=None,
            )
        except CommentSpamGuardError as error:
            errors.append(error)

    threads = [threading.Thread(target=worker, args=(index,)) for index in range(6)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()

    assert errors
    assert any(error.code == "comment_rate_limited" for error in errors)


def test_feature_flag_off_preserves_old_behavior(
    monkeypatch: pytest.MonkeyPatch,
    memory_mode_env: None,
) -> None:
    monkeypatch.setenv("COMMENT_SPAM_GUARD_ENABLED", "false")
    clear_comment_spam_guard_cache()
    from app.settings import clear_settings_cache

    clear_settings_cache()
    client = TestClient(app)
    room_id = unique_room_id()

    with client.websocket_connect(f"/ws/chat/{room_id}") as websocket:
        websocket.receive_json()
        for index in range(6):
            websocket.send_json(viewer_payload(text=f"msg-{index}", viewer_key="viewer-flag-off"))
            response = websocket.receive_json()
            assert response["type"] == "chat_message"


def test_assistant_messages_bypass_spam_guard(ws_client: TestClient) -> None:
    room_id = unique_room_id()

    with ws_client.websocket_connect(f"/ws/chat/{room_id}") as websocket:
        websocket.receive_json()
        for index in range(6):
            websocket.send_json(
                {
                    "type": "chat_message",
                    "id": f"assistant-spam-bypass-{index}",
                    "author": "Trợ lý bán hàng",
                    "text": f"Reply {index}",
                    "reply_to_message_id": "viewer-1",
                    "reply_to_author": "guest",
                    "reply_to_text": "hello",
                }
            )
            assert websocket.receive_json()["type"] == "chat_message"


def test_websocket_returns_retry_contract_for_block(ws_client: TestClient) -> None:
    room_id = unique_room_id()
    viewer_key = f"viewer-ws-block-{uuid4()}"
    duplicate_text = "same duplicate text"

    with ws_client.websocket_connect(f"/ws/chat/{room_id}") as websocket:
        websocket.receive_json()

        for _ in range(2):
            websocket.send_json(viewer_payload(text=duplicate_text, viewer_key=viewer_key))
            websocket.receive_json()
        websocket.send_json(viewer_payload(text=duplicate_text, viewer_key=viewer_key))
        first_violation = websocket.receive_json()
        assert first_violation["code"] == "comment_rate_limited"

        for _ in range(2):
            websocket.send_json(viewer_payload(text=duplicate_text, viewer_key=viewer_key))
            websocket.receive_json()
        websocket.send_json(viewer_payload(text=duplicate_text, viewer_key=viewer_key))
        blocked = websocket.receive_json()

    assert blocked["type"] == "error"
    assert blocked["code"] == "comment_temporarily_blocked"
    assert blocked["retry_after_seconds"] >= 1
    assert "traceback" not in blocked


def test_existing_chat_websocket_regression(memory_mode_env: None) -> None:
    clear_comment_spam_guard_cache()
    from app.settings import clear_settings_cache

    clear_settings_cache()
    client = TestClient(app)
    room_id = unique_room_id()

    with client.websocket_connect(f"/ws/chat/{room_id}") as websocket:
        response = websocket.receive_json()
        assert response["type"] == "chat_history"
        websocket.send_json(viewer_payload(text="Hello chat"))
        message = websocket.receive_json()
        assert message["type"] == "chat_message"
        assert message["text"] == "Hello chat"
