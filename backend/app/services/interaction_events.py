from __future__ import annotations

import time
from collections import deque
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Literal
from uuid import uuid4


MAX_RECENT_EVENTS = 50
GESTURE_EVENT_COOLDOWN_SECONDS = 2.5
GestureName = Literal["Raise Hand", "Wave"]


@dataclass(frozen=True)
class InteractionEvent:
    id: str
    type: str
    username: str
    gesture: GestureName
    label: str
    created_at: str

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
        cooldown_seconds: float = GESTURE_EVENT_COOLDOWN_SECONDS,
    ) -> None:
        self._events: deque[InteractionEvent] = deque(maxlen=max_events)
        self._cooldown_seconds = cooldown_seconds
        self._last_emitted_at: dict[tuple[str, str], float] = {}

    def append_gesture_event(
        self,
        *,
        username: str,
        gesture: str,
        now: float | None = None,
    ) -> InteractionEvent | None:
        if gesture not in ("Raise Hand", "Wave"):
            return None

        normalized_username = username.strip() or "Viewer"
        current_time = time.perf_counter() if now is None else now
        cooldown_key = (normalized_username, gesture)
        previous_time = self._last_emitted_at.get(cooldown_key)
        if (
            previous_time is not None
            and current_time - previous_time < self._cooldown_seconds
        ):
            return None

        event = InteractionEvent(
            id=str(uuid4()),
            type="gesture",
            username=normalized_username,
            gesture=gesture,
            label=format_gesture_event_label(normalized_username, gesture),
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


def format_gesture_event_label(username: str, gesture: str) -> str:
    if gesture == "Raise Hand":
        return f"{username} raised hand"
    if gesture == "Wave":
        return f"{username} waved"
    return f"{username} {gesture}"


interaction_event_service = InteractionEventService()
