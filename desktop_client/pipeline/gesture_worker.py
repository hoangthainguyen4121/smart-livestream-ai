from __future__ import annotations

import logging
import queue
import threading
from typing import Callable

from gesture_detection.gesture_detector import GestureDetector, GestureEvent


logger = logging.getLogger(__name__)


class GestureWorker:
    def __init__(
        self,
        gesture_detector: GestureDetector,
        *,
        on_gestures: Callable[[list[GestureEvent], str], None] | None = None,
        primary_username_provider: Callable[[], str] | None = None,
    ) -> None:
        self.gesture_detector = gesture_detector
        self.on_gestures = on_gestures
        self.primary_username_provider = primary_username_provider
        self._input_queue: queue.Queue[object] = queue.Queue(maxsize=1)
        self._events_lock = threading.Lock()
        self._latest_events: list[GestureEvent] = []
        self._stop_event = threading.Event()
        self._thread = threading.Thread(
            target=self._run,
            name="gesture-worker",
            daemon=True,
        )

    def start(self) -> None:
        self._thread.start()
        logger.info("Gesture worker started")

    def stop(self) -> None:
        self._stop_event.set()
        self._thread.join(timeout=5.0)
        logger.info("Gesture worker stopped")

    def submit_frame(self, frame) -> None:
        payload = frame.copy()
        try:
            self._input_queue.put_nowait(payload)
        except queue.Full:
            try:
                self._input_queue.get_nowait()
            except queue.Empty:
                pass
            try:
                self._input_queue.put_nowait(payload)
            except queue.Full:
                pass

    def read_latest(self) -> list[GestureEvent]:
        with self._events_lock:
            return list(self._latest_events)

    def _run(self) -> None:
        while not self._stop_event.is_set():
            try:
                frame = self._input_queue.get(timeout=0.05)
            except queue.Empty:
                continue

            frame = self._drain_to_latest(frame)

            try:
                events = self.gesture_detector.detect(frame)
            except Exception:
                logger.exception("Gesture worker failed")
                continue

            with self._events_lock:
                self._latest_events = events

            if self.on_gestures is not None and events:
                username = "Viewer"
                if self.primary_username_provider is not None:
                    username = self.primary_username_provider()
                try:
                    self.on_gestures(events, username)
                except Exception:
                    logger.exception("Gesture callback failed")

    def _drain_to_latest(self, frame):
        while True:
            try:
                frame = self._input_queue.get_nowait()
            except queue.Empty:
                break
        return frame
