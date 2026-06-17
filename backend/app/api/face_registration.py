from fastapi import APIRouter, HTTPException

from app.schemas.face_registration import (
    FaceRegistrationCancelResponse,
    FaceRegistrationCompleteResponse,
    FaceRegistrationSampleRequest,
    FaceRegistrationSampleResponse,
    FaceRegistrationSessionCreateRequest,
    FaceRegistrationSessionResponse,
)
from app.services.web_face_registration import face_registration_service


router = APIRouter(prefix="/face-registration", tags=["face-registration"])


@router.post("/sessions", response_model=FaceRegistrationSessionResponse)
def create_face_registration_session(
    request: FaceRegistrationSessionCreateRequest,
) -> dict:
    try:
        return face_registration_service.create_session(request.display_name)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@router.post(
    "/sessions/{session_id}/samples",
    response_model=FaceRegistrationSampleResponse,
)
def add_face_registration_sample(
    session_id: str,
    request: FaceRegistrationSampleRequest,
) -> dict:
    try:
        return face_registration_service.add_sample(
            session_id=session_id,
            pose=request.pose,
            frame_payload=request.frame,
        )
    except KeyError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@router.post(
    "/sessions/{session_id}/complete",
    response_model=FaceRegistrationCompleteResponse,
)
def complete_face_registration_session(session_id: str) -> dict:
    try:
        return face_registration_service.complete_session(session_id)
    except KeyError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@router.delete(
    "/sessions/{session_id}",
    response_model=FaceRegistrationCancelResponse,
)
def cancel_face_registration_session(session_id: str) -> FaceRegistrationCancelResponse:
    cancelled = face_registration_service.cancel_session(session_id)
    if not cancelled:
        raise HTTPException(status_code=404, detail="Registration session not found.")

    return FaceRegistrationCancelResponse(session_id=session_id, cancelled=True)
