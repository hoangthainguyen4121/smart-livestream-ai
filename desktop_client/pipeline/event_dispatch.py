from __future__ import annotations

import logging
import queue
import threading

from desktop_client.event_publisher import EventPublisher
from face_recognition.recognizer import RecognitionResult


logger = logging.getLogger(__name__)


class AsyncEventDispatcher:
    def __init__(self, event_publisher: EventPublisher) -> None:
        self.event_publisher = event_publisher
        self._queue: queue.Queue[tuple[str, object]] = queue.Queue(maxsize=16)
        self._stop_event = threading.Event()
        self._thread = threading.Thread(
            target=self._run,
            name="event-dispatcher",
            daemon=True,
        )

    def start(self) -> None:
        self._thread.start()
        logger.info("Async event dispatcher started")

    def stop(self) -> None:
        self._stop_event.set()
        self._thread.join(timeout=5.0)
        self.event_publisher.flush()
        logger.info("Async event dispatcher stopped")

    def submit_recognition(self, results: list[RecognitionResult]) -> None:
        self._enqueue(("recognition", results))

    def submit_gestures(self, gesture_events, primary_username: str) -> None:
        self._enqueue(("gestures", (gesture_events, primary_username)))

    def _enqueue(self, item: tuple[str, object]) -> None:
        try:
            self._queue.put_nowait(item)
        except queue.Full:
            try:
                self._queue.get_nowait()
            except queue.Empty:
                pass
            try:
                self._queue.put_nowait(item)
            except queue.Full:
                logger.debug("Dropped desktop event queue item")

    def _run(self) -> None:
        while not self._stop_event.is_set():
            try:
                kind, payload = self._queue.get(timeout=0.2)
            except queue.Empty:
                self.event_publisher.flush_if_due()
                continue

            if kind == "recognition":
                self.event_publisher.on_recognition(payload)  # type: ignore[arg-type]
            elif kind == "gestures":
                gesture_events, primary_username = payload  # type: ignore[misc]
                self.event_publisher.on_gestures(gesture_events, primary_username)

            self.event_publisher.flush_if_due()
