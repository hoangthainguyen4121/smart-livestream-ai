from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.exc import IntegrityError

from app.db.engine import get_session_factory
from app.db.models import User
from app.repositories.commerce_repository import CommerceRepository
from app.schemas.commerce import LoginRequest, RegisterRequest, TokenResponse, UserResponse
from app.services.auth_service import (
    get_current_user,
    hash_password,
    issue_token,
    normalize_email,
    verify_password,
)

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
def register(request: RegisterRequest) -> TokenResponse:
    with get_session_factory() as session:
        user = User(
            email=normalize_email(request.email),
            password_hash=hash_password(request.password),
            display_name=request.display_name.strip() if request.display_name else None,
        )
        session.add(user)
        try:
            session.commit()
        except IntegrityError as error:
            session.rollback()
            raise HTTPException(status_code=409, detail="Email is already registered.") from error
        session.refresh(user)
        token = issue_token(session, user)
        return TokenResponse(access_token=token, user=UserResponse.model_validate(user))


@router.post("/login", response_model=TokenResponse)
def login(request: LoginRequest) -> TokenResponse:
    with get_session_factory() as session:
        user = CommerceRepository(session).user_by_email(normalize_email(request.email))
        if user is None or not verify_password(user.password_hash, request.password):
            raise HTTPException(status_code=401, detail="Invalid email or password.")
        token = issue_token(session, user)
        return TokenResponse(access_token=token, user=UserResponse.model_validate(user))


@router.get("/me", response_model=UserResponse)
def me(user: User = Depends(get_current_user)) -> UserResponse:
    return UserResponse.model_validate(user)
