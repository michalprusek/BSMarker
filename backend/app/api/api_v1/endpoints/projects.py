"""Project endpoints for BSMarker API."""

import json
import logging
import os
import re
from datetime import datetime
from stat import S_IFREG
from typing import Any, Dict, Generator, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import StreamingResponse
from sqlalchemy import exists, or_, select
from sqlalchemy.orm import Session, joinedload
from stream_zip import ZIP_32, stream_zip

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


def _sanitize_filename(filename: str) -> str:
    """
    Sanitize filename to prevent path traversal attacks (Zip Slip).

    Removes directory separators and path traversal sequences to ensure
    files are extracted only within the target directory.

    Args:
        filename: Original filename that may contain malicious paths

    Returns:
        Safe filename with path separators replaced by underscores
    """
    # Remove path traversal sequences and directory separators
    safe_name = re.sub(r'[/\\]', '_', filename)
    # Remove any remaining dots at the start (e.g., "..file")
    safe_name = re.sub(r'^\.+', '', safe_name)
    # Ensure we have a valid filename
    return safe_name if safe_name else 'unnamed_file'


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


def _create_streaming_export_generator(
    export_data: List[Dict],
    project_info: Dict,
    include: str,
    filters: Dict,
) -> Generator:
    """
    Generator that yields ZIP member files for streaming export.

    Uses stream-zip for true streaming without loading entire ZIP into memory.
    All database queries are performed BEFORE this generator starts to avoid
    session lifecycle issues with FastAPI's dependency injection.

    Args:
        export_data: Pre-fetched list of dicts with recording info, annotations, and spectrogram paths
        project_info: Dict with project id, name, description
        include: Export type ('annotations' or 'full')
        filters: Dict with search, min_duration, max_duration, annotation_status

    Yields:
        Tuples for stream_zip: (filename, modified_at, mode, ZIP_32, (data,))
    """
    modified_at = datetime.now()
    mode = S_IFREG | 0o644

    export_stats = {
        "total_recordings": len(export_data),
        "exported_annotations": 0,
        "exported_audio": 0,
        "exported_spectrograms": 0,
        "failed_spectrograms": 0,
        "skipped": 0,
        "errors": [],
        "has_errors": False,
    }

    total = len(export_data)

    for idx, item in enumerate(export_data):
        recording_id = item["recording_id"]
        original_filename = item["original_filename"]
        file_path = item["file_path"]
        annotations = item["annotations"]
        spectrogram_path = item.get("spectrogram_path")

        try:
            # Log progress every 100 recordings
            if idx % 100 == 0:
                logger.info(f"Export progress: {idx}/{total} recordings processed")

            # Skip recordings without annotations for annotations-only export
            if include == "annotations" and not annotations:
                export_stats["skipped"] += 1
                continue

            # Sanitize filename to prevent path traversal attacks (Zip Slip)
            safe_filename = _sanitize_filename(original_filename)
            base_filename = os.path.splitext(safe_filename)[0]

            # Export annotations as JSON
            if annotations:
                annotation_data = {
                    "recording_id": recording_id,
                    "filename": original_filename,
                    "duration": item["duration"],
                    "sample_rate": item["sample_rate"],
                    "annotations": annotations,
                }

                json_content = json.dumps(annotation_data, indent=2, default=str).encode("utf-8")
                json_filename = f"annotations/{base_filename}_annotations.json"

                yield (json_filename, modified_at, mode, ZIP_32, (json_content,))
                export_stats["exported_annotations"] += 1

            # If full export, include audio and spectrograms
            if include == "full":
                # Export audio file
                try:
                    audio_data = minio_client.download_file(
                        bucket_name=settings.MINIO_BUCKET_RECORDINGS,
                        object_name=file_path,
                    )
                    audio_filename = f"recordings/{safe_filename}"
                    yield (audio_filename, modified_at, mode, ZIP_32, (audio_data,))
                    export_stats["exported_audio"] += 1

                except Exception as audio_error:
                    logger.error(
                        f"Failed to download audio for recording {recording_id} "
                        f"({original_filename}): {type(audio_error).__name__}: {audio_error}"
                    )
                    export_stats["errors"].append(
                        {
                            "recording_id": recording_id,
                            "filename": original_filename,
                            "type": "audio",
                            "error": f"Audio download failed: {str(audio_error)[:200]}",
                        }
                    )
                    export_stats["has_errors"] = True

                # Export spectrogram if available
                if spectrogram_path:
                    try:
                        spectrogram_data = minio_client.download_file(
                            bucket_name=settings.MINIO_BUCKET_SPECTROGRAMS,
                            object_name=spectrogram_path,
                        )
                        spectrogram_filename = f"spectrograms/{base_filename}_spectrogram.png"
                        yield (spectrogram_filename, modified_at, mode, ZIP_32, (spectrogram_data,))
                        export_stats["exported_spectrograms"] += 1

                    except Exception as spectrogram_error:
                        logger.error(
                            f"Failed to download spectrogram for recording {recording_id} "
                            f"({original_filename}): {type(spectrogram_error).__name__}: {spectrogram_error}"
                        )
                        export_stats["failed_spectrograms"] += 1
                        export_stats["errors"].append(
                            {
                                "recording_id": recording_id,
                                "filename": original_filename,
                                "type": "spectrogram",
                                "error": f"Spectrogram download failed: {str(spectrogram_error)[:200]}",
                            }
                        )
                        export_stats["has_errors"] = True

        except Exception as recording_error:
            logger.error(
                f"Failed to export recording {recording_id} ({original_filename}): "
                f"{type(recording_error).__name__}: {recording_error}"
            )
            export_stats["errors"].append(
                {
                    "recording_id": recording_id,
                    "filename": original_filename,
                    "type": "general",
                    "error": f"Export failed: {str(recording_error)[:200]}",
                }
            )
            export_stats["has_errors"] = True
            continue

    # Add export summary as the last file
    summary = {
        "project": project_info,
        "export_type": include,
        "filters": filters,
        "statistics": export_stats,
        "exported_at": datetime.utcnow().isoformat(),
        "complete": not export_stats["has_errors"],
    }
    summary_content = json.dumps(summary, indent=2, default=str).encode("utf-8")
    yield ("export_summary.json", modified_at, mode, ZIP_32, (summary_content,))

    if export_stats["has_errors"]:
        logger.warning(f"Export completed with errors: {export_stats}")
    else:
        logger.info(f"Export completed successfully: {export_stats}")


