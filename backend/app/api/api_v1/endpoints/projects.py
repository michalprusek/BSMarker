"""Project endpoints for BSMarker API."""

import io
import json
import logging
import os
import zipfile
from datetime import datetime
from typing import Any, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import StreamingResponse
from sqlalchemy import or_
from sqlalchemy.orm import Session, joinedload

from app.api import deps
from app.api.api_v1.endpoints.annotations import convert_annotation_orm_to_dict
from app.api.deps import check_project_edit_permission
from app.core.config import settings
from app.core.rate_limiter import RATE_LIMITS, limiter
from app.models.annotation import Annotation
from app.models.project import Project
from app.models.recording import Recording
from app.models.spectrogram import Spectrogram, SpectrogramStatus
from app.models.user import User
from app.schemas.project import Project as ProjectSchema
from app.schemas.project import ProjectCreate, ProjectUpdate
from app.services.minio_client import minio_client

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
        projects = (
            db.query(Project)
            .filter(Project.owner_id == current_user.id)
            .offset(skip)
            .limit(limit)
            .all()
        )
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
        name=project_in.name, description=project_in.description, owner_id=current_user.id
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

    # Use new permission check that respects ADMIN_CAN_EDIT_USER_PROJECTS setting
    check_project_edit_permission(db, project, current_user)

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

    # Use new permission check that respects ADMIN_CAN_EDIT_USER_PROJECTS setting
    check_project_edit_permission(db, project, current_user)

    logger.info(f"Deleting project {project_id} and all associated data")

    # Get all recordings for this project to delete their files
    recordings = db.query(Recording).filter(Recording.project_id == project_id).all()

    # Delete all MinIO files for recordings
    for recording in recordings:
        try:
            # Delete the audio file from MinIO
            minio_client.delete_file(
                bucket_name=settings.MINIO_BUCKET_RECORDINGS, object_name=recording.file_path
            )
            logger.info(f"Deleted audio file: {recording.file_path}")
        except Exception as e:
            logger.error(f"Failed to delete audio file {recording.file_path}: {str(e)}")
            # Continue even if file deletion fails

        # Get and delete spectrograms for this recording
        spectrograms = db.query(Spectrogram).filter(Spectrogram.recording_id == recording.id).all()

        for spectrogram in spectrograms:
            try:
                # Delete the spectrogram image from MinIO
                minio_client.delete_file(
                    bucket_name=settings.MINIO_BUCKET_SPECTROGRAMS,
                    object_name=spectrogram.image_path,
                )
                logger.info(f"Deleted spectrogram: {spectrogram.image_path}")
            except Exception as e:
                logger.error(f"Failed to delete spectrogram {spectrogram.image_path}: {str(e)}")
                # Continue even if file deletion fails

    # Delete the project (cascade will handle recordings, spectrograms, and annotations)
    db.delete(project)
    db.commit()

    logger.info(f"Successfully deleted project {project_id} with {len(recordings)} recordings")

    return {"message": "Project deleted successfully", "deleted_recordings": len(recordings)}


