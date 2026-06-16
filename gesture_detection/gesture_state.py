from config.settings import GESTURE
from gesture_detection.gesture_detector import GestureEvent


class GestureEffectState:
    def __init__(self) -> None:
        self.active_effects: dict[str, int] = {}

    def update(self, events: list[GestureEvent]) -> dict[str, int]:
        for event in events:
            self.active_effects[event.name] = GESTURE.effect_duration_frames

        expired: list[str] = []
        for name, frames_left in self.active_effects.items():
            next_value = frames_left - 1
            if next_value <= 0:
                expired.append(name)
            else:
                self.active_effects[name] = next_value

        for name in expired:
            self.active_effects.pop(name, None)

        return dict(self.active_effects)
