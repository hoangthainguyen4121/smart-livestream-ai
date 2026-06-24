"""Legacy browser-camera inference API (POST /api/inference/frame).

The main demo uses Browser AR with local MediaPipe FaceLandmarker in the browser.
This endpoint remains for tests and the deprecated BrowserCameraStream component.
"""
from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException

from app.schemas.inference import (
    BoundingBoxResponse,
    FaceInferenceResult,
    GestureDebugResponse,
    InferenceFrameRequest,
    InferenceFrameResponse,
    InferenceResetResponse,
)
from app.services.stream_inference import stream_inference_service
from app.utils.image_codec import decode_data_url_frame


router = APIRouter(prefix="/inference", tags=["inference"])
logger = logging.getLogger(__name__)


@router.post("/frame", response_model=InferenceFrameResponse)
def infer_frame(request: InferenceFrameRequest) -> InferenceFrameResponse:
    try:
        frame = decode_data_url_frame(request.frame)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error

    try:
        snapshot = stream_inference_service.process_frame(frame)
    except Exception as error:
        logger.exception("Frame inference failed")
        raise HTTPException(
            status_code=500,
            detail="Frame inference failed.",
        ) from error

    return InferenceFrameResponse(
        frame_width=snapshot.frame_width,
        frame_height=snapshot.frame_height,
        primary_username=snapshot.primary_username,
        faces=[
            FaceInferenceResult(
                label=result.label,
                similarity=result.similarity if result.is_known else None,
                is_known=result.is_known,
                bbox=BoundingBoxResponse(
                    x1=result.bbox.x1,
                    y1=result.bbox.y1,
                    x2=result.bbox.x2,
                    y2=result.bbox.y2,
                ),
            )
            for result in snapshot.faces
        ],
        gestures=snapshot.gesture_names,
        gesture_labels=snapshot.gesture_labels,
        processing_ms=round(snapshot.processing_ms, 2),
        frame_id=request.frame_id,
        gesture_debug=[
            GestureDebugResponse(
                hand_open=bool(entry["hand_open"]),
                wrist_dx=float(entry["wrist_dx"]),
                direction_changes=int(entry["direction_changes"]),
                amplitude=float(entry["amplitude"]),
                detected_gesture=entry.get("detected_gesture"),
            )
            for entry in snapshot.gesture_debug
        ],
    )


@router.post("/reset", response_model=InferenceResetResponse)
def reset_inference_state() -> InferenceResetResponse:
    stream_inference_service.reset()
    return InferenceResetResponse(reset=True)
