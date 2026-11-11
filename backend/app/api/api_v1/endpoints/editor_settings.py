"""The annotation editor's view settings, per user: defaults and per recording."""

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session
from sqlalchemy.sql import func

from app.api import deps
from app.core.rate_limiter import RATE_LIMITS, limiter
from app.models.editor_settings import EditorDefaults, RecordingViewSettings
from app.models.project import Project
from app.models.recording import Recording
from app.models.user import User
from app.schemas.editor_settings import EditorDefaultsSettings, RecordingViewSettingsData

router = APIRouter()


def _check_can_view(db: Session, recording_id: int, user: User) -> None:
    """Allow the project owner or any admin, the same rule as reading annotations."""
    recording = db.query(Recording).filter(Recording.id == recording_id).first()
    if not recording:
        raise HTTPException(status_code=404, detail="Recording not found")
    project = db.query(Project).filter(Project.id == recording.project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    if not user.is_admin and project.owner_id != user.id:
        raise HTTPException(status_code=403, detail="Not enough permissions")


@router.get("/defaults", response_model=EditorDefaultsSettings)
@limiter.limit(RATE_LIMITS["crud_read"])
def read_defaults(
    request: Request,
    db: Session = Depends(deps.get_db),  # noqa: B008
    current_user: User = Depends(deps.get_current_active_user),  # noqa: B008
) -> Any:
    row = db.query(EditorDefaults).filter(EditorDefaults.user_id == current_user.id).first()
    return EditorDefaultsSettings.model_validate(row.settings if row else {})


@router.put("/defaults", response_model=EditorDefaultsSettings)
@limiter.limit(RATE_LIMITS["crud_write"])
def write_defaults(
    request: Request,
    settings_in: EditorDefaultsSettings,
    db: Session = Depends(deps.get_db),  # noqa: B008
    current_user: User = Depends(deps.get_current_active_user),  # noqa: B008
) -> Any:
    data = settings_in.model_dump(exclude_unset=True)
    stmt = insert(EditorDefaults).values(user_id=current_user.id, settings=data)
    db.execute(
        stmt.on_conflict_do_update(
            index_elements=["user_id"], set_={"settings": data, "updated_at": func.now()}
        )
    )
    db.commit()
    return EditorDefaultsSettings.model_validate(data)


# Only stored keys are returned, so the editor can tell "never set" from an explicit null.
@router.get(
    "/recordings/{recording_id}",
    response_model=RecordingViewSettingsData,
    response_model_exclude_unset=True,
)
@limiter.limit(RATE_LIMITS["crud_read"])
def read_recording_settings(
    request: Request,
    recording_id: int,
    db: Session = Depends(deps.get_db),  # noqa: B008
    current_user: User = Depends(deps.get_current_active_user),  # noqa: B008
) -> Any:
    _check_can_view(db, recording_id, current_user)
    row = (
        db.query(RecordingViewSettings)
        .filter(
            RecordingViewSettings.user_id == current_user.id,
            RecordingViewSettings.recording_id == recording_id,
        )
        .first()
    )
    return RecordingViewSettingsData.model_validate(row.settings if row else {})


@router.put(
    "/recordings/{recording_id}",
    response_model=RecordingViewSettingsData,
    response_model_exclude_unset=True,
)
@limiter.limit(RATE_LIMITS["crud_write"])
def write_recording_settings(
    request: Request,
    recording_id: int,
    settings_in: RecordingViewSettingsData,
    db: Session = Depends(deps.get_db),  # noqa: B008
    current_user: User = Depends(deps.get_current_active_user),  # noqa: B008
) -> Any:
    """Replace this user's settings for the recording (explicit nulls are kept)."""
    _check_can_view(db, recording_id, current_user)
    data = settings_in.model_dump(mode="json", exclude_unset=True)
    stmt = insert(RecordingViewSettings).values(
        user_id=current_user.id, recording_id=recording_id, settings=data
    )
    db.execute(
        stmt.on_conflict_do_update(
            index_elements=["user_id", "recording_id"],
            set_={"settings": data, "updated_at": func.now()},
        )
    )
    db.commit()
    return RecordingViewSettingsData.model_validate(data)
