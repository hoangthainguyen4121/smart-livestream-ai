from __future__ import annotations

import time
from collections import deque
from typing import Any

import numpy as np

from app.project_paths import ensure_project_root_on_path

ensure_project_root_on_path()


WEB_RECOGNITION_INTERVAL_FRAMES = 2


class AIRuntime:
    def __init__(self, fps_window_size: int = 30) -> None:
        self.frame_count = 0
        self.cached_faces: list[dict[str, Any]] = []
        self.timestamps: deque[float] = deque(maxlen=fps_window_size)
        self._recognizer = None

    def process_frame(self, frame: np.ndarray) -> dict[str, Any]:
        started_at = time.perf_counter()
        self.frame_count += 1
        self.timestamps.append(started_at)

        if self._should_run_recognition():
            recognizer = self._get_recognizer()
            self.cached_faces = [
                self._serialize_face(result) for result in recognizer.recognize(frame)
            ]

        latency_ms = (time.perf_counter() - started_at) * 1000
        return {
            "type": "realtime_result",
            "faces": self.cached_faces,
            "gestures": [],
            "metrics": {
                "latency_ms": round(latency_ms, 2),
                "fps": round(self._average_fps(), 2),
            },
        }

    def _get_recognizer(self):
        if self._recognizer is None:
            from face_recognition.embedding_store import EmbeddingStore
            from face_recognition.recognizer import InsightFaceRecognizer

            self._recognizer = InsightFaceRecognizer(store=EmbeddingStore())

        return self._recognizer

    def _should_run_recognition(self) -> bool:
        interval = max(1, WEB_RECOGNITION_INTERVAL_FRAMES)
        return self.frame_count == 1 or self.frame_count % interval == 0

    def _average_fps(self) -> float:
        if len(self.timestamps) < 2:
            return 0.0

        elapsed = self.timestamps[-1] - self.timestamps[0]
        if elapsed <= 0:
            return 0.0

        return (len(self.timestamps) - 1) / elapsed

    @staticmethod
    def _serialize_face(result) -> dict[str, Any]:
        return {
            "username": result.label,
            "confidence": round(float(result.similarity), 4),
            "bbox": [
                int(result.bbox.x1),
                int(result.bbox.y1),
                int(result.bbox.x2),
                int(result.bbox.y2),
            ],
        }
