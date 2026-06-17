from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel


PoseName = Literal["front", "left", "right", "up", "down"]


class FaceRegistrationSessionCreateRequest(BaseModel):
    display_name: str


class FaceRegistrationSessionResponse(BaseModel):
    session_id: str
    display_name: str
    required_poses: list[str]
    optional_poses: list[str]
    minimum_samples: int
    accepted_count: int
    pose_counts: dict[str, int]
    can_complete: bool


class FaceRegistrationSampleRequest(BaseModel):
    pose: PoseName
    frame: str


class FaceRegistrationSampleMetrics(BaseModel):
    face_count: int
    bbox_width: Optional[int] = None
    bbox_height: Optional[int] = None
    detection_confidence: Optional[float] = None
    blur_variance: Optional[float] = None
    brightness: Optional[float] = None
    duplicate_similarity: Optional[float] = None


class FaceRegistrationSampleResponse(BaseModel):
    accepted: bool
    reason: str
    accepted_count: int
    pose_counts: dict[str, int]
    can_complete: bool
    metrics: FaceRegistrationSampleMetrics


class FaceRegistrationCompleteResponse(BaseModel):
    display_name: str
    samples: int
    embedding_file: str


class FaceRegistrationCancelResponse(BaseModel):
    session_id: str
    cancelled: bool
