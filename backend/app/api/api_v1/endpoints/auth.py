"""Authentication endpoints for BSMarker API."""

from datetime import timedelta
from typing import Any

from app.api import deps
from app.core import security
from app.core.config import settings
from app.core.rate_limiter import get_rate_limit, limiter
from app.models.user import User
from app.schemas.token import Token
from app.schemas.user import User as UserSchema
from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session

router = APIRouter()


@router.post("/login", response_model=Token)
@limiter.limit(get_rate_limit("auth_login"))
def login_access_token(
    request: Request,
    db: Session = Depends(deps.get_db),
    form_data: OAuth2PasswordRequestForm = Depends(),
) -> Any:
    user = db.query(User).filter(User.email == form_data.username).first()
    if not user or not security.verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    if not user.is_active:
        raise HTTPException(status_code=400, detail="Inactive user")

    access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = security.create_access_token(
        data={"sub": str(user.id)}, expires_delta=access_token_expires
    )
    return {"access_token": access_token, "token_type": "bearer"}


@router.get("/me", response_model=UserSchema)
@limiter.limit(get_rate_limit("auth_me"))
def read_users_me(
    request: Request, current_user: User = Depends(deps.get_current_active_user)
) -> Any:
    return current_user
