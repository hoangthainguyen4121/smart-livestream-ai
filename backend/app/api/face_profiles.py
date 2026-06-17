from fastapi import APIRouter, HTTPException

from app.project_paths import ensure_project_root_on_path
from app.schemas.face_profiles import DeleteFaceProfileResponse, FaceProfileResponse

ensure_project_root_on_path()

from face_recognition.embedding_store import EmbeddingStore  # noqa: E402


router = APIRouter(prefix="/face-profiles", tags=["face-profiles"])


@router.get("", response_model=list[FaceProfileResponse])
def list_face_profiles() -> list[FaceProfileResponse]:
    users = EmbeddingStore().list_users()
    return [
        FaceProfileResponse(
            username=user.username,
            display_name=user.display_name,
            samples=user.samples,
            embedding_file=user.embedding_path.name,
        )
        for user in users
    ]


@router.delete("/{username}", response_model=DeleteFaceProfileResponse)
def delete_face_profile(username: str) -> DeleteFaceProfileResponse:
    deleted = EmbeddingStore().delete_user(username)
    if not deleted:
        raise HTTPException(status_code=404, detail="Face profile not found")

    return DeleteFaceProfileResponse(username=username, deleted=True)
