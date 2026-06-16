from __future__ import annotations

import logging
from collections import deque
from dataclasses import dataclass

import cv2
import mediapipe as mp
import numpy as np

from config.settings import GESTURE

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class GestureEvent:
    name: str
    confidence: float


class GestureDetector:
    def __init__(self) -> None:
        log_mediapipe_compatibility()
        self.mp_hands = get_solutions_hands()
        self.hands = self.mp_hands.Hands(
            static_image_mode=False,
            max_num_hands=GESTURE.max_num_hands,
            min_detection_confidence=GESTURE.detection_confidence,
            min_tracking_confidence=GESTURE.tracking_confidence,
        )
        self.wrist_x_history: deque[float] = deque(maxlen=GESTURE.wave_window_size)

    def detect(self, frame: np.ndarray) -> list[GestureEvent]:
        rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        result = self.hands.process(rgb_frame)

        if not result.multi_hand_landmarks:
            self.wrist_x_history.clear()
            return []

        events: list[GestureEvent] = []

        for hand_landmarks in result.multi_hand_landmarks:
            wrist = hand_landmarks.landmark[self.mp_hands.HandLandmark.WRIST]
            index_tip = hand_landmarks.landmark[self.mp_hands.HandLandmark.INDEX_FINGER_TIP]

            if wrist.y < GESTURE.raise_hand_y_threshold or index_tip.y < GESTURE.raise_hand_y_threshold:
                events.append(GestureEvent(name="Raise Hand", confidence=0.8))

            self.wrist_x_history.append(wrist.x)
            if self._is_wave():
                events.append(GestureEvent(name="Wave", confidence=0.75))

        return self._deduplicate(events)

    def close(self) -> None:
        self.hands.close()

    def _is_wave(self) -> bool:
        if len(self.wrist_x_history) < self.wrist_x_history.maxlen:
            return False

        values = list(self.wrist_x_history)
        horizontal_motion = max(values) - min(values)
        if horizontal_motion < GESTURE.wave_min_horizontal_motion:
            return False

        deltas = np.diff(values)
        directions = [1 if delta > 0 else -1 for delta in deltas if abs(delta) > 0.01]
        direction_changes = sum(
            1 for previous, current in zip(directions, directions[1:]) if previous != current
        )

        return direction_changes >= GESTURE.wave_min_direction_changes

    @staticmethod
    def _deduplicate(events: list[GestureEvent]) -> list[GestureEvent]:
        best_by_name: dict[str, GestureEvent] = {}
        for event in events:
            current = best_by_name.get(event.name)
            if current is None or event.confidence > current.confidence:
                best_by_name[event.name] = event
        return list(best_by_name.values())


def get_mediapipe_version() -> str:
    return getattr(mp, "__version__", "unknown")


def has_solutions_hands() -> bool:
    solutions = getattr(mp, "solutions", None)
    return solutions is not None and hasattr(solutions, "hands")


def log_mediapipe_compatibility() -> None:
    logger.info("MediaPipe version: %s", get_mediapipe_version())
    logger.info("mediapipe.solutions.hands available: %s", has_solutions_hands())


def get_solutions_hands():
    if has_solutions_hands():
        return mp.solutions.hands

    raise RuntimeError(
        "Installed MediaPipe does not expose mediapipe.solutions.hands. "
        "Please run: pip install -r requirements.txt"
    )
