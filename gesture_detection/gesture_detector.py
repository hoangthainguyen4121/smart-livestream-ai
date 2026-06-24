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


@dataclass(frozen=True)
class GestureDebugInfo:
    hand_open: bool
    wrist_dx: float
    direction_changes: int
    amplitude: float
    detected_gesture: str | None


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
        self.last_debug_entries: list[GestureDebugInfo] = []

    def detect(self, frame: np.ndarray) -> list[GestureEvent]:
        rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        result = self.hands.process(rgb_frame)
        now = time.perf_counter()
        self.last_debug_entries = []

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
            hand_open = self._is_open_hand(hand_landmarks)
            wave_x = wrist.x
            wave_debug = tracker.debug_state()
            is_raise_hand = (
                wrist.y < GESTURE.raise_hand_y_threshold
                or index_tip.y < GESTURE.raise_hand_y_threshold
            )
            is_wave = False
            if GESTURE.enable_wave_gesture:
                is_wave = hand_open and tracker.observe(
                    wave_x,
                    wrist.y,
                    now,
                    hand_open=hand_open,
                )
            detected_gesture: str | None = None

            if is_wave:
                detected_gesture = "Wave"
                logger.info(
                    "Wave detected hand_index=%s wrist_y=%.3f open=%s dx=%.3f "
                    "changes=%s amplitude=%.3f",
                    hand_index,
                    wrist.y,
                    hand_open,
                    wave_debug["wrist_dx"],
                    wave_debug["direction_changes"],
                    wave_debug["amplitude"],
                )
                events.append(GestureEvent(name="Wave", confidence=0.78))
            elif is_raise_hand:
                detected_gesture = "Raise Hand"
                events.append(GestureEvent(name="Raise Hand", confidence=0.8))
            elif self._is_thumbs_up(hand_landmarks):
                detected_gesture = "Thumbs Up"
                events.append(GestureEvent(name="Thumbs Up", confidence=0.72))

            debug_entry = GestureDebugInfo(
                hand_open=hand_open,
                wrist_dx=float(wave_debug["wrist_dx"]),
                direction_changes=int(wave_debug["direction_changes"]),
                amplitude=float(wave_debug["amplitude"]),
                detected_gesture=detected_gesture,
            )
            self.last_debug_entries.append(debug_entry)
            logger.debug(
                "Gesture debug hand_index=%s open=%s dx=%.3f changes=%s "
                "amplitude=%.3f detected=%s",
                hand_index,
                debug_entry.hand_open,
                debug_entry.wrist_dx,
                debug_entry.direction_changes,
                debug_entry.amplitude,
                debug_entry.detected_gesture,
            )

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
                min_wrist_y=GESTURE.wave_min_wrist_y,
                max_wrist_y=GESTURE.wave_max_wrist_y,
                min_span_seconds=GESTURE.wave_min_span_seconds,
                cooldown_seconds=GESTURE.wave_cooldown_seconds,
                missed_frame_grace=GESTURE.wave_missed_frame_grace,
                min_samples=GESTURE.wave_min_samples,
                max_samples=GESTURE.wave_max_samples,
                min_delta=GESTURE.wave_min_delta,
            )
            self._wave_trackers[hand_index] = tracker
        return tracker

    def _mark_all_wave_trackers_missed(self) -> None:
        for tracker in self._wave_trackers.values():
            tracker.mark_missed()

    def _is_open_hand(self, hand_landmarks) -> bool:
        landmarks = self.mp_hands.HandLandmark
        extended_fingers = 0
        for tip_name, pip_name in (
            ("INDEX_FINGER_TIP", "INDEX_FINGER_PIP"),
            ("MIDDLE_FINGER_TIP", "MIDDLE_FINGER_PIP"),
            ("RING_FINGER_TIP", "RING_FINGER_PIP"),
            ("PINKY_TIP", "PINKY_PIP"),
        ):
            tip = hand_landmarks.landmark[getattr(landmarks, tip_name)]
            pip = hand_landmarks.landmark[getattr(landmarks, pip_name)]
            if tip.y < pip.y - 0.02:
                extended_fingers += 1

        return extended_fingers >= 3

    def _is_thumbs_up(self, hand_landmarks) -> bool:
        landmarks = self.mp_hands.HandLandmark
        thumb_tip = hand_landmarks.landmark[landmarks.THUMB_TIP]
        thumb_ip = hand_landmarks.landmark[landmarks.THUMB_IP]
        thumb_mcp = hand_landmarks.landmark[landmarks.THUMB_MCP]

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
