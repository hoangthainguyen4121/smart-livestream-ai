from __future__ import annotations

import json
import logging
from collections import Counter
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any
from uuid import uuid4

import cv2
import numpy as np

from app.project_paths import ensure_project_root_on_path
from app.utils.image_codec import decode_data_url_frame

ensure_project_root_on_path()

from config.settings import DUPLICATE_IDENTITY_THRESHOLD, STORAGE  # noqa: E402
from face_recognition.embedding_store import EmbeddingStore  # noqa: E402
from face_recognition.recognizer import InsightFaceRecognizer  # noqa: E402


logger = logging.getLogger(__name__)

REQUIRED_POSES = ("front", "left", "right")
OPTIONAL_POSES = ("up", "down")
VALID_POSES = REQUIRED_POSES + OPTIONAL_POSES
MIN_ACCEPTED_SAMPLES = 5
MIN_FACE_SIZE_PX = 120
MIN_DETECTION_CONFIDENCE = 0.75
MIN_BLUR_VARIANCE = 80.0
MIN_BRIGHTNESS = 50.0
MAX_BRIGHTNESS = 205.0
MAX_DUPLICATE_SIMILARITY = 0.985


@dataclass(frozen=True)
class AcceptedFaceSample:
    pose: str
    embedding: np.ndarray


@dataclass
class FaceRegistrationSession:
    session_id: str
    display_name: str
    accepted_samples: list[AcceptedFaceSample] = field(default_factory=list)


@dataclass(frozen=True)
class FaceSampleMetrics:
    face_count: int
    bbox_width: int | None = None
    bbox_height: int | None = None
    detection_confidence: float | None = None
    blur_variance: float | None = None
    brightness: float | None = None
    duplicate_similarity: float | None = None

    def to_dict(self) -> dict[str, float | int | None]:
        return {
            "face_count": self.face_count,
            "bbox_width": self.bbox_width,
            "bbox_height": self.bbox_height,
            "detection_confidence": self.detection_confidence,
            "blur_variance": self.blur_variance,
            "brightness": self.brightness,
            "duplicate_similarity": self.duplicate_similarity,
        }


