from __future__ import annotations

import logging
import threading
import time
from dataclasses import dataclass

import numpy as np

from app.project_paths import ensure_project_root_on_path
from app.services.interaction_events import interaction_event_service

ensure_project_root_on_path()

from face_recognition.embedding_store import EmbeddingStore  # noqa: E402
from face_recognition.recognizer import InsightFaceRecognizer, RecognitionResult  # noqa: E402
from config.settings import GESTURE  # noqa: E402
from gesture_detection.gesture_detector import GestureDetector  # noqa: E402

logger = logging.getLogger(__name__)

RECOGNITION_INTERVAL_FRAMES = 3
GESTURE_INTERVAL_FRAMES = 1
GESTURE_OVERLAY_COOLDOWN_SECONDS = 1.0
IDENTITY_DISAPPEAR_GRACE_SECONDS = 1.0


@dataclass(frozen=True)
class InferenceSnapshot:
    frame_width: int
    frame_height: int
    primary_username: str
    faces: list[RecognitionResult]
    gesture_names: list[str]
    gesture_labels: list[str]
    processing_ms: float
    gesture_debug: list[dict[str, float | int | str | bool | None]]


class IdentityPresenceState:
    def __init__(self) -> None:
        self.visible_usernames: set[str] = set()
        self.missing_since: dict[str, float] = {}

    def update(self, current_usernames: set[str], now: float) -> None:
        for username in current_usernames:
            if username not in self.visible_usernames:
                interaction_event_service.append_event(
                    event_type="identity_appeared",
                    username=username,
                    now=now,
                )
            self.visible_usernames.add(username)
            self.missing_since.pop(username, None)

        for username in list(self.visible_usernames - current_usernames):
            missing_since = self.missing_since.setdefault(username, now)
            if now - missing_since >= IDENTITY_DISAPPEAR_GRACE_SECONDS:
                interaction_event_service.append_event(
                    event_type="identity_disappeared",
                    username=username,
                    now=now,
                )
                self.visible_usernames.discard(username)
                self.missing_since.pop(username, None)


class StreamInferenceService:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._recognizer: InsightFaceRecognizer | None = None
        self._gesture_detector: GestureDetector | None = None
        self._gesture_detector_failed = False
        self._frame_count = 0
        self._cached_recognition_results: list[RecognitionResult] = []
        self._active_gesture_overlays: dict[str, float] = {}
        self._identity_presence = IdentityPresenceState()

    def reset(self) -> None:
        with self._lock:
            self._frame_count = 0
            self._cached_recognition_results = []
            self._active_gesture_overlays = {}
            self._identity_presence = IdentityPresenceState()

    def warm_up(self) -> None:
        with self._lock:
            self._ensure_models()

    def process_frame(self, frame: np.ndarray) -> InferenceSnapshot:
        started_at = time.perf_counter()
        with self._lock:
            self._ensure_models()
            self._frame_count += 1

            if should_run_recognition(self._frame_count):
                assert self._recognizer is not None
                self._cached_recognition_results = self._recognizer.recognize(frame)
                update_face_interaction_events(
                    self._cached_recognition_results,
                    self._identity_presence,
                )

            primary_username = get_primary_username(self._cached_recognition_results)
            gesture_debug: list[dict[str, float | int | str | bool | None]] = []
            if self._gesture_detector is not None and should_run_gesture(self._frame_count):
                gesture_events = self._gesture_detector.detect(frame)
                gesture_debug = [
                    {
                        "hand_open": entry.hand_open,
                        "wrist_dx": entry.wrist_dx,
                        "direction_changes": entry.direction_changes,
                        "amplitude": entry.amplitude,
                        "detected_gesture": entry.detected_gesture,
                    }
                    for entry in self._gesture_detector.last_debug_entries
                ]
                update_active_gestures(
                    self._active_gesture_overlays,
                    gesture_events,
                    primary_username,
                )

            gesture_names, gesture_labels = get_visible_gesture_overlays(
                self._active_gesture_overlays,
                primary_username,
            )
            frame_height, frame_width = frame.shape[:2]
            processing_ms = (time.perf_counter() - started_at) * 1000.0

            return InferenceSnapshot(
                frame_width=frame_width,
                frame_height=frame_height,
                primary_username=primary_username,
                faces=list(self._cached_recognition_results),
                gesture_names=gesture_names,
                gesture_labels=gesture_labels,
                processing_ms=processing_ms,
                gesture_debug=gesture_debug,
            )

    def _ensure_models(self) -> None:
        if self._recognizer is None:
            logger.info("Loading InsightFace recognizer for stream inference")
            self._recognizer = InsightFaceRecognizer(store=EmbeddingStore())

        if self._gesture_detector is None and not self._gesture_detector_failed:
            try:
                logger.info("Loading GestureDetector for stream inference")
                self._gesture_detector = GestureDetector()
            except Exception:
                self._gesture_detector_failed = True
                logger.exception(
                    "GestureDetector unavailable for stream inference; continuing face-only"
                )


