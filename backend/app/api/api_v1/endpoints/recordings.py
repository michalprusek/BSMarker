"""Recording endpoints for BSMarker API."""

import logging
import os
import tempfile
import time
import uuid
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Dict, Iterator, List, Optional

from fastapi import APIRouter, Depends, File, HTTPException, Query, Request, UploadFile
from fastapi.responses import Response
from sqlalchemy import func, or_
from sqlalchemy.orm import InstrumentedAttribute, Session

from app.api import deps
from app.api.deps import check_project_edit_permission
from app.core.config import settings
from app.core.rate_limiter import RATE_LIMITS, limiter
from app.models.annotation import Annotation
from app.models.project import Project
from app.models.recording import Recording
from app.models.user import User
from app.schemas.pagination import PaginatedResponse, PaginationMetadata
from app.schemas.recording import Recording as RecordingSchema
from app.services.audio_service import audio_service
from app.services.cache_service import cache_service
from app.services.minio_client import minio_client

# Set cache directory for numba/librosa to avoid permission issues in Docker
os.environ["NUMBA_CACHE_DIR"] = "/tmp"

router = APIRouter()
logger = logging.getLogger(__name__)


@contextmanager
def secure_temp_file(suffix: str = "", prefix: str = "bsmarker_") -> Iterator[Path]:
    """
    Create a secure temporary file with path validation.

    Ensures the file stays within the system temp directory.
    """
    temp_file = None
    try:
        temp_file = tempfile.NamedTemporaryFile(delete=False, suffix=suffix, prefix=prefix)
        temp_path = Path(temp_file.name)

        # Validate that the path is within the temp directory
        temp_dir = Path(tempfile.gettempdir()).resolve()
        if not temp_path.resolve().is_relative_to(temp_dir):
            raise ValueError("Temporary file path is outside allowed directory")

        yield temp_path
    finally:
        if temp_file:
            temp_file.close()
            try:
                if temp_path.exists():
                    temp_path.unlink()
            except PermissionError as e:
                logger.error(
                    f"Permission denied deleting temp file {temp_path}: {e}",
                    extra={"temp_file": str(temp_path)},
                )
            except OSError as e:
                logger.error(
                    f"OS error deleting temp file {temp_path}: {e}",
                    extra={"temp_file": str(temp_path), "errno": e.errno},
                )
            except Exception as e:
                logger.error(
                    f"Unexpected error deleting temp file {temp_path}: {e}",
                    extra={"temp_file": str(temp_path)},
                    exc_info=True,
                )


def validate_file_extension(filename: str) -> str:
    """
    Validate and sanitize file extension.

    Returns a safe extension string.
    """
    if not filename:
        raise ValueError("Filename cannot be empty")

    # Extract extension and sanitize
    extension = os.path.splitext(filename)[1].lower()

    # Remove any path separators or dangerous characters
    extension = extension.replace("/", "").replace("\\", "").replace("..", "")

    # Validate against allowed extensions
    if extension not in settings.ALLOWED_AUDIO_EXTENSIONS:
        raise ValueError(f"File extension not allowed: {extension}")

    return extension


