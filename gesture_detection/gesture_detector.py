from __future__ import annotations

import logging
import time
from dataclasses import dataclass

import cv2
import mediapipe as mp
import numpy as np

from config.settings import GESTURE
from gesture_detection.wave_tracker import WaveTracker

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
        self._wave_trackers: dict[int, WaveTracker] = {}

    def detect(self, frame: np.ndarray) -> list[GestureEvent]:
        rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        result = self.hands.process(rgb_frame)
        now = time.perf_counter()

        if not result.multi_hand_landmarks:
            self._mark_all_wave_trackers_missed()
            return []

        events: list[GestureEvent] = []
        seen_hand_indices: set[int] = set()

        for hand_index, hand_landmarks in enumerate(result.multi_hand_landmarks):
            seen_hand_indices.add(hand_index)
            tracker = self._get_wave_tracker(hand_index)

            wrist = hand_landmarks.landmark[self.mp_hands.HandLandmark.WRIST]
            index_tip = hand_landmarks.landmark[self.mp_hands.HandLandmark.INDEX_FINGER_TIP]
            wave_x = wrist.x
            is_raise_hand = (
                wrist.y < GESTURE.raise_hand_y_threshold
                or index_tip.y < GESTURE.raise_hand_y_threshold
            )
            is_wave = tracker.observe(wave_x, wrist.y, now)

            if is_wave:
                logger.info("Wave detected on hand_index=%s wrist_y=%.3f", hand_index, wrist.y)
                events.append(GestureEvent(name="Wave", confidence=0.78))
            elif is_raise_hand:
                events.append(GestureEvent(name="Raise Hand", confidence=0.8))
            elif self._is_thumbs_up(hand_landmarks):
                events.append(GestureEvent(name="Thumbs Up", confidence=0.72))

        for hand_index, tracker in self._wave_trackers.items():
            if hand_index not in seen_hand_indices:
                tracker.mark_missed()

        return self._deduplicate(events)

    def close(self) -> None:
        self.hands.close()

    def _get_wave_tracker(self, hand_index: int) -> WaveTracker:
        tracker = self._wave_trackers.get(hand_index)
        if tracker is None:
            tracker = WaveTracker(
                window_seconds=GESTURE.wave_window_seconds,
                min_reversals=GESTURE.wave_min_reversals,
                min_peak_to_peak=GESTURE.wave_min_peak_to_peak,
                min_path_length=GESTURE.wave_min_path_length,
                max_wrist_y=GESTURE.wave_max_wrist_y,
                min_span_seconds=GESTURE.wave_min_span_seconds,
                cooldown_seconds=GESTURE.wave_cooldown_seconds,
                missed_frame_grace=GESTURE.wave_missed_frame_grace,
                min_samples=GESTURE.wave_min_samples,
                min_delta=GESTURE.wave_min_delta,
            )
            self._wave_trackers[hand_index] = tracker
        return tracker

    def _mark_all_wave_trackers_missed(self) -> None:
        for tracker in self._wave_trackers.values():
            tracker.mark_missed()

    def _is_thumbs_up(self, hand_landmarks) -> bool:
        landmarks = self.mp_hands.HandLandmark
        thumb_tip = hand_landmarks.landmark[landmarks.THUMB_TIP]
        thumb_ip = hand_landmarks.landmark[landmarks.THUMB_IP]
        thumb_mcp = hand_landmarks.landmark[landmarks.THUMB_MCP]

        # Normalized MediaPipe coordinates use smaller y values higher in the image.
        thumb_is_clearly_up = (
            thumb_tip.y < thumb_ip.y - 0.03
            and thumb_tip.y < thumb_mcp.y - 0.08
        )
        if not thumb_is_clearly_up:
            return False

        folded_fingers = 0
        for tip_name, pip_name in (
            ("INDEX_FINGER_TIP", "INDEX_FINGER_PIP"),
            ("MIDDLE_FINGER_TIP", "MIDDLE_FINGER_PIP"),
            ("RING_FINGER_TIP", "RING_FINGER_PIP"),
            ("PINKY_TIP", "PINKY_PIP"),
        ):
            tip = hand_landmarks.landmark[getattr(landmarks, tip_name)]
            pip = hand_landmarks.landmark[getattr(landmarks, pip_name)]
            if tip.y > pip.y + 0.02:
                folded_fingers += 1

        return folded_fingers >= 3

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
