from __future__ import annotations

import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerifyMismatchError
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlmodel import Session, select

from app.db.engine import get_session_factory
from app.db.models import AuthToken, User

TOKEN_TTL_DAYS = 7
_password_hasher = PasswordHasher()
_bearer = HTTPBearer(auto_error=False)


def normalize_email(email: str) -> str:
    return email.strip().lower()


def hash_password(password: str) -> str:
    return _password_hasher.hash(password)


def verify_password(password_hash: str, password: str) -> bool:
    try:
        return _password_hasher.verify(password_hash, password)
    except (VerifyMismatchError, InvalidHashError):
        return False


def token_digest(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def issue_token(session: Session, user: User) -> str:
    token = secrets.token_urlsafe(32)
    session.add(
        AuthToken(
            user_id=user.id,
            token_hash=token_digest(token),
            expires_at=datetime.now(timezone.utc) + timedelta(days=TOKEN_TTL_DAYS),
        )
    )
    session.commit()
    return token


def authenticate_token(session: Session, token: str) -> Optional[User]:
    now = datetime.now(timezone.utc)
    auth_token = session.exec(
        select(AuthToken).where(
            AuthToken.token_hash == token_digest(token),
            AuthToken.expires_at > now,
        )
    ).first()
    return session.get(User, auth_token.user_id) if auth_token else None


def get_optional_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(_bearer),
) -> Optional[User]:
    if credentials is None:
        return None
    with get_session_factory() as session:
        user = authenticate_token(session, credentials.credentials)
        if user is None:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid bearer token.")
        session.expunge(user)
        return user


def get_current_user(user: Optional[User] = Depends(get_optional_user)) -> User:
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required.")
    return user
