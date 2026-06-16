from __future__ import annotations

import logging
from pathlib import Path

import cv2
import numpy as np

from config.settings import FACE, STORAGE
from face_recognition.embedding_store import EmbeddingStore
from face_recognition.recognizer import FaceDetection, InsightFaceRecognizer
from overlay_engine.overlay_renderer import OverlayRenderer
from utils.camera import Camera

logger = logging.getLogger(__name__)


class FaceRegistrar:
    def __init__(
        self,
        recognizer: InsightFaceRecognizer,
        store: EmbeddingStore | None = None,
        renderer: OverlayRenderer | None = None,
    ) -> None:
        self.recognizer = recognizer
        self.store = store or EmbeddingStore()
        self.renderer = renderer or OverlayRenderer()

    def register_from_webcam(self, username: str) -> Path:
        embeddings: list[np.ndarray] = []
        frame_count = 0
        user_capture_dir = STORAGE.captured_faces_dir / self._safe_dir_name(username)
        user_capture_dir.mkdir(parents=True, exist_ok=True)

        logger.info("Starting registration for user '%s'", username)

        with Camera() as camera:
            while len(embeddings) < FACE.registration_samples:
                frame = camera.read()
                frame_count += 1

                faces = self.recognizer.detect_faces(frame)
                status = (
                    f"Registering {username}: "
                    f"{len(embeddings)}/{FACE.registration_samples} samples"
                )

                if len(faces) == 1 and frame_count % FACE.registration_sample_interval == 0:
                    face = faces[0]
                    embeddings.append(face.embedding)
                    self._save_face_crop(
                        frame=frame,
                        face=face,
                        sample_number=len(embeddings),
                        output_dir=user_capture_dir,
                    )
                elif len(faces) > 1:
                    status = "Multiple faces detected. Keep only one face in frame."

                preview = self.renderer.draw_registration_status(frame, faces, status)
                cv2.imshow("Face Registration", preview)

                key = cv2.waitKey(1) & 0xFF
                if key in (ord("q"), 27):
                    raise RuntimeError("Registration cancelled by user")

        cv2.destroyWindow("Face Registration")

        averaged_embedding = np.mean(np.vstack(embeddings), axis=0)
        averaged_embedding = self.recognizer._normalize_embedding(averaged_embedding)
        embedding_path = self.store.save_user(username, averaged_embedding, len(embeddings))
        self.recognizer.reload_registered_users()

        logger.info("Registered user '%s' with %s samples", username, len(embeddings))
        return embedding_path

    @staticmethod
    def _save_face_crop(
        frame: np.ndarray,
        face: FaceDetection,
        sample_number: int,
        output_dir: Path,
    ) -> None:
        crop = frame[face.bbox.y1 : face.bbox.y2, face.bbox.x1 : face.bbox.x2]
        output_path = output_dir / f"{sample_number:03d}.jpg"
        cv2.imwrite(str(output_path), crop)

    @staticmethod
    def _safe_dir_name(username: str) -> str:
        return "".join(char if char.isalnum() or char in "-_" else "_" for char in username)
