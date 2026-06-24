from __future__ import annotations

import logging
import sys

import cv2


logger = logging.getLogger(__name__)


class DesktopCamera:
    def __init__(
        self,
        index: int = 0,
        width: int = 640,
        height: int = 480,
        max_grab: int = 5,
    ) -> None:
        self.index = index
        self.width = width
        self.height = height
        self.max_grab = max(1, max_grab)
        self.capture: cv2.VideoCapture | None = None

    def __enter__(self) -> "DesktopCamera":
        self.open()
        return self

    def __exit__(self, exc_type, exc_value, traceback) -> None:
        self.release()

    def open(self) -> None:
        logger.info("Opening desktop camera index=%s", self.index)
        if sys.platform == "win32":
            self.capture = cv2.VideoCapture(self.index, cv2.CAP_DSHOW)
        else:
            self.capture = cv2.VideoCapture(self.index)

        if self.capture is None or not self.capture.isOpened():
            raise RuntimeError(f"Unable to open camera index {self.index}")

        self.capture.set(cv2.CAP_PROP_FRAME_WIDTH, self.width)
        self.capture.set(cv2.CAP_PROP_FRAME_HEIGHT, self.height)

        actual_width = int(self.capture.get(cv2.CAP_PROP_FRAME_WIDTH))
        actual_height = int(self.capture.get(cv2.CAP_PROP_FRAME_HEIGHT))
        logger.info(
            "Desktop camera opened: index=%s resolution=%sx%s max_grab=%s",
            self.index,
            actual_width,
            actual_height,
            self.max_grab,
        )

    def read_latest(self):
        if self.capture is None:
            raise RuntimeError("Camera has not been opened")

        for _ in range(self.max_grab - 1):
            if not self.capture.grab():
                break

        ok, frame = self.capture.read()
        if not ok:
            logger.error("Desktop camera frame read failed")
            raise RuntimeError("Unable to read frame from camera")
        return frame

    def release(self) -> None:
        if self.capture is not None:
            self.capture.release()
            self.capture = None
            logger.info("Desktop camera released")
