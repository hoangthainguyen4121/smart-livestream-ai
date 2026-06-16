from __future__ import annotations

import logging
from dataclasses import dataclass

import cv2
import numpy as np
from insightface.app import FaceAnalysis

from config.settings import FACE
from face_recognition.embedding_store import EmbeddingStore
from utils.geometry import BoundingBox

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class FaceDetection:
    bbox: BoundingBox
    embedding: np.ndarray
    confidence: float


@dataclass(frozen=True)
class RecognitionResult:
    bbox: BoundingBox
    label: str
    similarity: float
    is_known: bool


class InsightFaceRecognizer:
    def __init__(self, store: EmbeddingStore | None = None) -> None:
        self.store = store or EmbeddingStore()
        self.registered_embeddings = self.store.load_embeddings()
        self.model = FaceAnalysis(
            name=FACE.insightface_model,
            providers=list(FACE.providers),
        )
        self.model.prepare(ctx_id=0, det_size=FACE.detection_size)
        logger.info("InsightFace model loaded: %s", FACE.insightface_model)

    def reload_registered_users(self) -> None:
        self.registered_embeddings = self.store.load_embeddings()
        logger.info("Loaded %s registered users", len(self.registered_embeddings))

    def detect_faces(self, frame: np.ndarray) -> list[FaceDetection]:
        rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        detected_faces = self.model.get(rgb_frame)
        frame_height, frame_width = frame.shape[:2]
        faces: list[FaceDetection] = []

        for face in detected_faces:
            x1, y1, x2, y2 = face.bbox.astype(int).tolist()
            bbox = BoundingBox(x1, y1, x2, y2).clamp(frame_width, frame_height)

            if bbox.width < FACE.min_face_size or bbox.height < FACE.min_face_size:
                continue

            embedding = self._normalize_embedding(face.embedding)
            faces.append(
                FaceDetection(
                    bbox=bbox,
                    embedding=embedding,
                    confidence=float(getattr(face, "det_score", 0.0)),
                )
            )

        return faces

    def recognize(self, frame: np.ndarray) -> list[RecognitionResult]:
        results: list[RecognitionResult] = []

        for face in self.detect_faces(frame):
            label, similarity = self._match(face.embedding)
            is_known = similarity >= FACE.recognition_threshold
            results.append(
                RecognitionResult(
                    bbox=face.bbox,
                    label=label if is_known else "Unknown",
                    similarity=similarity,
                    is_known=is_known,
                )
            )

        return results

    def _match(self, embedding: np.ndarray) -> tuple[str, float]:
        if not self.registered_embeddings:
            return "Unknown", 0.0

        best_label = "Unknown"
        best_similarity = -1.0

        for username, stored_embedding in self.registered_embeddings.items():
            similarity = self._cosine_similarity(embedding, stored_embedding)
            if similarity > best_similarity:
                best_label = username
                best_similarity = similarity

        return best_label, best_similarity

    @staticmethod
    def _normalize_embedding(embedding: np.ndarray) -> np.ndarray:
        norm = np.linalg.norm(embedding)
        if norm == 0:
            return embedding.astype(np.float32)
        return (embedding / norm).astype(np.float32)

    @staticmethod
    def _cosine_similarity(first: np.ndarray, second: np.ndarray) -> float:
        first_norm = np.linalg.norm(first)
        second_norm = np.linalg.norm(second)

        if first_norm == 0 or second_norm == 0:
            return 0.0

        return float(np.dot(first, second) / (first_norm * second_norm))