@router.post("/{project_id}/upload", response_model=RecordingSchema)
async def upload_recording(
    request: Request,
    project_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user),
) -> Any:
    upload_start_time = time.time()
    logger.info("=== UPLOAD ENDPOINT HIT ===")
    logger.info(f"Starting upload of {file.filename} ({file.size} bytes) to project {project_id}")
    logger.info(f"User: {current_user.email}")
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    # Use shared permission check that respects ADMIN_CAN_EDIT_USER_PROJECTS setting
    check_project_edit_permission(db, project, current_user)

    # Validate file extension securely
    try:
        file_extension = validate_file_extension(file.filename)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e

    # Check for empty files
    if file.size == 0:
        raise HTTPException(
            status_code=400, detail="File is empty. Please select a valid audio file"
        )

    if file.size > settings.MAX_UPLOAD_SIZE:
        raise HTTPException(
            status_code=400,
            detail=f"File too large. Maximum size: {settings.MAX_UPLOAD_SIZE} bytes",
        )

    unique_filename = f"{uuid.uuid4()}{file_extension}"
    file_path = f"project_{project_id}/{unique_filename}"

    file_read_start = time.time()
    contents = await file.read()
    logger.info(f"File read completed in {time.time() - file_read_start:.2f}s")

    # Upload file to MinIO with enhanced error handling
    minio_start = time.time()
    try:
        # Log connection details (without sensitive data)
        logger.info(
            f"MinIO upload attempt - Endpoint: {settings.MINIO_ENDPOINT}, "
            f"Bucket: {settings.MINIO_BUCKET_RECORDINGS}"
        )

        success = minio_client.upload_file(
            bucket_name=settings.MINIO_BUCKET_RECORDINGS,
            object_name=file_path,
            data=contents,
            content_type=file.content_type,
        )
        if not success:
            logger.error(f"MinIO upload returned False for {file_path}")
            raise HTTPException(status_code=500, detail="Failed to upload file to storage")
        logger.info(f"MinIO upload completed in {time.time() - minio_start:.2f}s")
    except HTTPException:
        raise  # Re-raise HTTP exceptions as-is
    except Exception as e:
        logger.error(f"MinIO upload error for {file_path}: {str(e)}", exc_info=True)
        # Provide more specific error messages
        error_msg = str(e)
        if "Connection" in error_msg or "refused" in error_msg.lower():
            raise HTTPException(
                status_code=503, detail="Storage service temporarily unavailable. Please try again."
            ) from e
        elif "Access" in error_msg or "credentials" in error_msg.lower():
            raise HTTPException(
                status_code=500, detail="Storage authentication error. Please contact support."
            ) from e
        else:
            raise HTTPException(
                status_code=500, detail=f"Storage error: {error_msg[:100]}"
            ) from e  # Limit error message length

    # Extract audio metadata using centralized service
    audio_analysis_start = time.time()
    duration: Optional[float]
    sr: Optional[int]
    try:
        audio_metadata = audio_service.extract_audio_metadata_from_bytes(contents, file_extension)
        duration = audio_metadata.duration
        sr = audio_metadata.sample_rate
        logger.info(
            f"Audio analysis completed in {time.time() - audio_analysis_start:.2f}s - "
            f"Duration: {duration:.2f}s, Sample Rate: {sr}"
        )
    except Exception as e:
        logger.error(f"Audio analysis failed: {str(e)}")
        duration = None
        sr = None

    db_start = time.time()
    recording = Recording(
        filename=unique_filename,
        original_filename=file.filename,
        file_path=file_path,
        # The SQLAlchemy mypy plugin leaves Float's type variable unresolved.
        duration=duration,  # type: ignore[arg-type]
        sample_rate=sr,
        project_id=project_id,
    )
    db.add(recording)
    db.commit()
    db.refresh(recording)
    logger.info(f"Database operations completed in {time.time() - db_start:.2f}s")

    # Invalidate cache for this project
    cache_service.invalidate_project_recordings(project_id)

    total_time = time.time() - upload_start_time
    logger.info(f"Upload completed for {file.filename} - Total time: {total_time:.2f}s")
    return recording


