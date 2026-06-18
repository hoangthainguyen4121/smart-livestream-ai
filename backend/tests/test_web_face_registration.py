from pathlib import Path
import base64
import sys
from types import SimpleNamespace

import cv2
from fastapi.testclient import TestClient
import numpy as np


BACKEND_ROOT = Path(__file__).resolve().parents[1]
PROJECT_ROOT = BACKEND_ROOT.parent

for path in (BACKEND_ROOT, PROJECT_ROOT):
    path_text = str(path)
    if path_text not in sys.path:
        sys.path.insert(0, path_text)

from app.api import face_registration as face_registration_api  # noqa: E402
from app.main import app  # noqa: E402
from app.services.web_face_registration import WebFaceRegistrationService  # noqa: E402
from utils.geometry import BoundingBox  # noqa: E402


client = TestClient(app)


class FakeRecognizer:
    def __init__(self, faces_by_call=None) -> None:
        self.faces_by_call = list(faces_by_call or [])
        self.reload_count = 0

    def detect_faces(self, frame):
        if self.faces_by_call:
            return self.faces_by_call.pop(0)

        return [create_face(create_embedding(1))]

    def reload_registered_users(self) -> None:
        self.reload_count += 1

    @staticmethod
    def _normalize_embedding(embedding):
        norm = np.linalg.norm(embedding)
        if norm == 0:
            return embedding.astype(np.float32)
        return (embedding / norm).astype(np.float32)


class FakeStore:
    def __init__(self, existing_embeddings=None) -> None:
        self.saved = []
        self.existing_embeddings = existing_embeddings or {}

    def save_user(self, username, embedding, samples):
        self.saved.append(
            {
                "username": username,
                "embedding": embedding,
                "samples": samples,
            }
        )
        return Path(f"{username.lower()}.npy")

    def load_embeddings(self):
        return self.existing_embeddings


def test_registration_service_accepts_valid_sample() -> None:
    service = WebFaceRegistrationService(
        recognizer=FakeRecognizer(),
        store=FakeStore(),
    )
    session = service.create_session("hoang")

    response = service.add_sample(
        session_id=session["session_id"],
        pose="front",
        frame_payload=create_test_frame_data_url(),
    )

    assert response["accepted"] is True
    assert response["accepted_count"] == 1
    assert response["pose_counts"]["front"] == 1


def test_registration_service_rejects_multiple_faces() -> None:
    service = WebFaceRegistrationService(
        recognizer=FakeRecognizer(
            faces_by_call=[
                [create_face(create_embedding(1)), create_face(create_embedding(2))]
            ]
        ),
        store=FakeStore(),
    )
    session = service.create_session("hoang")

    response = service.add_sample(
        session_id=session["session_id"],
        pose="front",
        frame_payload=create_test_frame_data_url(),
    )

    assert response["accepted"] is False
    assert response["reason"] == "Exactly one face must be visible."


def test_registration_service_rejects_duplicate_embedding() -> None:
    duplicate_embedding = create_embedding(1)
    service = WebFaceRegistrationService(
        recognizer=FakeRecognizer(
            faces_by_call=[
                [create_face(duplicate_embedding)],
                [create_face(duplicate_embedding)],
            ]
        ),
        store=FakeStore(),
    )
    session = service.create_session("hoang")

    first = service.add_sample(
        session_id=session["session_id"],
        pose="front",
        frame_payload=create_test_frame_data_url(),
    )
    second = service.add_sample(
        session_id=session["session_id"],
        pose="left",
        frame_payload=create_test_frame_data_url(),
    )

    assert first["accepted"] is True
    assert second["accepted"] is False
    assert second["reason"] == "Sample is too similar to an accepted sample."


def test_registration_service_completes_after_minimum_pose_requirements() -> None:
    store = FakeStore()
    service = WebFaceRegistrationService(
        recognizer=FakeRecognizer(
            faces_by_call=[
                [create_face(create_embedding(index))]
                for index in range(1, 6)
            ]
        ),
        store=store,
    )
    session = service.create_session("hoang")

    for pose in ("front", "left", "front", "right", "front"):
        service.add_sample(
            session_id=session["session_id"],
            pose=pose,
            frame_payload=create_test_frame_data_url(),
        )

    response = service.complete_session(session["session_id"])

    assert response["display_name"] == "hoang"
    assert response["samples"] == 5
    assert store.saved[0]["samples"] == 5


