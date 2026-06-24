from __future__ import annotations

import logging
import queue
import threading
from typing import Callable

from face_recognition.recognizer import InsightFaceRecognizer, RecognitionResult
from utils.fps_monitor import FPSMonitor


logger = logging.getLogger(__name__)


class RecognitionWorker:
    def __init__(
        self,
        recognizer: InsightFaceRecognizer,
        *,
        on_results: Callable[[list[RecognitionResult]], None] | None = None,
    ) -> None:
        self.recognizer = recognizer
        self.on_results = on_results
        self._input_queue: queue.Queue[tuple[int, object]] = queue.Queue(maxsize=1)
        self._results_lock = threading.Lock()
        self._latest_results: list[RecognitionResult] = []
        self._result_version = 0
        self._recognition_fps = FPSMonitor()
        self._stop_event = threading.Event()
        self._thread = threading.Thread(
            target=self._run,
            name="recognition-worker",
            daemon=True,
        )

    def start(self) -> None:
        self._thread.start()
        logger.info("Recognition worker started")

    def stop(self) -> None:
        self._stop_event.set()
        self._thread.join(timeout=5.0)
        logger.info("Recognition worker stopped")

    def submit_frame(self, frame_id: int, frame) -> None:
        payload = (frame_id, frame.copy())
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

    def read_latest(self) -> list[RecognitionResult]:
        with self._results_lock:
            return list(self._latest_results)

    def read_recognition_fps(self) -> float:
        return self._recognition_fps.average_fps

    def read_version(self) -> int:
        with self._results_lock:
            return self._result_version

    def _run(self) -> None:
        while not self._stop_event.is_set():
            try:
                frame_id, frame = self._input_queue.get(timeout=0.05)
            except queue.Empty:
                continue

            frame_id, frame = self._drain_to_latest(frame_id, frame)

            try:
                results = self.recognizer.recognize(frame)
            except Exception:
                logger.exception("Recognition worker failed on frame_id=%s", frame_id)
                continue

            with self._results_lock:
                self._latest_results = results
                self._result_version += 1
            self._recognition_fps.update()

            if self.on_results is not None:
                try:
                    self.on_results(results)
                except Exception:
                    logger.exception("Recognition callback failed on frame_id=%s", frame_id)

    def _drain_to_latest(self, frame_id: int, frame):
        while True:
            try:
                frame_id, frame = self._input_queue.get_nowait()
            except queue.Empty:
                break
        return frame_id, frame
