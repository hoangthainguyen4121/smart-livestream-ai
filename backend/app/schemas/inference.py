from __future__ import annotations

from typing import Optional

from pydantic import BaseModel


class InferenceFrameRequest(BaseModel):
    frame: str
    frame_id: Optional[int] = None
    sent_at_ms: Optional[float] = None


class BoundingBoxResponse(BaseModel):
    x1: int
    y1: int
    x2: int
    y2: int


class FaceInferenceResult(BaseModel):
    label: str
    similarity: Optional[float] = None
    is_known: bool
    bbox: BoundingBoxResponse


class GestureDebugResponse(BaseModel):
    hand_open: bool
    wrist_dx: float
    direction_changes: int
    amplitude: float
    detected_gesture: Optional[str] = None


class InferenceFrameResponse(BaseModel):
    frame_width: int
    frame_height: int
    primary_username: str
    faces: list[FaceInferenceResult]
    gestures: list[str]
    gesture_labels: list[str]
    processing_ms: float
    frame_id: Optional[int] = None
    gesture_debug: list[GestureDebugResponse] = []


class InferenceResetResponse(BaseModel):
    reset: bool