@router.get("/{project_id}/annotations/export")
@limiter.limit(RATE_LIMITS["bulk_operation"])
async def export_project_annotations(
    request: Request,
    project_id: int,
    include: str = Query(
        "annotations",
        regex="^(annotations|full)$",
        description="Export type: 'annotations' (JSON only) or 'full' (audio+spectrograms+annotations)",
    ),
    search: Optional[str] = Query(None, description="Search in filename"),
    min_duration: Optional[float] = Query(None, description="Minimum duration in seconds"),
    max_duration: Optional[float] = Query(None, description="Maximum duration in seconds"),
    annotation_status: Optional[str] = Query(
        None,
        regex="^(all|annotated|unannotated|finished)$",
        description="Filter by annotation status",
    ),
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user),
) -> StreamingResponse:
    """
    Export annotations (and optionally audio/spectrograms) for a project as a ZIP file.

    Supports filtering by search, duration, and annotation status.
    Returns a streaming ZIP file to minimize memory usage.
    """
    # Permission check
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    if not current_user.is_admin and project.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not enough permissions")

    logger.info(
        f"Starting export for project {project_id}, include={include}, filters=(search={search}, min_duration={min_duration}, max_duration={max_duration}, annotation_status={annotation_status})"
    )

    # Build query with same filtering logic as recordings endpoint
    query = db.query(Recording).filter(Recording.project_id == project_id)

    # Apply search filter
    if search:
        search_term = f"%{search}%"
        query = query.filter(
            or_(
                Recording.original_filename.ilike(search_term),
                Recording.filename.ilike(search_term),
            )
        )

    # Apply duration filters
    if min_duration is not None:
        query = query.filter(Recording.duration >= min_duration)
    if max_duration is not None:
        query = query.filter(Recording.duration <= max_duration)

    # Apply annotation status filter
    if annotation_status and annotation_status != "all":
        # Join with annotations to filter
        from sqlalchemy import exists, select

        if annotation_status == "annotated":
            # Has at least one annotation
            annotation_exists = exists(select(1).where(Annotation.recording_id == Recording.id))
            query = query.filter(annotation_exists)
        elif annotation_status == "unannotated":
            # Has no annotations
            annotation_exists = exists(select(1).where(Annotation.recording_id == Recording.id))
            query = query.filter(~annotation_exists)
        elif annotation_status == "finished":
            query = query.filter(Recording.is_finished == True)

    recordings = query.order_by(Recording.created_at.desc()).all()

    if not recordings:
        raise HTTPException(status_code=404, detail="No recordings found matching the filters")

    logger.info(f"Exporting {len(recordings)} recordings")

    # Create in-memory ZIP
    zip_buffer = io.BytesIO()

    try:
        with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zip_file:
            export_stats = {
                "total_recordings": len(recordings),
                "exported_annotations": 0,
                "exported_audio": 0,
                "exported_spectrograms": 0,
                "failed_spectrograms": 0,
                "skipped": 0,
                "errors": [],
            }

            for recording in recordings:
                try:
                    # Fetch annotations for this recording
                    annotations = (
                        db.query(Annotation)
                        .options(joinedload(Annotation.bounding_boxes))
                        .filter(Annotation.recording_id == recording.id)
                        .order_by(Annotation.created_at.asc())
                        .all()
                    )

                    # Skip recordings without annotations for annotations-only export
                    if include == "annotations" and not annotations:
                        export_stats["skipped"] += 1
                        continue

                    # Remove file extension from filename
                    base_filename = os.path.splitext(recording.original_filename)[0]

                    # Export annotations as JSON
                    if annotations:
                        annotation_dicts = [
                            convert_annotation_orm_to_dict(ann) for ann in annotations
                        ]
                        annotation_data = {
                            "recording_id": recording.id,
                            "filename": recording.original_filename,
                            "duration": recording.duration,
                            "sample_rate": recording.sample_rate,
                            "annotations": annotation_dicts,
                        }

                        json_filename = f"annotations/{base_filename}_annotations.json"
                        zip_file.writestr(
                            json_filename, json.dumps(annotation_data, indent=2, default=str)
                        )
                        export_stats["exported_annotations"] += 1

                    # If full export, include audio and spectrograms
                    if include == "full":
                        # Export audio file
                        try:
                            audio_data = minio_client.download_file(
                                bucket_name=settings.MINIO_BUCKET_RECORDINGS,
                                object_name=recording.file_path,
                            )
                            audio_filename = f"recordings/{recording.original_filename}"
                            zip_file.writestr(audio_filename, audio_data)
                            export_stats["exported_audio"] += 1
                        except Exception as audio_error:
                            logger.warning(
                                f"Failed to download audio for recording {recording.id}: {str(audio_error)}"
                            )
                            export_stats["errors"].append(
                                {
                                    "recording_id": recording.id,
                                    "filename": recording.original_filename,
                                    "error": f"Audio download failed: {str(audio_error)[:100]}",
                                }
                            )

                        # Export spectrogram if available
                        try:
                            spectrogram = (
                                db.query(Spectrogram)
                                .filter(
                                    Spectrogram.recording_id == recording.id,
                                    Spectrogram.status == SpectrogramStatus.COMPLETED,
                                )
                                .first()
                            )

                            if spectrogram:
                                spectrogram_data = minio_client.download_file(
                                    bucket_name=settings.MINIO_BUCKET_SPECTROGRAMS,
                                    object_name=spectrogram.image_path,
                                )
                                spectrogram_filename = (
                                    f"spectrograms/{base_filename}_spectrogram.png"
                                )
                                zip_file.writestr(spectrogram_filename, spectrogram_data)
                                export_stats["exported_spectrograms"] += 1
                        except (OSError, IOError, ConnectionError) as spectrogram_error:
                            # Handle expected I/O and connection errors for spectrogram download
                            db.rollback()
                            logger.error(
                                f"Failed to download spectrogram for recording {recording.id} "
                                f"({recording.original_filename}): {type(spectrogram_error).__name__}: {spectrogram_error}"
                            )
                            export_stats["failed_spectrograms"] += 1
                        except Exception as spectrogram_error:
                            # Log unexpected errors but don't fail the entire export
                            db.rollback()
                            logger.error(
                                f"Unexpected error downloading spectrogram for recording {recording.id} "
                                f"({recording.original_filename}): {type(spectrogram_error).__name__}: {spectrogram_error}"
                            )
                            export_stats["failed_spectrograms"] += 1

                except Exception as recording_error:
                    # Rollback the transaction to recover from InFailedSqlTransaction state
                    db.rollback()
                    logger.error(
                        f"Failed to export recording {recording.id}: {str(recording_error)}"
                    )
                    export_stats["errors"].append(
                        {
                            "recording_id": recording.id,
                            "filename": recording.original_filename,
                            "error": f"Export failed: {str(recording_error)[:100]}",
                        }
                    )
                    continue

            # Add export summary
            summary = {
                "project": {
                    "id": project.id,
                    "name": project.name,
                    "description": project.description,
                },
                "export_type": include,
                "filters": {
                    "search": search,
                    "min_duration": min_duration,
                    "max_duration": max_duration,
                    "annotation_status": annotation_status,
                },
                "statistics": export_stats,
                "exported_at": datetime.utcnow().isoformat(),
            }
            zip_file.writestr("export_summary.json", json.dumps(summary, indent=2, default=str))

        # Prepare ZIP for download
        zip_buffer.seek(0)

        # Generate filename
        export_type_suffix = "annotations" if include == "annotations" else "full_export"
        filename = f"project_{project_id}_{export_type_suffix}.zip"

        logger.info(f"Export completed for project {project_id}: {export_stats}")

        return StreamingResponse(
            io.BytesIO(zip_buffer.getvalue()),
            media_type="application/zip",
            headers={
                "Content-Disposition": f"attachment; filename={filename}",
                "X-Export-Stats": json.dumps(export_stats),
            },
        )

    except Exception as e:
        logger.error(f"Failed to create export for project {project_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Export failed: {str(e)}")