class WebFaceRegistrationService:
    def __init__(
        self,
        recognizer: Any | None = None,
        store: EmbeddingStore | None = None,
    ) -> None:
        self._recognizer = recognizer
        self._store = store or EmbeddingStore()
        self._sessions: dict[str, FaceRegistrationSession] = {}
        _session_storage_dir().mkdir(parents=True, exist_ok=True)

    def create_session(self, display_name: str) -> dict[str, Any]:
        normalized_display_name = display_name.strip()
        if not normalized_display_name:
            raise ValueError("Display name must not be empty.")

        session_id = str(uuid4())
        session = FaceRegistrationSession(
            session_id=session_id,
            display_name=normalized_display_name,
        )
        self._sessions[session_id] = session
        self._persist_session(session)
        logger.info("Created face registration session %s", session_id)
        return self._session_summary(session_id)

    def add_sample(self, session_id: str, pose: str, frame_payload: str) -> dict[str, Any]:
        session = self._get_session(session_id)
        if pose not in VALID_POSES:
            raise ValueError("Unsupported pose.")

        try:
            frame = decode_data_url_frame(frame_payload)
        except ValueError as error:
            return self._sample_response(
                session=session,
                accepted=False,
                reason=str(error),
                metrics=FaceSampleMetrics(face_count=0),
            )

        accepted, reason, face, metrics = self._validate_frame(session, frame)
        if accepted and face is not None:
            session.accepted_samples.append(
                AcceptedFaceSample(pose=pose, embedding=face.embedding)
            )
            self._persist_session(session)

        return self._sample_response(
            session=session,
            accepted=accepted,
            reason=reason,
            metrics=metrics,
        )

    def complete_session(self, session_id: str) -> dict[str, Any]:
        session = self._get_session(session_id)
        if not self._can_complete(session):
            raise ValueError(
                "Registration needs at least 5 samples, one front sample, and one left or right sample."
            )

        embeddings = np.vstack([sample.embedding for sample in session.accepted_samples])
        averaged_embedding = np.mean(embeddings, axis=0)
        averaged_embedding = self._get_recognizer()._normalize_embedding(averaged_embedding)
        duplicate_identity = self._find_duplicate_identity(averaged_embedding)
        if duplicate_identity is not None:
            username, _similarity = duplicate_identity
            raise ValueError(
                f"This face appears to already be registered as {username}."
            )

        embedding_path = self._store.save_user(
            session.display_name,
            averaged_embedding,
            len(session.accepted_samples),
        )
        self._get_recognizer().reload_registered_users()
        self._delete_session(session_id)

        return {
            "display_name": session.display_name,
            "samples": len(session.accepted_samples),
            "embedding_file": embedding_path.name,
        }

    def cancel_session(self, session_id: str) -> bool:
        existed = session_id in self._sessions or _session_file_path(session_id).exists()
        self._delete_session(session_id)
        return existed

    def clear(self) -> None:
        for session_id in list(self._sessions):
            self._delete_session(session_id)
        for path in _session_storage_dir().glob("*.json"):
            path.unlink(missing_ok=True)
        self._sessions.clear()

    def warmup_recognizer(self) -> None:
        self._get_recognizer()

    def _validate_frame(
        self,
        session: FaceRegistrationSession,
        frame: np.ndarray,
    ):
        faces = self._get_recognizer().detect_faces(frame)
        if len(faces) != 1:
            return (
                False,
                "Exactly one face must be visible.",
                None,
                FaceSampleMetrics(face_count=len(faces)),
            )

        face = faces[0]
        face_crop = frame[face.bbox.y1 : face.bbox.y2, face.bbox.x1 : face.bbox.x2]
        blur_variance = calculate_blur_variance(face_crop)
        brightness = calculate_brightness(face_crop)
        duplicate_similarity = self._max_duplicate_similarity(session, face.embedding)
        metrics = FaceSampleMetrics(
            face_count=1,
            bbox_width=face.bbox.width,
            bbox_height=face.bbox.height,
            detection_confidence=round(float(face.confidence), 4),
            blur_variance=round(blur_variance, 2),
            brightness=round(brightness, 2),
            duplicate_similarity=(
                round(duplicate_similarity, 4)
                if duplicate_similarity is not None
                else None
            ),
        )

        if face.bbox.width < MIN_FACE_SIZE_PX or face.bbox.height < MIN_FACE_SIZE_PX:
            return False, "Face is too small. Move closer to the camera.", face, metrics
        if face.confidence < MIN_DETECTION_CONFIDENCE:
            return False, "Face detection confidence is too low.", face, metrics
        if blur_variance < MIN_BLUR_VARIANCE:
            return False, "Image is too blurry. Hold still and try again.", face, metrics
        if brightness < MIN_BRIGHTNESS:
            return False, "Image is too dark. Improve lighting and try again.", face, metrics
        if brightness > MAX_BRIGHTNESS:
            return False, "Image is too bright. Reduce glare and try again.", face, metrics
        if (
            duplicate_similarity is not None
            and duplicate_similarity >= MAX_DUPLICATE_SIMILARITY
        ):
            return False, "Sample is too similar to an accepted sample.", face, metrics

        return True, "Sample accepted.", face, metrics

    def _get_session(self, session_id: str) -> FaceRegistrationSession:
        session = self._sessions.get(session_id)
        if session is None:
            session = self._load_session_from_disk(session_id)
        if session is None:
            logger.warning("Registration session not found: %s", session_id)
            raise KeyError("Registration session not found.")
        return session

    def _persist_session(self, session: FaceRegistrationSession) -> None:
        storage_dir = _session_storage_dir()
        storage_dir.mkdir(parents=True, exist_ok=True)
        payload = {
            "session_id": session.session_id,
            "display_name": session.display_name,
            "accepted_samples": [
                {
                    "pose": sample.pose,
                    "embedding": sample.embedding.astype(float).tolist(),
                }
                for sample in session.accepted_samples
            ],
        }
        _session_file_path(session.session_id).write_text(
            json.dumps(payload),
            encoding="utf-8",
        )

    def _load_session_from_disk(self, session_id: str) -> FaceRegistrationSession | None:
        path = _session_file_path(session_id)
        if not path.exists():
            return None

        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
            session = FaceRegistrationSession(
                session_id=str(payload["session_id"]),
                display_name=str(payload["display_name"]),
                accepted_samples=[
                    AcceptedFaceSample(
                        pose=str(sample["pose"]),
                        embedding=np.asarray(sample["embedding"], dtype=np.float32),
                    )
                    for sample in payload.get("accepted_samples", [])
                ],
            )
        except (KeyError, TypeError, ValueError, json.JSONDecodeError) as error:
            logger.warning("Unable to load registration session %s: %s", session_id, error)
            return None

        self._sessions[session.session_id] = session
        return session

    def _delete_session(self, session_id: str) -> None:
        self._sessions.pop(session_id, None)
        _session_file_path(session_id).unlink(missing_ok=True)

    def _get_recognizer(self):
        if self._recognizer is None:
            self._recognizer = InsightFaceRecognizer(store=self._store)
        return self._recognizer

    def _max_duplicate_similarity(
        self,
        session: FaceRegistrationSession,
        embedding: np.ndarray,
    ) -> float | None:
        if not session.accepted_samples:
            return None

        return max(
            cosine_similarity(embedding, sample.embedding)
            for sample in session.accepted_samples
        )

    def _find_duplicate_identity(
        self,
        embedding: np.ndarray,
    ) -> tuple[str, float] | None:
        existing_embeddings = self._store.load_embeddings()
        best_username = None
        best_similarity = -1.0

        for username, stored_embedding in existing_embeddings.items():
            similarity = cosine_similarity(embedding, stored_embedding)
            if similarity > best_similarity:
                best_username = username
                best_similarity = similarity

        if (
            best_username is not None
            and best_similarity >= DUPLICATE_IDENTITY_THRESHOLD
        ):
            return best_username, best_similarity

        return None

    def _session_summary(self, session_id: str) -> dict[str, Any]:
        session = self._get_session(session_id)
        return {
            "session_id": session.session_id,
            "display_name": session.display_name,
            "required_poses": list(REQUIRED_POSES),
            "optional_poses": list(OPTIONAL_POSES),
            "minimum_samples": MIN_ACCEPTED_SAMPLES,
            "accepted_count": len(session.accepted_samples),
            "pose_counts": self._pose_counts(session),
            "can_complete": self._can_complete(session),
        }

    def _sample_response(
        self,
        *,
        session: FaceRegistrationSession,
        accepted: bool,
        reason: str,
        metrics: FaceSampleMetrics,
    ) -> dict[str, Any]:
        return {
            "accepted": accepted,
            "reason": reason,
            "accepted_count": len(session.accepted_samples),
            "pose_counts": self._pose_counts(session),
            "can_complete": self._can_complete(session),
            "metrics": metrics.to_dict(),
        }

    @staticmethod
    def _pose_counts(session: FaceRegistrationSession) -> dict[str, int]:
        counts = Counter(sample.pose for sample in session.accepted_samples)
        return {pose: counts.get(pose, 0) for pose in VALID_POSES}

    @staticmethod
    def _can_complete(session: FaceRegistrationSession) -> bool:
        counts = Counter(sample.pose for sample in session.accepted_samples)
        return (
            len(session.accepted_samples) >= MIN_ACCEPTED_SAMPLES
            and counts.get("front", 0) >= 1
            and (counts.get("left", 0) >= 1 or counts.get("right", 0) >= 1)
        )


def _session_storage_dir() -> Path:
    return STORAGE.embeddings_dir.parent / "registration_sessions"


def _session_file_path(session_id: str) -> Path:
    return _session_storage_dir() / f"{session_id}.json"


def calculate_blur_variance(frame: np.ndarray) -> float:
    if frame.size == 0:
        return 0.0

    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    return float(cv2.Laplacian(gray, cv2.CV_64F).var())


def calculate_brightness(frame: np.ndarray) -> float:
    if frame.size == 0:
        return 0.0

    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    return float(np.mean(gray))


def cosine_similarity(first: np.ndarray, second: np.ndarray) -> float:
    first_norm = np.linalg.norm(first)
    second_norm = np.linalg.norm(second)
    if first_norm == 0 or second_norm == 0:
        return 0.0

    return float(np.dot(first, second) / (first_norm * second_norm))


face_registration_service = WebFaceRegistrationService()
