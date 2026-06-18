from __future__ import annotations

import time
from collections import deque
from dataclasses import dataclass
from datetime import datetime, timezone
from uuid import uuid4


MAX_RECENT_EVENTS = 50
DEFAULT_EVENT_COOLDOWN_SECONDS = 2.5


@dataclass(frozen=True)
class InteractionEvent:
    id: str
    type: str
    username: str
    label: str
    created_at: str
    gesture: str = ""

    def to_dict(self) -> dict[str, str]:
        return {
            "id": self.id,
            "type": self.type,
            "username": self.username,
            "gesture": self.gesture,
            "label": self.label,
            "created_at": self.created_at,
        }


class InteractionEventService:
    def __init__(
        self,
        max_events: int = MAX_RECENT_EVENTS,
        cooldown_seconds: float = DEFAULT_EVENT_COOLDOWN_SECONDS,
    ) -> None:
        self._events: deque[InteractionEvent] = deque(maxlen=max_events)
        self._cooldown_seconds = cooldown_seconds
        self._last_emitted_at: dict[tuple[str, str], float] = {}

    def append_event(
        self,
        *,
        event_type: str,
        username: str = "",
        now: float | None = None,
    ) -> InteractionEvent | None:
        normalized_username = username.strip()
        current_time = time.perf_counter() if now is None else now
        cooldown_key = (normalized_username, event_type)
        previous_time = self._last_emitted_at.get(cooldown_key)
        if (
            previous_time is not None
            and current_time - previous_time < self._cooldown_seconds
        ):
            return None

        event = InteractionEvent(
            id=str(uuid4()),
            type=event_type,
            username=normalized_username,
            label=format_event_label(event_type, normalized_username),
            created_at=datetime.now(timezone.utc).isoformat(),
        )
        self._last_emitted_at[cooldown_key] = current_time
        self._events.append(event)
        return event

    def append_gesture_event(
        self,
        *,
        username: str,
        gesture: str,
        now: float | None = None,
    ) -> InteractionEvent | None:
        event_type = gesture_to_event_type(gesture)
        if event_type is None:
            return None

        normalized_username = username.strip() or "Viewer"
        current_time = time.perf_counter() if now is None else now
        cooldown_key = (normalized_username, event_type)
        previous_time = self._last_emitted_at.get(cooldown_key)
        if (
            previous_time is not None
            and current_time - previous_time < self._cooldown_seconds
        ):
            return None

        event = InteractionEvent(
            id=str(uuid4()),
            type=event_type,
            username=normalized_username,
            gesture=gesture,
            label=format_event_label(event_type, normalized_username),
            created_at=datetime.now(timezone.utc).isoformat(),
        )
        self._last_emitted_at[cooldown_key] = current_time
        self._events.append(event)
        return event

    def recent_events(self) -> list[dict[str, str]]:
        return [event.to_dict() for event in self._events]

    def clear(self) -> None:
        self._events.clear()
        self._last_emitted_at.clear()


def gesture_to_event_type(gesture: str) -> str | None:
    if gesture == "Raise Hand":
        return "raise_hand"
    if gesture == "Thumbs Up":
        return "thumbs_up"
    if gesture == "Wave":
        return "wave"
    return None


def format_event_label(event_type: str, username: str) -> str:
    display_name = username or "Viewer"
    if event_type == "identity_appeared":
        return f"{display_name} appeared on stream"
    if event_type == "identity_disappeared":
        return f"{display_name} left the frame"
    if event_type == "unknown_face_detected":
        return "Unknown face detected"
    if event_type == "multiple_faces_detected":
        return "Multiple faces detected"
    if event_type == "raise_hand":
        return f"{username} raised hand"
    if event_type == "thumbs_up":
        return f"{username} gave thumbs up"
    if event_type == "wave":
        return f"{username} waved"
    return event_type.replace("_", " ").title()


interaction_event_service = InteractionEventService()
