from typing import Any, List
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from app.api import deps
from app.models.project import Project
from app.models.recording import Recording
from app.models.spectrogram import Spectrogram
from app.models.user import User
from app.schemas.project import Project as ProjectSchema, ProjectCreate, ProjectUpdate
from app.core.rate_limiter import limiter, RATE_LIMITS
from app.core.config import settings
from app.services.minio_client import minio_client
import logging

router = APIRouter()
logger = logging.getLogger(__name__)

@router.get("/", response_model=List[ProjectSchema])
@limiter.limit(RATE_LIMITS["crud_read"])
def read_projects(
    request: Request,
    db: Session = Depends(deps.get_db),
    skip: int = 0,
    limit: int = 100,
    current_user: User = Depends(deps.get_current_active_user),
) -> Any:
    if current_user.is_admin:
        projects = db.query(Project).offset(skip).limit(limit).all()
    else:
        projects = db.query(Project).filter(
            Project.owner_id == current_user.id
        ).offset(skip).limit(limit).all()
    return projects

@router.post("/", response_model=ProjectSchema)
@limiter.limit(RATE_LIMITS["crud_write"])
def create_project(
    *,
    request: Request,
    db: Session = Depends(deps.get_db),
    project_in: ProjectCreate,
    current_user: User = Depends(deps.get_current_active_user),
) -> Any:
    project = Project(
        name=project_in.name,
        description=project_in.description,
        owner_id=current_user.id
    )
    db.add(project)
    db.commit()
    db.refresh(project)
    return project

@router.get("/{project_id}", response_model=ProjectSchema)
@limiter.limit(RATE_LIMITS["crud_read"])
def read_project(
    request: Request,
    project_id: int,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user),
) -> Any:
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    if not current_user.is_admin and project.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not enough permissions")
    return project

@router.put("/{project_id}", response_model=ProjectSchema)
@limiter.limit(RATE_LIMITS["crud_write"])
def update_project(
    *,
    request: Request,
    db: Session = Depends(deps.get_db),
    project_id: int,
    project_in: ProjectUpdate,
    current_user: User = Depends(deps.get_current_active_user),
) -> Any:
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    if not current_user.is_admin and project.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not enough permissions")
    
    update_data = project_in.dict(exclude_unset=True)
    for field, value in update_data.items():
        setattr(project, field, value)
    
    db.add(project)
    db.commit()
    db.refresh(project)
    return project

@router.delete("/{project_id}")
@limiter.limit(RATE_LIMITS["crud_write"])
def delete_project(
    request: Request,
    project_id: int,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user),
) -> Any:
    """
    Delete a project and all its associated data including:
    - All recordings
    - All spectrograms
    - All annotations
    - All files in MinIO storage
    """
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    if not current_user.is_admin and project.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not enough permissions")
    
    logger.info(f"Deleting project {project_id} and all associated data")
    
    # Get all recordings for this project to delete their files
    recordings = db.query(Recording).filter(Recording.project_id == project_id).all()
    
    # Delete all MinIO files for recordings
    for recording in recordings:
        try:
            # Delete the audio file from MinIO
            minio_client.delete_file(
                bucket_name=settings.MINIO_BUCKET_RECORDINGS,
                object_name=recording.file_path
            )
            logger.info(f"Deleted audio file: {recording.file_path}")
        except Exception as e:
            logger.error(f"Failed to delete audio file {recording.file_path}: {str(e)}")
            # Continue even if file deletion fails
        
        # Get and delete spectrograms for this recording
        spectrograms = db.query(Spectrogram).filter(
            Spectrogram.recording_id == recording.id
        ).all()
        
        for spectrogram in spectrograms:
            try:
                # Delete the spectrogram image from MinIO
                minio_client.delete_file(
                    bucket_name=settings.MINIO_BUCKET_SPECTROGRAMS,
                    object_name=spectrogram.image_path
                )
                logger.info(f"Deleted spectrogram: {spectrogram.image_path}")
            except Exception as e:
                logger.error(f"Failed to delete spectrogram {spectrogram.image_path}: {str(e)}")
                # Continue even if file deletion fails
    
    # Delete the project (cascade will handle recordings, spectrograms, and annotations)
    db.delete(project)
    db.commit()
    
    logger.info(f"Successfully deleted project {project_id} with {len(recordings)} recordings")
    
    return {
        "message": "Project deleted successfully",
        "deleted_recordings": len(recordings)
    }