from __future__ import annotations

import logging
import time
from collections.abc import Generator

import cv2
import numpy as np
from fastapi import APIRouter
from fastapi.responses import StreamingResponse

from app.project_paths import ensure_project_root_on_path

ensure_project_root_on_path()

from config.settings import CAMERA  # noqa: E402
from face_recognition.embedding_store import EmbeddingStore  # noqa: E402
from face_recognition.recognizer import InsightFaceRecognizer  # noqa: E402
from gesture_detection.gesture_detector import GestureDetector  # noqa: E402


router = APIRouter(tags=["video-feed"])
logger = logging.getLogger(__name__)

BOUNDARY = "frame"
BLACK_FRAME_MEAN_THRESHOLD = 4.0
MJPEG_RECOGNITION_INTERVAL_FRAMES = 3
MJPEG_GESTURE_INTERVAL_FRAMES = 3
MJPEG_GESTURE_FRAME_OFFSET = 2
GESTURE_OVERLAY_COOLDOWN_SECONDS = 1.0


@router.get("/video-feed")
def video_feed() -> StreamingResponse:
    return StreamingResponse(
        stream_annotated_frames(),
        media_type=f"multipart/x-mixed-replace; boundary={BOUNDARY}",
    )


def stream_annotated_frames() -> Generator[bytes, None, None]:
    capture = open_webcam()
    recognizer: InsightFaceRecognizer | None = None
    gesture_detector: GestureDetector | None = None
    fps_meter = SimpleFPSMeter()
    frame_count = 0
    cached_recognition_results = []
    active_gesture_overlays: dict[str, float] = {}

    try:
        if not capture.isOpened():
            logger.error(
                "Unable to open webcam for MJPEG video feed. "
                "Camera may be used by browser Mode A, CLI, or another app."
            )
            yield encode_mjpeg_frame(
                create_error_frame(
                    "Unable to open webcam",
                    "Close browser camera, CLI, or other apps using the camera.",
                )
            )
            return

        log_camera_properties(capture)
        capture.set(cv2.CAP_PROP_FRAME_WIDTH, CAMERA.width)
        capture.set(cv2.CAP_PROP_FRAME_HEIGHT, CAMERA.height)
        capture.set(cv2.CAP_PROP_FPS, CAMERA.fps)

        recognizer = InsightFaceRecognizer(store=EmbeddingStore())
        try:
            gesture_detector = GestureDetector()
        except Exception:
            logger.exception("GestureDetector unavailable for MJPEG feed; continuing face-only")

        while True:
            ok, frame = read_frame_with_retries(capture)
            if not ok:
                logger.error(
                    "Unable to read webcam frame for MJPEG video feed. "
                    "Camera may be busy or unavailable."
                )
                yield encode_mjpeg_frame(
                    create_error_frame(
                        "Unable to read webcam frame",
                        "Close other camera users and reload Backend Annotated Stream.",
                    )
                )
                break

            frame_count += 1
            fps = fps_meter.update()
            if should_run_recognition(frame_count):
                cached_recognition_results = recognizer.recognize(frame)
            if gesture_detector is not None and should_run_gesture(frame_count):
                update_active_gestures(
                    active_gesture_overlays,
                    gesture_detector.detect(frame),
                )

            draw_recognition_overlay(frame, cached_recognition_results)
            draw_gesture_overlay(
                frame,
                active_gesture_overlays,
                get_primary_username(cached_recognition_results),
            )
            draw_fps(frame, fps)
            draw_dark_frame_warning(frame)

            yield encode_mjpeg_frame(frame)
    finally:
        if gesture_detector is not None:
            gesture_detector.close()
        capture.release()
        logger.info("Released webcam for MJPEG video feed")


def open_webcam():
    capture = cv2.VideoCapture(CAMERA.index, cv2.CAP_DSHOW)
    if capture.isOpened():
        logger.info("Opened webcam for MJPEG video feed with CAP_DSHOW")
        return capture

    logger.warning("CAP_DSHOW webcam open failed; retrying default backend")
    capture.release()
    capture = cv2.VideoCapture(CAMERA.index)
    if capture.isOpened():
        logger.info("Opened webcam for MJPEG video feed with default OpenCV backend")

    return capture


def log_camera_properties(capture) -> None:
    logger.info(
        "MJPEG webcam opened: index=%s width=%s height=%s fps=%s",
        CAMERA.index,
        int(capture.get(cv2.CAP_PROP_FRAME_WIDTH)),
        int(capture.get(cv2.CAP_PROP_FRAME_HEIGHT)),
        capture.get(cv2.CAP_PROP_FPS),
    )