stream_inference_service = StreamInferenceService()


def should_run_recognition(frame_count: int) -> bool:
    return frame_count == 1 or frame_count % max(1, RECOGNITION_INTERVAL_FRAMES) == 0


def should_run_gesture(frame_count: int) -> bool:
    interval = max(1, GESTURE_INTERVAL_FRAMES)
    return frame_count % interval == 0


def update_face_interaction_events(
    recognition_results: list[RecognitionResult],
    identity_presence: IdentityPresenceState,
) -> None:
    now = time.perf_counter()
    known_usernames = {
        result.label
        for result in recognition_results
        if result.is_known
    }
    identity_presence.update(known_usernames, now)

    if len(recognition_results) >= 2:
        interaction_event_service.append_event(
            event_type="multiple_faces_detected",
            now=now,
        )


def update_active_gestures(
    active_gestures: dict[str, float],
    gesture_events,
    username: str,
) -> None:
    now = time.perf_counter()
    expired = [
        gesture_name
        for gesture_name, expires_at in active_gestures.items()
        if expires_at <= now
    ]
    for gesture_name in expired:
        active_gestures.pop(gesture_name, None)

    visible_events = suppress_conflicting_gestures(gesture_events)
    for event in visible_events:
        active_gestures[event.name] = now + GESTURE_OVERLAY_COOLDOWN_SECONDS
        interaction_event_service.append_gesture_event(
            username=username,
            gesture=event.name,
            now=now,
        )


def suppress_conflicting_gestures(gesture_events):
    filtered_events = [
        event
        for event in gesture_events
        if event.name != "Wave" or GESTURE.enable_wave_gesture
    ]
    has_wave = any(event.name == "Wave" for event in filtered_events)
    if has_wave:
        return [event for event in filtered_events if event.name == "Wave"]

    has_raise_hand = any(event.name == "Raise Hand" for event in filtered_events)
    if not has_raise_hand:
        return filtered_events

    return [event for event in filtered_events if event.name != "Thumbs Up"]


def get_primary_username(recognition_results: list[RecognitionResult]) -> str:
    for result in recognition_results:
        if result.is_known:
            return result.label
    if recognition_results:
        return recognition_results[0].label
    return "Viewer"


def format_gesture_label(username: str, gesture_name: str) -> str:
    if gesture_name == "Raise Hand":
        return f"{username} [hand] Raise Hand"
    if gesture_name == "Thumbs Up":
        return f"{username} [thumb] Thumbs Up"
    if gesture_name == "Wave":
        return f"{username} [wave] Wave"
    return f"{username} {gesture_name}"


def get_visible_gesture_overlays(
    active_gestures: dict[str, float],
    username: str,
) -> tuple[list[str], list[str]]:
    now = time.perf_counter()
    gesture_names = [
        gesture_name
        for gesture_name, expires_at in active_gestures.items()
        if expires_at > now
    ]
    gesture_labels = [
        format_gesture_label(username, gesture_name) for gesture_name in gesture_names
    ]
    return gesture_names, gesture_labels