@router.get("/{project_id}/recordings", response_model=PaginatedResponse[RecordingSchema])
@limiter.limit(RATE_LIMITS["crud_read"])
def read_recordings(
    request: Request,
    project_id: int,
    db: Session = Depends(deps.get_db),
    skip: int = 0,
    limit: int = 50,
    search: Optional[str] = Query(None, description="Search in filename"),
    min_duration: Optional[float] = Query(None, description="Minimum duration in seconds"),
    max_duration: Optional[float] = Query(None, description="Maximum duration in seconds"),
    annotation_status: Optional[str] = Query(
        None, description="Filter by annotation status: annotated, unannotated, finished"
    ),
    sort_by: Optional[str] = Query(
        "created_at", description="Sort field: created_at, filename, duration"
    ),
    sort_order: Optional[str] = Query("desc", description="Sort order: asc or desc"),
    current_user: User = Depends(deps.get_current_active_user),
) -> Any:
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    if not current_user.is_admin and project.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not enough permissions")

    # Try to get from cache first
    cached_data = cache_service.get_project_recordings(
        project_id=project_id,
        skip=skip,
        limit=limit,
        search=search,
        min_duration=min_duration,
        max_duration=max_duration,
        annotation_status=annotation_status,
        sort_by=sort_by,
        sort_order=sort_order,
    )

    if cached_data:
        logger.info(f"Cache hit for project {project_id} recordings")
        return PaginatedResponse(**cached_data)

    # Build query with annotation count
    query = (
        db.query(Recording, func.count(Annotation.id).label("annotation_count"))
        .outerjoin(Annotation, Recording.id == Annotation.recording_id)
        .filter(Recording.project_id == project_id)
        .group_by(Recording.id)
    )

    # Apply search filter (the same condition is used for the summary counts below)
    search_condition = (
        or_(
            Recording.original_filename.ilike(f"%{search}%"),
            Recording.filename.ilike(f"%{search}%"),
        )
        if search
        else None
    )
    if search_condition is not None:
        query = query.filter(search_condition)

    # Apply duration filters
    if min_duration is not None:
        query = query.filter(Recording.duration >= min_duration)
    if max_duration is not None:
        query = query.filter(Recording.duration <= max_duration)

    # Apply annotation status filter
    if annotation_status == "annotated":
        query = query.having(func.count(Annotation.id) > 0)
    elif annotation_status == "unannotated":
        query = query.having(func.count(Annotation.id) == 0)
    elif annotation_status == "finished":
        query = query.filter(Recording.is_finished.is_(True))

    # Apply sorting
    order_field: InstrumentedAttribute[Any]
    if sort_by == "filename":
        order_field = Recording.original_filename
    elif sort_by == "duration":
        order_field = Recording.duration
    else:  # Default to created_at
        order_field = Recording.created_at

    if sort_order == "asc":
        query = query.order_by(order_field.asc())
    else:
        query = query.order_by(order_field.desc())

    # Get total count before pagination
    # We need to create a subquery for counting when using GROUP BY
    count_subquery = query.subquery()
    total_count = db.query(func.count()).select_from(count_subquery).scalar() or 0

    # Calculate total duration for all recordings in the project (not just current page)
    total_duration_query = db.query(func.sum(Recording.duration)).filter(
        Recording.project_id == project_id
    )

    # Apply the same filters as the main query for consistency
    if search_condition is not None:
        total_duration_query = total_duration_query.filter(search_condition)
    if min_duration is not None:
        total_duration_query = total_duration_query.filter(Recording.duration >= min_duration)
    if max_duration is not None:
        total_duration_query = total_duration_query.filter(Recording.duration <= max_duration)

    if annotation_status:
        # EXISTS rather than a join: a join would multiply a recording by its
        # annotations, and grouping to undo that makes the sum return one row
        # per recording, which .scalar() below can't read (it raised 500s).
        has_annotation = (
            db.query(Annotation.id).filter(Annotation.recording_id == Recording.id).exists()
        )
        if annotation_status == "annotated":
            total_duration_query = total_duration_query.filter(has_annotation)
        elif annotation_status == "unannotated":
            total_duration_query = total_duration_query.filter(~has_annotation)
        elif annotation_status == "finished":
            total_duration_query = total_duration_query.filter(Recording.is_finished.is_(True))

    total_duration = total_duration_query.scalar() or 0.0

    # Calculate finished count (total recordings with is_finished=True)
    # Apply same filters as duration but NOT annotation_status
    finished_count_query = db.query(func.count(Recording.id)).filter(
        Recording.project_id == project_id, Recording.is_finished.is_(True)
    )
    if search_condition is not None:
        finished_count_query = finished_count_query.filter(search_condition)
    if min_duration is not None:
        finished_count_query = finished_count_query.filter(Recording.duration >= min_duration)
    if max_duration is not None:
        finished_count_query = finished_count_query.filter(Recording.duration <= max_duration)

    finished_count = finished_count_query.scalar() or 0

    # Calculate annotated count (total recordings with annotations)
    # Apply same filters as duration but NOT annotation_status
    annotated_count_query = (
        db.query(func.count(Recording.id))
        .outerjoin(Annotation, Recording.id == Annotation.recording_id)
        .filter(Recording.project_id == project_id)
        .group_by(Recording.id)
        .having(func.count(Annotation.id) > 0)
    )
    if search_condition is not None:
        annotated_count_query = annotated_count_query.filter(search_condition)
    if min_duration is not None:
        annotated_count_query = annotated_count_query.filter(Recording.duration >= min_duration)
    if max_duration is not None:
        annotated_count_query = annotated_count_query.filter(Recording.duration <= max_duration)

    # Count the results of the subquery
    annotated_subquery = annotated_count_query.subquery()
    annotated_count = db.query(func.count()).select_from(annotated_subquery).scalar() or 0

    # Execute query and build response
    results = query.offset(skip).limit(limit).all()

    # Convert to schema format with annotation count
    recordings_with_counts = []
    for recording, annotation_count in results:
        recording_dict = {
            "id": recording.id,
            "filename": recording.filename,
            "original_filename": recording.original_filename,
            "file_path": recording.file_path,
            "duration": recording.duration,
            "sample_rate": recording.sample_rate,
            "project_id": recording.project_id,
            "is_finished": recording.is_finished,
            "created_at": recording.created_at,
            "annotation_count": annotation_count or 0,
        }
        recordings_with_counts.append(RecordingSchema.model_validate(recording_dict))

    # Calculate pagination metadata
    total_pages = (total_count + limit - 1) // limit if limit > 0 else 0
    current_page = (skip // limit) + 1 if limit > 0 else 1

    pagination_metadata = PaginationMetadata(
        total=total_count,
        page=current_page,
        page_size=limit,
        total_pages=total_pages,
        has_next=current_page < total_pages,
        has_prev=current_page > 1,
        total_duration=total_duration,
        finished_count=finished_count,
        annotated_count=annotated_count,
    )

    response: PaginatedResponse[RecordingSchema] = PaginatedResponse(
        items=recordings_with_counts, pagination=pagination_metadata
    )

    # Cache the response
    cache_service.set_project_recordings(
        project_id=project_id,
        skip=skip,
        limit=limit,
        data=response.model_dump(),
        search=search,
        min_duration=min_duration,
        max_duration=max_duration,
        annotation_status=annotation_status,
        sort_by=sort_by,
        sort_order=sort_order,
        ttl=300,  # Cache for 5 minutes
    )

    return response


@router.get("/{recording_id}", response_model=RecordingSchema)
@limiter.limit(RATE_LIMITS["crud_read"])
def read_recording(
    request: Request,
    recording_id: int,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user),
) -> Any:
    recording = db.query(Recording).filter(Recording.id == recording_id).first()
    if not recording:
        raise HTTPException(status_code=404, detail="Recording not found")

    project = db.query(Project).filter(Project.id == recording.project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    if not current_user.is_admin and project.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not enough permissions")

    # Same rule as saving annotations, so the editor can open read-only up front.
    try:
        check_project_edit_permission(db, project, current_user)
        can_edit = True
    except HTTPException:
        can_edit = False
    return RecordingSchema.model_validate(recording).model_copy(update={"can_edit": can_edit})


@router.delete("/{recording_id}")
@limiter.limit(RATE_LIMITS["crud_write"])
def delete_recording(
    request: Request,
    recording_id: int,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user),
) -> Any:
    recording = db.query(Recording).filter(Recording.id == recording_id).first()
    if not recording:
        raise HTTPException(status_code=404, detail="Recording not found")

    project = db.query(Project).filter(Project.id == recording.project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    # Use shared permission check that respects ADMIN_CAN_EDIT_USER_PROJECTS setting
    check_project_edit_permission(db, project, current_user)

    # file_path and id are NOT NULL columns of a loaded row
    assert recording.file_path is not None and project.id is not None
    minio_client.delete_file(
        bucket_name=settings.MINIO_BUCKET_RECORDINGS, object_name=recording.file_path
    )

    db.delete(recording)
    db.commit()

    # Invalidate cache
    cache_service.invalidate_project_recordings(project.id)
    cache_service.invalidate_recording(recording_id)

    return {"message": "Recording deleted successfully"}


@router.post("/{project_id}/bulk-delete")
@limiter.limit(RATE_LIMITS["bulk_operation"])
def bulk_delete_recordings(
    request: Request,
    project_id: int,
    recording_ids: List[int],
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user),
) -> Any:
    """Delete multiple recordings at once."""
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    # Use shared permission check that respects ADMIN_CAN_EDIT_USER_PROJECTS setting
    check_project_edit_permission(db, project, current_user)

    recordings = (
        db.query(Recording)
        .filter(Recording.id.in_(recording_ids), Recording.project_id == project_id)
        .all()
    )

    deleted_count = 0
    failed_deletions = []
    deleted_ids: List[int] = []

    for recording in recordings:
        try:
            assert recording.file_path is not None  # NOT NULL column
            assert recording.id is not None  # primary key
            minio_client.delete_file(
                bucket_name=settings.MINIO_BUCKET_RECORDINGS, object_name=recording.file_path
            )
            deleted_ids.append(recording.id)
            db.delete(recording)
            deleted_count += 1
        except Exception as e:
            logger.error(
                f"Failed to delete file for recording {recording.id}: {str(e)}",
                extra={"recording_id": recording.id, "file_path": recording.file_path},
            )
            failed_deletions.append(
                {"id": recording.id, "filename": recording.original_filename, "error": str(e)[:100]}
            )

    db.commit()

    # Same as the single delete: without this the list keeps showing the
    # deleted recordings until the cache expires.
    cache_service.invalidate_project_recordings(project_id)
    for deleted_id in deleted_ids:
        cache_service.invalidate_recording(deleted_id)

    response: Dict[str, Any] = {
        "message": f"Deleted {deleted_count} recordings successfully",
        "deleted_count": deleted_count,
        "total_requested": len(recording_ids),
    }

    if failed_deletions:
        response["failed_deletions"] = failed_deletions
        response["warning"] = f"{len(failed_deletions)} recordings failed to delete"

    return response


