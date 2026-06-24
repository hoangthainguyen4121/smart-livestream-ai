from __future__ import annotations

import time
from collections import deque
from dataclasses import dataclass
import threading


ALLOWED_DESKTOP_GESTURES = frozenset({"Raise Hand", "Thumbs Up"})


@dataclass
class ViewState:
    debug_overlay: bool = False
    show_bbox: bool = False
    gestures_enabled: bool = False
    fullscreen: bool = False
    show_event_feed: bool = True

    def toggle_debug(self) -> None:
        self.debug_overlay = not self.debug_overlay
        if self.debug_overlay:
            self.show_bbox = True

    def toggle_bbox(self) -> None:
        self.show_bbox = not self.show_bbox


@dataclass(frozen=True)
class EventFeedEntry:
    message: str
    created_at: float


class EventFeedBuffer:
    def __init__(self, max_entries: int = 8) -> None:
        self.max_entries = max_entries
        self._entries: deque[EventFeedEntry] = deque(maxlen=max_entries)
        self._lock = threading.Lock()

    def push(self, message: str, *, now: float | None = None) -> None:
        timestamp = time.perf_counter() if now is None else now
        with self._lock:
            self._entries.appendleft(EventFeedEntry(message=message, created_at=timestamp))

    def entries(self) -> list[EventFeedEntry]:
        with self._lock:
            return list(self._entries)


@dataclass
class ActionBadge:
    label: str
    subtitle: str
    frames_left: int


class ActionFeedbackState:
    BADGE_DURATION_FRAMES = 45

    def __init__(self) -> None:
        self._badges: list[ActionBadge] = []

    def trigger(self, gesture_name: str) -> None:
        if gesture_name not in ALLOWED_DESKTOP_GESTURES:
            return
        label, subtitle = gesture_badge_text(gesture_name)
        self._badges = [
            ActionBadge(label=label, subtitle=subtitle, frames_left=self.BADGE_DURATION_FRAMES)
        ]

    def update(self) -> list[ActionBadge]:
        next_badges: list[ActionBadge] = []
        for badge in self._badges:
            remaining = badge.frames_left - 1
            if remaining > 0:
                next_badges.append(
                    ActionBadge(
                        label=badge.label,
                        subtitle=badge.subtitle,
                        frames_left=remaining,
                    )
                )
        self._badges = next_badges
        return list(self._badges)


class StreamTimer:
    def __init__(self) -> None:
        self._started_at = time.perf_counter()

    def elapsed_text(self, now: float | None = None) -> str:
        current = time.perf_counter() if now is None else now
        elapsed_seconds = max(0, int(current - self._started_at))
        minutes, seconds = divmod(elapsed_seconds, 60)
        hours, minutes = divmod(minutes, 60)
        if hours > 0:
            return f"{hours:02d}:{minutes:02d}:{seconds:02d}"
        return f"{minutes:02d}:{seconds:02d}"


def gesture_badge_text(gesture_name: str) -> tuple[str, str]:
    if gesture_name == "Thumbs Up":
        return "THUMBS UP", "+1"
    if gesture_name == "Raise Hand":
        return "RAISE HAND", "HAND"
    return gesture_name.upper(), ""


def gesture_event_feed_message(gesture_name: str, username: str) -> str:
    handle = format_host_handle(username)
    if gesture_name == "Thumbs Up":
        return f"{handle} sent Thumbs Up"
    if gesture_name == "Raise Hand":
        return f"{handle} raised hand"
    return f"{handle} {gesture_name}"


def format_host_handle(username: str | None, default: str = "@hoang") -> str:
    if not username or username in {"Viewer", "Detecting..."}:
        return default
    normalized = username.strip()
    if not normalized:
        return default
    return normalized if normalized.startswith("@") else f"@{normalized}"


def should_submit_gesture_frame(frame_count: int, interval: int, enabled: bool) -> bool:
    if not enabled:
        return False
    step = max(1, interval)
    return frame_count == 1 or frame_count % step == 0


def filter_desktop_gesture_events(events) -> list:
    return [event for event in events if event.name in ALLOWED_DESKTOP_GESTURES]