def draw_recognition_overlay(frame, recognition_results) -> None:
    for result in recognition_results:
        color = (0, 220, 0) if result.is_known else (0, 0, 255)
        bbox = result.bbox
        label = result.label
        if result.is_known:
            label = f"{result.label} ({result.similarity:.2f})"

        cv2.rectangle(frame, (bbox.x1, bbox.y1), (bbox.x2, bbox.y2), color, 2)
        label_y = max(24, bbox.y1 - 10)
        cv2.putText(
            frame,
            label,
            (bbox.x1, label_y),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.7,
            color,
            2,
            cv2.LINE_AA,
        )


def should_run_recognition(frame_count: int) -> bool:
    return (
        frame_count == 1
        or frame_count % max(1, MJPEG_RECOGNITION_INTERVAL_FRAMES) == 0
    )


def should_run_gesture(frame_count: int) -> bool:
    interval = max(1, MJPEG_GESTURE_INTERVAL_FRAMES)
    return frame_count % interval == MJPEG_GESTURE_FRAME_OFFSET % interval


def update_active_gestures(active_gestures: dict[str, float], gesture_events) -> None:
    now = time.perf_counter()
    expired = [
        gesture_name
        for gesture_name, expires_at in active_gestures.items()
        if expires_at <= now
    ]
    for gesture_name in expired:
        active_gestures.pop(gesture_name, None)

    for event in gesture_events:
        active_gestures[event.name] = now + GESTURE_OVERLAY_COOLDOWN_SECONDS


def draw_gesture_overlay(
    frame,
    active_gestures: dict[str, float],
    username: str,
) -> None:
    now = time.perf_counter()
    visible_gestures = [
        gesture_name
        for gesture_name, expires_at in active_gestures.items()
        if expires_at > now
    ]
    for index, gesture_name in enumerate(visible_gestures):
        label = format_gesture_label(username, gesture_name)
        y = 70 + index * 38
        cv2.rectangle(frame, (18, y - 26), (360, y + 8), (255, 0, 255), -1)
        cv2.putText(
            frame,
            label,
            (28, y),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.75,
            (255, 255, 255),
            2,
            cv2.LINE_AA,
        )


def format_gesture_label(username: str, gesture_name: str) -> str:
    if gesture_name == "Raise Hand":
        return f"{username} [hand] Raise Hand"
    if gesture_name == "Wave":
        return f"{username} [wave] Wave"
    return f"{username} {gesture_name}"


def get_primary_username(recognition_results) -> str:
    for result in recognition_results:
        if result.is_known:
            return result.label
    if recognition_results:
        return recognition_results[0].label
    return "Viewer"


def draw_fps(frame, fps: float) -> None:
    cv2.putText(
        frame,
        f"FPS: {fps:.1f}",
        (20, 32),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.75,
        (0, 255, 255),
        2,
        cv2.LINE_AA,
    )


def draw_dark_frame_warning(frame) -> None:
    frame_mean = float(np.mean(frame))
    if frame_mean >= BLACK_FRAME_MEAN_THRESHOLD:
        return

    logger.warning("MJPEG webcam frame appears black or very dark: mean=%.2f", frame_mean)
    cv2.putText(
        frame,
        "Camera frame is black/dark",
        (20, 68),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.8,
        (0, 0, 255),
        2,
        cv2.LINE_AA,
    )


def encode_mjpeg_frame(frame) -> bytes:
    ok, buffer = cv2.imencode(".jpg", frame)
    if not ok:
        raise RuntimeError("Unable to encode MJPEG frame")

    return (
        f"--{BOUNDARY}\r\n"
        "Content-Type: image/jpeg\r\n\r\n"
    ).encode("utf-8") + buffer.tobytes() + b"\r\n"


def read_frame_with_retries(capture, attempts: int = 10):
    for _ in range(attempts):
        ok, frame = capture.read()
        if ok:
            return True, frame
        time.sleep(0.05)

    return False, None


def create_error_frame(message: str, hint: str | None = None):
    frame = np.full((240, 640, 3), 255, dtype=np.uint8)
    cv2.putText(
        frame,
        message,
        (24, 120),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.8,
        (0, 0, 255),
        2,
        cv2.LINE_AA,
    )
    if hint:
        cv2.putText(
            frame,
            hint,
            (24, 160),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.55,
            (80, 80, 80),
            1,
            cv2.LINE_AA,
        )
    return frame


class SimpleFPSMeter:
    def __init__(self) -> None:
        self.previous_timestamp: float | None = None
        self.fps = 0.0

    def update(self) -> float:
        now = time.perf_counter()
        if self.previous_timestamp is not None:
            elapsed = now - self.previous_timestamp
            if elapsed > 0:
                current_fps = 1.0 / elapsed
                self.fps = current_fps if self.fps == 0 else (self.fps * 0.8 + current_fps * 0.2)

        self.previous_timestamp = now
        return self.fps