@router.get("/{recording_id}/audio")
@limiter.limit(RATE_LIMITS["file_serve"])
async def get_recording_audio(
    request: Request,
    recording_id: int,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user),
) -> Any:
    """Stream audio file for a recording."""
    recording = db.query(Recording).filter(Recording.id == recording_id).first()
    if not recording:
        raise HTTPException(status_code=404, detail="Recording not found")

    project = db.query(Project).filter(Project.id == recording.project_id).first()
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")
    if not current_user.is_admin and project.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not enough permissions")

    # file_path and filename are NOT NULL columns
    assert recording.file_path is not None and recording.filename is not None
    try:
        audio_data = minio_client.get_file(
            bucket_name=settings.MINIO_BUCKET_RECORDINGS, object_name=recording.file_path
        )

        # Determine content type based on file extension
        ext = os.path.splitext(recording.filename)[1].lower()
        content_type_map = {
            ".mp3": "audio/mpeg",
            ".wav": "audio/wav",
            ".m4a": "audio/mp4",
            ".flac": "audio/flac",
        }
        content_type = content_type_map.get(ext, "audio/mpeg")

        # The file is already in memory; a plain Response sends Content-Length,
        # so the browser can show download progress.
        return Response(
            content=audio_data.getvalue(),
            media_type=content_type,
            headers={"Content-Disposition": f"inline; filename={recording.original_filename}"},
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to retrieve audio: {str(e)}") from e


@router.post("/backfill-durations")
@limiter.limit(RATE_LIMITS["bulk_operation"])
def backfill_missing_durations(
    request: Request,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user),
) -> Any:
    """Backfill missing duration values for recordings by analyzing audio files."""
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Only admins can perform bulk operations")

    # Find recordings with missing duration
    recordings_missing_duration = db.query(Recording).filter(Recording.duration.is_(None)).all()

    if not recordings_missing_duration:
        return {
            "message": "No recordings found with missing duration",
            "updated_count": 0,
            "failed_count": 0,
            "total_processed": 0,
        }

    updated_count = 0
    failed_count = 0
    errors = []

    for recording in recordings_missing_duration:
        try:
            # file_path and filename are NOT NULL columns
            assert recording.file_path is not None and recording.filename is not None
            # Download audio file from MinIO (get_file returns an in-memory BytesIO)
            audio_data = minio_client.get_file(
                bucket_name=settings.MINIO_BUCKET_RECORDINGS, object_name=recording.file_path
            ).getvalue()
            file_extension = os.path.splitext(recording.filename)[1]

            try:
                # Analyze audio to get duration using AudioService
                audio_metadata = audio_service.extract_audio_metadata_from_bytes(
                    audio_data, file_extension
                )

                # Update recording with duration and sample rate if missing
                # (the SQLAlchemy mypy plugin leaves Float's type variable unresolved)
                recording.duration = audio_metadata.duration  # type: ignore[assignment]
                if recording.sample_rate is None:
                    recording.sample_rate = audio_metadata.sample_rate

                db.commit()
                updated_count += 1

                logger.info(
                    f"Updated recording {recording.id} - Duration: {audio_metadata.duration:.2f}s, "
                    f"Sample Rate: {audio_metadata.sample_rate}"
                )

            except Exception as e:
                logger.error(f"Failed to analyze audio for recording {recording.id}: {str(e)}")
                errors.append(f"Recording {recording.id}: {str(e)}")
                failed_count += 1

        except Exception as e:
            logger.error(f"Failed to process recording {recording.id}: {str(e)}")
            errors.append(f"Recording {recording.id}: {str(e)}")
            failed_count += 1

    # Durations feed the cached totals and the duration filters.
    touched_projects = {
        r.project_id for r in recordings_missing_duration if r.project_id is not None
    }
    for touched_project_id in touched_projects:
        cache_service.invalidate_project_recordings(touched_project_id)

    result: Dict[str, Any] = {
        "message": f"Processed {len(recordings_missing_duration)} recordings",
        "updated_count": updated_count,
        "failed_count": failed_count,
        "total_processed": len(recordings_missing_duration),
    }

    if errors:
        result["errors"] = errors[:10]  # Limit to first 10 errors
        if len(errors) > 10:
            result["additional_errors"] = len(errors) - 10

    return result