@router.get("/{project_id}/annotations/export")
@limiter.limit(RATE_LIMITS["export_operation"])
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
    Returns a TRUE streaming ZIP file - data is sent as it's generated,
    minimizing memory usage for large projects (1000+ recordings).

    Note: All database queries are performed before streaming starts to avoid
    session lifecycle issues with FastAPI's dependency injection.
    """
    logger.info(
        f"Export endpoint called: project_id={project_id}, user_id={current_user.id}, "
        f"is_admin={current_user.is_admin}"
    )

    # Permission check
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    if not current_user.is_admin and project.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not enough permissions")

    logger.info(
        f"Starting streaming export for project {project_id}, include={include}, "
        f"filters=(search={search}, min_duration={min_duration}, "
        f"max_duration={max_duration}, annotation_status={annotation_status})"
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
        if annotation_status == "annotated":
            annotation_exists = exists(select(1).where(Annotation.recording_id == Recording.id))
            query = query.filter(annotation_exists)
        elif annotation_status == "unannotated":
            annotation_exists = exists(select(1).where(Annotation.recording_id == Recording.id))
            query = query.filter(~annotation_exists)
        elif annotation_status == "finished":
            query = query.filter(Recording.is_finished.is_(True))

    recordings = query.order_by(Recording.created_at.desc()).all()

    if not recordings:
        raise HTTPException(status_code=404, detail="No recordings found matching the filters")

    logger.info(f"Preparing streaming export for {len(recordings)} recordings")

    # Pre-fetch all data BEFORE the generator starts to avoid session lifecycle issues
    # FastAPI closes the DB session after the endpoint returns, but the generator
    # continues executing. By extracting all data now, we avoid DetachedInstanceError.
    export_data = []
    for recording in recordings:
        # Fetch annotations for this recording
        annotations = (
            db.query(Annotation)
            .options(joinedload(Annotation.bounding_boxes))
            .filter(Annotation.recording_id == recording.id)
            .order_by(Annotation.created_at.asc())
            .all()
        )

        # Convert annotations to dicts while session is still active
        annotation_dicts = [convert_annotation_orm_to_dict(ann) for ann in annotations]

        # Get spectrogram path if doing full export
        spectrogram_path = None
        if include == "full":
            spectrogram = (
                db.query(Spectrogram)
                .filter(
                    Spectrogram.recording_id == recording.id,
                    Spectrogram.status == SpectrogramStatus.COMPLETED,
                )
                .first()
            )
            if spectrogram:
                spectrogram_path = spectrogram.image_path

        export_data.append({
            "recording_id": recording.id,
            "original_filename": recording.original_filename,
            "file_path": recording.file_path,
            "duration": recording.duration,
            "sample_rate": recording.sample_rate,
            "annotations": annotation_dicts,
            "spectrogram_path": spectrogram_path,
        })

    # Extract project info while session is active
    project_info = {
        "id": project.id,
        "name": project.name,
        "description": project.description,
    }

    filters = {
        "search": search,
        "min_duration": min_duration,
        "max_duration": max_duration,
        "annotation_status": annotation_status,
    }

    # Generate filename
    export_type_suffix = "annotations" if include == "annotations" else "full_export"
    filename = f"project_{project_id}_{export_type_suffix}.zip"

    # Create streaming ZIP generator with pre-fetched data
    member_files_generator = _create_streaming_export_generator(
        export_data=export_data,
        project_info=project_info,
        include=include,
        filters=filters,
    )

    # Use stream_zip for true streaming (no memory buffering)
    zipped_chunks = stream_zip(member_files_generator)

    return StreamingResponse(
        zipped_chunks,
        media_type="application/zip",
        headers={
            "Content-Disposition": f"attachment; filename={filename}",
            "X-Total-Recordings": str(len(recordings)),
        },
    )
