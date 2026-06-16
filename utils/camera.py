import cv2
import logging

from config.settings import CAMERA

logger = logging.getLogger(__name__)


class Camera:
    def __init__(self, index: int = CAMERA.index) -> None:
        self.index = index
        self.capture: cv2.VideoCapture | None = None

    def __enter__(self) -> "Camera":
        self.open()
        return self

    def __exit__(self, exc_type, exc_value, traceback) -> None:
        self.release()

    def open(self) -> None:
        logger.info("Opening webcam...")
        self.capture = cv2.VideoCapture(self.index)
        self.capture.set(cv2.CAP_PROP_FRAME_WIDTH, CAMERA.width)
        self.capture.set(cv2.CAP_PROP_FRAME_HEIGHT, CAMERA.height)
        self.capture.set(cv2.CAP_PROP_FPS, CAMERA.fps)

        if not self.capture.isOpened():
            logger.error("Webcam failed to open: index=%s", self.index)
            raise RuntimeError(f"Unable to open camera index {self.index}")

        actual_width = int(self.capture.get(cv2.CAP_PROP_FRAME_WIDTH))
        actual_height = int(self.capture.get(cv2.CAP_PROP_FRAME_HEIGHT))
        actual_fps = self.capture.get(cv2.CAP_PROP_FPS)
        logger.info(
            "Webcam opened: index=%s resolution=%sx%s fps=%.2f",
            self.index,
            actual_width,
            actual_height,
            actual_fps,
        )

    def read(self):
        if self.capture is None:
            raise RuntimeError("Camera has not been opened")

        ok, frame = self.capture.read()
        if not ok:
            logger.error("Webcam frame read failed")
            raise RuntimeError("Unable to read frame from camera")
        return frame

    def release(self) -> None:
        if self.capture is not None:
            self.capture.release()
            self.capture = None
            logger.info("Webcam released")