def test_registration_service_rejects_duplicate_existing_identity() -> None:
    store = FakeStore(existing_embeddings={"existing-user": unit_embedding(0)})
    service = WebFaceRegistrationService(
        recognizer=FakeRecognizer(
            faces_by_call=[
                [create_face(unit_embedding(angle))]
                for angle in (-20, -10, 0, 10, 20)
            ]
        ),
        store=store,
    )
    session = service.create_session("new-user")

    for pose in ("front", "left", "front", "right", "front"):
        service.add_sample(
            session_id=session["session_id"],
            pose=pose,
            frame_payload=create_test_frame_data_url(),
        )

    try:
        service.complete_session(session["session_id"])
        assert False, "Expected duplicate identity rejection"
    except ValueError as error:
        assert str(error) == (
            "This face appears to already be registered as existing-user."
        )

    assert store.saved == []


def test_registration_service_accepts_different_existing_identity() -> None:
    store = FakeStore(existing_embeddings={"different-user": unit_embedding(90)})
    service = WebFaceRegistrationService(
        recognizer=FakeRecognizer(
            faces_by_call=[
                [create_face(unit_embedding(angle))]
                for angle in (-20, -10, 0, 10, 20)
            ]
        ),
        store=store,
    )
    session = service.create_session("new-user")

    for pose in ("front", "left", "front", "right", "front"):
        service.add_sample(
            session_id=session["session_id"],
            pose=pose,
            frame_payload=create_test_frame_data_url(),
        )

    response = service.complete_session(session["session_id"])

    assert response["display_name"] == "new-user"
    assert store.saved[0]["username"] == "new-user"


def test_face_registration_api_create_sample_complete_and_cancel(monkeypatch) -> None:
    service = WebFaceRegistrationService(
        recognizer=FakeRecognizer(
            faces_by_call=[
                [create_face(create_embedding(index))]
                for index in range(1, 6)
            ]
        ),
        store=FakeStore(),
    )
    monkeypatch.setattr(face_registration_api, "face_registration_service", service)

    create_response = client.post(
        "/api/face-registration/sessions",
        json={"display_name": "hoang"},
    )
    assert create_response.status_code == 200
    session_id = create_response.json()["session_id"]

    sample_response = client.post(
        f"/api/face-registration/sessions/{session_id}/samples",
        json={
            "pose": "front",
            "frame": create_test_frame_data_url(),
        },
    )
    assert sample_response.status_code == 200
    assert sample_response.json()["accepted"] is True

    for pose in ("left", "front", "right", "front"):
        client.post(
            f"/api/face-registration/sessions/{session_id}/samples",
            json={
                "pose": pose,
                "frame": create_test_frame_data_url(),
            },
        )

    complete_response = client.post(
        f"/api/face-registration/sessions/{session_id}/complete"
    )
    assert complete_response.status_code == 200
    assert complete_response.json()["samples"] == 5

    cancel_response = client.post(
        "/api/face-registration/sessions",
        json={"display_name": "new-user"},
    )
    cancel_session_id = cancel_response.json()["session_id"]
    delete_response = client.delete(
        f"/api/face-registration/sessions/{cancel_session_id}"
    )
    assert delete_response.status_code == 200
    assert delete_response.json()["cancelled"] is True


def create_face(embedding, *, confidence=0.95, bbox=None):
    return SimpleNamespace(
        bbox=bbox or BoundingBox(40, 40, 220, 220),
        embedding=embedding,
        confidence=confidence,
    )


def create_embedding(seed: int):
    rng = np.random.default_rng(seed)
    embedding = rng.normal(size=8).astype(np.float32)
    return embedding / np.linalg.norm(embedding)


def unit_embedding(angle_degrees: float):
    angle = np.deg2rad(angle_degrees)
    return np.array([np.cos(angle), np.sin(angle)], dtype=np.float32)


def create_test_frame_data_url() -> str:
    image = np.full((260, 260, 3), 128, dtype=np.uint8)
    for y in range(0, 260, 8):
        for x in range(0, 260, 8):
            if (x // 8 + y // 8) % 2 == 0:
                image[y : y + 8, x : x + 8] = 80
            else:
                image[y : y + 8, x : x + 8] = 180

    ok, encoded = cv2.imencode(".jpg", image)
    assert ok
    payload = base64.b64encode(encoded.tobytes()).decode("ascii")
    return f"data:image/jpeg;base64,{payload}"
