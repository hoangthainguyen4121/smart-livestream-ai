from __future__ import annotations

import re
import threading
import time
from collections import deque
from dataclasses import dataclass, field
from typing import Any, Deque, Dict, Optional

from app.settings import AppSettings


_WHITESPACE_RE = re.compile(r"\s+")


class CommentSpamGuardError(Exception):
    def __init__(self, *, code: str, retry_after_seconds: int, message: str) -> None:
        self.code = code
        self.retry_after_seconds = max(0, int(retry_after_seconds))
        self.message = message
        super().__init__(message)


@dataclass
class _ViewerSpamState:
    comment_times: Deque[float] = field(default_factory=deque)
    violation_times: Deque[float] = field(default_factory=deque)
    duplicate_streak: int = 0
    last_normalized_text: Optional[str] = None
    blocked_until: Optional[float] = None
    last_seen_monotonic: float = 0.0


class CommentSpamGuard:
    """In-memory per-room viewer spam guard (single-process MVP).

    Limitation: state is process-local. Each backend replica maintains its own
    counters; Railway currently runs one replica, so enforcement is consistent
    for the live deployment but not distributed-safe across horizontal scale-out.
    """

    def __init__(self, settings: AppSettings) -> None:
        self._settings = settings
        self._states: Dict[str, _ViewerSpamState] = {}
        self._lock = threading.RLock()

    def enabled(self) -> bool:
        return self._settings.comment_spam_guard_enabled

    def check_viewer_message(
        self,
        *,
        room_id: str,
        payload: dict[str, Any],
        websocket_id: Optional[int] = None,
    ) -> None:
        if not self.enabled():
            return
        if self._is_assistant_message(payload):
            return

        viewer_scope = self._viewer_scope(room_id, payload, websocket_id)
        text = payload.get("text")
        if not isinstance(text, str):
            return

        normalized_text = normalize_comment_text(text)
        if not normalized_text:
            return

        now = time.monotonic()
        with self._lock:
            self._cleanup_expired_states(now)
            state = self._states.setdefault(viewer_scope, _ViewerSpamState())
            state.last_seen_monotonic = now
            self._enforce_viewer_cap()

            if state.blocked_until is not None:
                if now < state.blocked_until:
                    retry_after = int(max(1, state.blocked_until - now + 0.999))
                    raise CommentSpamGuardError(
                        code="comment_temporarily_blocked",
                        retry_after_seconds=retry_after,
                        message="Comment temporarily blocked due to repeated spam.",
                    )
                state.blocked_until = None
                state.duplicate_streak = 0
                state.last_normalized_text = None

            window_seconds = self._settings.comment_rate_limit_window_seconds
            while state.comment_times and now - state.comment_times[0] >= window_seconds:
                state.comment_times.popleft()

            if len(state.comment_times) >= self._settings.comment_rate_limit_count:
                retry_after = int(max(1, window_seconds - (now - state.comment_times[0]) + 0.999))
                raise CommentSpamGuardError(
                    code="comment_rate_limited",
                    retry_after_seconds=retry_after,
                    message="Comment rate limit exceeded.",
                )

            if (
                state.last_normalized_text == normalized_text
                and state.duplicate_streak + 1 >= self._settings.comment_duplicate_streak_limit
            ):
                self._record_violation(state, now)
                if self._should_block(state, now):
                    state.blocked_until = now + self._settings.comment_block_seconds
                    retry_after = self._settings.comment_block_seconds
                    raise CommentSpamGuardError(
                        code="comment_temporarily_blocked",
                        retry_after_seconds=retry_after,
                        message="Comment temporarily blocked due to repeated spam.",
                    )
                raise CommentSpamGuardError(
                    code="comment_rate_limited",
                    retry_after_seconds=min(
                        self._settings.comment_rate_limit_window_seconds,
                        self._settings.comment_block_seconds,
                    ),
                    message="Duplicate comment detected.",
                )

            if state.last_normalized_text == normalized_text:
                state.duplicate_streak += 1
            else:
                state.duplicate_streak = 1
                state.last_normalized_text = normalized_text

            state.comment_times.append(now)

    @staticmethod
    def normalize_comment_text(text: str) -> str:
        return _WHITESPACE_RE.sub(" ", text.strip().lower())

    @staticmethod
    def _is_assistant_message(payload: dict[str, Any]) -> bool:
        reply_to = payload.get("reply_to_message_id")
        return isinstance(reply_to, str) and bool(reply_to.strip())

    def _viewer_scope(
        self,
        room_id: str,
        payload: dict[str, Any],
        websocket_id: Optional[int],
    ) -> str:
        identity = resolve_viewer_identity(payload, websocket_id=websocket_id)
        return f"{room_id}:{identity}"

    def _record_violation(self, state: _ViewerSpamState, now: float) -> None:
        violation_window = self._settings.comment_violation_window_seconds
        while state.violation_times and now - state.violation_times[0] >= violation_window:
            state.violation_times.popleft()
        state.violation_times.append(now)
        state.duplicate_streak = 0
        state.last_normalized_text = None

    def _should_block(self, state: _ViewerSpamState, now: float) -> bool:
        violation_window = self._settings.comment_violation_window_seconds
        while state.violation_times and now - state.violation_times[0] >= violation_window:
            state.violation_times.popleft()
        return len(state.violation_times) >= self._settings.comment_violations_before_block

    def _enforce_viewer_cap(self) -> None:
        max_viewers = self._settings.comment_spam_state_max_viewers
        if len(self._states) <= max_viewers:
            return
        oldest_scope = min(self._states.items(), key=lambda item: item[1].last_seen_monotonic)[0]
        del self._states[oldest_scope]

    def _cleanup_expired_states(self, now: float) -> None:
        inactive_after = max(
            self._settings.comment_rate_limit_window_seconds,
            self._settings.comment_violation_window_seconds,
            self._settings.comment_block_seconds,
        ) * 2
        expired = [
            scope
            for scope, state in self._states.items()
            if now - state.last_seen_monotonic > inactive_after
            and (state.blocked_until is None or now >= state.blocked_until)
        ]
        for scope in expired:
            del self._states[scope]


def normalize_comment_text(text: str) -> str:
    return CommentSpamGuard.normalize_comment_text(text)


def resolve_viewer_identity(payload: dict[str, Any], *, websocket_id: Optional[int] = None) -> str:
    author_user_id = payload.get("author_user_id")
    if isinstance(author_user_id, str) and author_user_id.strip():
        return f"user:{author_user_id.strip()}"

    viewer_key = payload.get("viewer_key")
    if isinstance(viewer_key, str) and viewer_key.strip():
        normalized_key = viewer_key.strip()
        if 8 <= len(normalized_key) <= 128:
            return f"viewer:{normalized_key}"

    if websocket_id is not None:
        return f"conn:{websocket_id}"

    author = payload.get("author")
    if isinstance(author, str) and author.strip():
        return f"author:{author.strip()}"

    return "anonymous"


_guard_singleton: Optional[CommentSpamGuard] = None
_guard_lock = threading.Lock()


def get_comment_spam_guard() -> CommentSpamGuard:
    global _guard_singleton
    from app.settings import get_settings

    settings = get_settings()
    with _guard_lock:
        if _guard_singleton is None or _guard_singleton._settings is not settings:
            _guard_singleton = CommentSpamGuard(settings)
        return _guard_singleton


def clear_comment_spam_guard_cache() -> None:
    global _guard_singleton
    with _guard_lock:
        _guard_singleton = None
