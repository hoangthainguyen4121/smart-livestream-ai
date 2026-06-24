from __future__ import annotations

import time
from dataclasses import dataclass, field

from config.settings import GESTURE

from desktop_client.backend_client import BackendClient


ALLOWED_GESTURES = {"Raise Hand", "Thumbs Up"}


@dataclass
class PendingDesktopEvent:
    type: str
    username: str = ""
    gesture: str = ""


@dataclass
class IdentityPresenceTracker:
    visible_usernames: set[str] = field(default_factory=set)
    missing_since: dict[str, float] = field(default_factory=dict)
    disappear_grace_sec: float = 1.0

    def observe(self, known_usernames: set[str], now: float) -> list[PendingDesktopEvent]:
        events: list[PendingDesktopEvent] = []

        for username in known_usernames:
            if username not in self.visible_usernames:
                events.append(
                    PendingDesktopEvent(type="identity_appeared", username=username)
                )
            self.visible_usernames.add(username)
            self.missing_since.pop(username, None)

        for username in list(self.visible_usernames - known_usernames):
            missing_since = self.missing_since.setdefault(username, now)
            if now - missing_since >= self.disappear_grace_sec:
                events.append(
                    PendingDesktopEvent(type="identity_disappeared", username=username)
                )
                self.visible_usernames.discard(username)
                self.missing_since.pop(username, None)

        return events


class EventPublisher:
    def __init__(
        self,
        backend_client: BackendClient,
        *,
        disappear_grace_sec: float = 1.0,
        batch_interval_sec: float = 0.25,
    ) -> None:
        self.backend_client = backend_client
        self.identity_presence = IdentityPresenceTracker(
            disappear_grace_sec=disappear_grace_sec
        )
        self.pending_events: list[PendingDesktopEvent] = []
        self.last_flush_at = 0.0
        self.batch_interval_sec = batch_interval_sec
        self.emitted_gesture_at: dict[tuple[str, str], float] = {}
        self.gesture_cooldown_sec = 2.5
        self.last_unknown_event_at = -999.0
        self.last_multiple_faces_event_at = -999.0
        self.identity_event_cooldown_sec = 2.5

    def on_recognition(
        self,
        recognition_results,
        *,
        now: float | None = None,
    ) -> None:
        current_time = time.perf_counter() if now is None else now
        known_usernames = {
            result.label
            for result in recognition_results
            if result.is_known
        }
        self.pending_events.extend(
            self.identity_presence.observe(known_usernames, current_time)
        )

        if len(recognition_results) >= 2:
            if current_time - self.last_multiple_faces_event_at >= self.identity_event_cooldown_sec:
                self.pending_events.append(PendingDesktopEvent(type="multiple_faces_detected"))
                self.last_multiple_faces_event_at = current_time

        if recognition_results and not known_usernames:
            if current_time - self.last_unknown_event_at >= self.identity_event_cooldown_sec:
                self.pending_events.append(PendingDesktopEvent(type="unknown_face_detected"))
                self.last_unknown_event_at = current_time

    def on_gestures(
        self,
        gesture_events,
        primary_username: str,
        *,
        now: float | None = None,
    ) -> None:
        current_time = time.perf_counter() if now is None else now
        visible_events = suppress_conflicting_gestures(gesture_events)

        for event in visible_events:
            if event.name not in ALLOWED_GESTURES:
                continue

            cooldown_key = (primary_username, event.name)
            previous_time = self.emitted_gesture_at.get(cooldown_key, -self.gesture_cooldown_sec)
            if current_time - previous_time < self.gesture_cooldown_sec:
                continue

            self.emitted_gesture_at[cooldown_key] = current_time
            self.pending_events.append(
                PendingDesktopEvent(
                    type=gesture_to_event_type(event.name) or event.name,
                    username=primary_username,
                    gesture=event.name,
                )
            )

    def flush_if_due(self, *, force: bool = False) -> None:
        current_time = time.perf_counter()
        if not force and current_time - self.last_flush_at < self.batch_interval_sec:
            return
        if not self.pending_events:
            self.last_flush_at = current_time
            return

        payload = [
            {
                "type": event.type,
                "username": event.username,
                "gesture": event.gesture,
            }
            for event in self.pending_events
        ]
        if self.backend_client.post_events(payload):
            self.pending_events.clear()
        self.last_flush_at = current_time

    def flush(self) -> None:
        self.flush_if_due(force=True)


def suppress_conflicting_gestures(gesture_events):
    filtered_events = [
        event
        for event in gesture_events
        if event.name != "Wave" or GESTURE.enable_wave_gesture
    ]
    has_raise_hand = any(event.name == "Raise Hand" for event in filtered_events)
    if not has_raise_hand:
        return filtered_events
    return [event for event in filtered_events if event.name != "Thumbs Up"]


def gesture_to_event_type(gesture: str) -> str | None:
    if gesture == "Raise Hand":
        return "raise_hand"
    if gesture == "Thumbs Up":
        return "thumbs_up"
    return None