@router.patch("/{recording_id}/finished", response_model=RecordingSchema)
def toggle_recording_finished(
    recording_id: int,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user),
) -> Any:
    """Toggle the 'finished' status of a recording."""
    # Get recording
    recording = db.query(Recording).filter(Recording.id == recording_id).first()
    if not recording:
        raise HTTPException(status_code=404, detail="Recording not found")

    # Get project for permission check
    project = db.query(Project).filter(Project.id == recording.project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    # Use shared permission check that respects ADMIN_CAN_EDIT_USER_PROJECTS setting
    check_project_edit_permission(db, project, current_user)

    # Toggle finished status
    recording.is_finished = not recording.is_finished
    db.commit()
    db.refresh(recording)

    # Add annotation count to response
    annotation_count = (
        db.query(func.count(Annotation.id)).filter(Annotation.recording_id == recording.id).scalar()
        or 0
    )

    recording_dict = RecordingSchema.model_validate(recording).model_dump()
    recording_dict["annotation_count"] = annotation_count

    # Invalidate cache
    assert recording.project_id is not None  # NOT NULL column
    cache_service.invalidate_project_recordings(recording.project_id)

    logger.info(
        f"Recording {recording_id} finished status toggled to {recording.is_finished} "
        f"by {current_user.email}"
    )

    return recording_dict
