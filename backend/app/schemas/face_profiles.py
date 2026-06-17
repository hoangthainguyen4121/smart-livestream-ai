from pydantic import BaseModel


class FaceProfileResponse(BaseModel):
    username: str
    display_name: str
    samples: int
    embedding_file: str


class DeleteFaceProfileResponse(BaseModel):
    username: str
    deleted: bool
