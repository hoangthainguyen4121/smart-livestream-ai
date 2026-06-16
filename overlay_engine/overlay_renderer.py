from __future__ import annotations

import cv2
import numpy as np

from config.settings import GESTURE, OVERLAY
from face_recognition.recognizer import FaceDetection, RecognitionResult


class OverlayRenderer:
    def draw_runtime_view(
        self,
        frame: np.ndarray,
        recognition_results: list[RecognitionResult],
        active_gesture_effects: dict[str, int],
        fps: float,
    ) -> np.ndarray:
        output = frame.copy()
        self._draw_faces(output, recognition_results)
        self._draw_gesture_effects(output, active_gesture_effects)
        self._draw_fps(output, fps)
        return output

    def draw_registration_status(
        self,
        frame: np.ndarray,
        faces: list[FaceDetection],
        status: str,
    ) -> np.ndarray:
        output = frame.copy()

        for face in faces:
            self._draw_box(output, face.bbox.x1, face.bbox.y1, face.bbox.x2, face.bbox.y2, (0, 180, 255))

        cv2.putText(
            output,
            status,
            (16, 32),
            cv2.FONT_HERSHEY_SIMPLEX,
            OVERLAY.font_scale,
            (255, 255, 255),
            OVERLAY.thickness,
            cv2.LINE_AA,
        )
        cv2.putText(
            output,
            "Press Q or ESC to cancel",
            (16, 64),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.55,
            (200, 200, 200),
            1,
            cv2.LINE_AA,
        )
        return output

    def _draw_faces(self, frame: np.ndarray, results: list[RecognitionResult]) -> None:
        for result in results:
            color = (0, 220, 0) if result.is_known else (0, 0, 255)
            self._draw_box(frame, result.bbox.x1, result.bbox.y1, result.bbox.x2, result.bbox.y2, color)

            label = result.label
            if result.is_known:
                label = f"{result.label} ({result.similarity:.2f})"

            text_origin = (result.bbox.x1, max(24, result.bbox.y1 - 10))
            cv2.putText(
                frame,
                label,
                text_origin,
                cv2.FONT_HERSHEY_SIMPLEX,
                OVERLAY.font_scale,
                color,
                OVERLAY.thickness,
                cv2.LINE_AA,
            )

    def _draw_gesture_effects(self, frame: np.ndarray, active_effects: dict[str, int]) -> None:
        if not active_effects:
            return

        height, width = frame.shape[:2]
        center = (width // 2, height // 6)

        for index, (gesture_name, frames_left) in enumerate(active_effects.items()):
            progress = frames_left / GESTURE.effect_duration_frames
            radius = int(35 + 35 * (1 - progress))
            y_offset = index * 58
            color = (255, 180, 0) if gesture_name == "Raise Hand" else (255, 0, 255)

            cv2.circle(frame, (center[0], center[1] + y_offset), radius, color, 3)
            cv2.putText(
                frame,
                gesture_name,
                (center[0] - 100, center[1] + y_offset + 8),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.8,
                color,
                2,
                cv2.LINE_AA,
            )

    def _draw_fps(self, frame: np.ndarray, fps: float) -> None:
        cv2.putText(
            frame,
            f"FPS: {fps:.1f}",
            OVERLAY.fps_position,
            cv2.FONT_HERSHEY_SIMPLEX,
            0.65,
            (0, 255, 255),
            2,
            cv2.LINE_AA,
        )

    @staticmethod
    def _draw_box(
        frame: np.ndarray,
        x1: int,
        y1: int,
        x2: int,
        y2: int,
        color: tuple[int, int, int],
    ) -> None:
        cv2.rectangle(frame, (x1, y1), (x2, y2), color, 2)
