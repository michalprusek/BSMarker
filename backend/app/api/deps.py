from typing import Generator, Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from pydantic import ValidationError
from sqlalchemy.orm import Session

from app.core import security
from app.core.config import settings
from app.db.session import SessionLocal
from app.models.project import Project
from app.models.user import User
from app.schemas.token import TokenPayload

reusable_oauth2 = OAuth2PasswordBearer(tokenUrl=f"{settings.API_V1_STR}/auth/login")


def get_db() -> Generator:
    try:
        db = SessionLocal()
        yield db
    finally:
        db.close()


def get_current_user(db: Session = Depends(get_db), token: str = Depends(reusable_oauth2)) -> User:
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        token_data = TokenPayload(**payload)
    except (JWTError, ValidationError):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Could not validate credentials",
        )
    user = db.query(User).filter(User.id == token_data.sub).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user


def get_current_active_user(
    current_user: User = Depends(get_current_user),
) -> User:
    if not current_user.is_active:
        raise HTTPException(status_code=400, detail="Inactive user")
    return current_user


def get_current_admin_user(
    current_user: User = Depends(get_current_user),
) -> User:
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="The user doesn't have enough privileges")
    return current_user


def check_project_edit_permission(db: Session, project: Project, current_user: User) -> None:
    """
    Check if the current user has permission to edit/delete a project or its contents.

    Rules:
    - Project owners can always edit their own projects
    - Admins can edit other admin's projects
    - Admins can only edit non-admin users' projects if ADMIN_CAN_EDIT_USER_PROJECTS is True

    Raises HTTPException 403 if permission denied.
    """
    # Owner can always edit their own project
    if project.owner_id == current_user.id:
        return

    # Non-admins can only edit their own projects
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Not enough permissions")

    # Admin trying to edit someone else's project
    # Check if config allows admins to edit user projects
    if settings.ADMIN_CAN_EDIT_USER_PROJECTS:
        return  # Admin can edit any project

    # Check if project owner is also an admin
    project_owner = db.query(User).filter(User.id == project.owner_id).first()
    if project_owner and project_owner.is_admin:
        return  # Admins can edit other admin's projects

    # Admin trying to edit a non-admin's project when not allowed
    raise HTTPException(
        status_code=403,
        detail="Admins cannot modify projects owned by regular users",
    )
