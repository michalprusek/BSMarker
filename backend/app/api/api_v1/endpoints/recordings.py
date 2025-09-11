"""Recording endpoints for BSMarker API."""

import logging
import os
import tempfile
import time
import uuid
from contextlib import contextmanager
from pathlib import Path
from typing import Any, List, Optional

import librosa
from app.api import deps
from app.core.config import settings
from app.core.rate_limiter import RATE_LIMITS, limiter
from app.models.project import Project
from app.models.recording import Recording
from app.models.spectrogram import Spectrogram, SpectrogramStatus
from app.models.user import User
from app.schemas.recording import Recording as RecordingSchema
from app.services.minio_client import minio_client
from fastapi import APIRouter, Depends, File, HTTPException, Query, Request, UploadFile
from fastapi.responses import StreamingResponse
from sqlalchemy import or_
from sqlalchemy.orm import Session

router = APIRouter()
logger = logging.getLogger(__name__)


@contextmanager
def secure_temp_file(suffix="", prefix="bsmarker_"):
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
            except Exception:
                pass  # Ignore cleanup errors


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
    if not current_user.is_admin and project.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not enough permissions")

    # Validate file extension securely
    try:
        file_extension = validate_file_extension(file.filename)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

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
            )
        elif "Access" in error_msg or "credentials" in error_msg.lower():
            raise HTTPException(
                status_code=500, detail="Storage authentication error. Please contact support."
            )
        else:
            raise HTTPException(
                status_code=500, detail=f"Storage error: {error_msg[:100]}"
            )  # Limit error message length

    # Use secure temporary file for audio processing
    audio_analysis_start = time.time()
    with secure_temp_file(suffix=file_extension) as temp_path:
        with open(temp_path, "wb") as f:
            f.write(contents)

        try:
            y, sr = librosa.load(str(temp_path), sr=None)
            duration = librosa.get_duration(y=y, sr=sr)
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
        duration=duration,
        sample_rate=sr,
        project_id=project_id,
    )
    db.add(recording)
    db.commit()
    db.refresh(recording)
    logger.info(f"Database operations completed in {time.time() - db_start:.2f}s")

    # Trigger asynchronous spectrogram generation
    try:
        from app.tasks.spectrogram_tasks import generate_spectrogram_task

        task = generate_spectrogram_task.delay(recording.id)
        logger.info(f"Spectrogram generation task {task.id} queued for recording {recording.id}")
    except Exception as e:
        logger.error(
            f"Failed to queue spectrogram generation for recording {recording.id}: {str(e)}"
        )
        # Don't fail the upload if task queueing fails

    total_time = time.time() - upload_start_time
    logger.info(f"Upload completed for {file.filename} - Total time: {total_time:.2f}s")
    return recording


@router.get("/{project_id}/recordings", response_model=List[RecordingSchema])
@limiter.limit(RATE_LIMITS["crud_read"])
def read_recordings(
    request: Request,
    project_id: int,
    db: Session = Depends(deps.get_db),
    skip: int = 0,
    limit: int = 100,
    search: Optional[str] = Query(None, description="Search in filename"),
    min_duration: Optional[float] = Query(None, description="Minimum duration in seconds"),
    max_duration: Optional[float] = Query(None, description="Maximum duration in seconds"),
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

    query = db.query(Recording).filter(Recording.project_id == project_id)

    # Apply search filter
    if search:
        query = query.filter(
            or_(
                Recording.original_filename.ilike(f"%{search}%"),
                Recording.filename.ilike(f"%{search}%"),
            )
        )

    # Apply duration filters
    if min_duration is not None:
        query = query.filter(Recording.duration >= min_duration)
    if max_duration is not None:
        query = query.filter(Recording.duration <= max_duration)

    # Apply sorting
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

    recordings = query.offset(skip).limit(limit).all()
    return recordings


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
    if not current_user.is_admin and project.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not enough permissions")

    return recording


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
    if not current_user.is_admin and project.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not enough permissions")

    minio_client.delete_file(
        bucket_name=settings.MINIO_BUCKET_RECORDINGS, object_name=recording.file_path
    )

    db.delete(recording)
    db.commit()
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
    if not current_user.is_admin and project.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not enough permissions")

    recordings = (
        db.query(Recording)
        .filter(Recording.id.in_(recording_ids), Recording.project_id == project_id)
        .all()
    )

    deleted_count = 0
    for recording in recordings:
        try:
            minio_client.delete_file(
                bucket_name=settings.MINIO_BUCKET_RECORDINGS, object_name=recording.file_path
            )
        except:
            pass  # Continue even if file deletion fails

        db.delete(recording)
        deleted_count += 1

    db.commit()
    return {"message": f"Deleted {deleted_count} recordings successfully"}


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
    if not current_user.is_admin and project.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not enough permissions")

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

        return StreamingResponse(
            audio_data,
            media_type=content_type,
            headers={"Content-Disposition": f"inline; filename={recording.original_filename}"},
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to retrieve audio: {str(e)}")


@router.get("/{recording_id}/spectrogram/status")
@limiter.limit(RATE_LIMITS["crud_read"])
def get_spectrogram_status(
    request: Request,
    recording_id: int,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user),
) -> Any:
    """Get spectrogram generation status for a recording."""
    recording = db.query(Recording).filter(Recording.id == recording_id).first()
    if not recording:
        raise HTTPException(status_code=404, detail="Recording not found")

    project = db.query(Project).filter(Project.id == recording.project_id).first()
    if not current_user.is_admin and project.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not enough permissions")

    # Check spectrogram status
    spectrogram = db.query(Spectrogram).filter(Spectrogram.recording_id == recording_id).first()

    if not spectrogram:
        return {"status": "not_started", "recording_id": recording_id, "available": False}

    return {
        "status": spectrogram.status.value,
        "recording_id": recording_id,
        "available": spectrogram.status == SpectrogramStatus.COMPLETED
        and spectrogram.image_path is not None,
        "error_message": spectrogram.error_message,
        "processing_time": spectrogram.processing_time,
        "width": spectrogram.width,
        "height": spectrogram.height,
        "created_at": spectrogram.created_at.isoformat() if spectrogram.created_at else None,
        "updated_at": spectrogram.updated_at.isoformat() if spectrogram.updated_at else None,
    }


@router.get("/{recording_id}/spectrogram")
@limiter.limit(RATE_LIMITS["spectrogram"])
async def get_recording_spectrogram(
    request: Request,
    recording_id: int,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user),
) -> Any:
    """Get spectrogram for a recording."""
    recording = db.query(Recording).filter(Recording.id == recording_id).first()
    if not recording:
        raise HTTPException(status_code=404, detail="Recording not found")

    project = db.query(Project).filter(Project.id == recording.project_id).first()
    if not current_user.is_admin and project.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not enough permissions")

    # Check if spectrogram exists
    spectrogram = db.query(Spectrogram).filter(Spectrogram.recording_id == recording_id).first()

    if not spectrogram:
        # Return 202 Accepted - processing not started yet
        raise HTTPException(
            status_code=202,
            detail="Spectrogram generation not started. Please check status endpoint.",
        )

    if spectrogram.status == SpectrogramStatus.FAILED:
        raise HTTPException(
            status_code=500,
            detail=f"Spectrogram generation failed: {spectrogram.error_message or 'Unknown error'}",
        )

    if spectrogram.status == SpectrogramStatus.PROCESSING:
        raise HTTPException(
            status_code=202, detail="Spectrogram is being generated. Please try again later."
        )

    if spectrogram.status != SpectrogramStatus.COMPLETED:
        raise HTTPException(
            status_code=202,
            detail=f"Spectrogram is not ready yet. Status: {spectrogram.status.value}",
        )

    # Get the spectrogram path
    image_path = spectrogram.image_path

    if not image_path:
        raise HTTPException(status_code=404, detail="Spectrogram file not found")

    # Serve the spectrogram image
    try:
        spectrogram_data = minio_client.get_file(
            bucket_name=settings.MINIO_BUCKET_SPECTROGRAMS, object_name=image_path
        )

        return StreamingResponse(
            spectrogram_data,
            media_type="image/png",
            headers={
                "Content-Disposition": f"inline; filename=spectrogram_{recording_id}.png",
                "Cache-Control": "public, max-age=86400",  # Cache for 24 hours
            },
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to retrieve spectrogram: {str(e)}")


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
            # Download audio file from MinIO
            audio_data = minio_client.get_file(
                bucket_name=settings.MINIO_BUCKET_RECORDINGS, object_name=recording.file_path
            )

            # Create temporary file
            import tempfile

            with tempfile.NamedTemporaryFile(
                delete=False, suffix=os.path.splitext(recording.filename)[1]
            ) as temp_file:
                for chunk in audio_data:
                    temp_file.write(chunk)
                temp_path = temp_file.name

            try:
                # Analyze audio to get duration
                import librosa

                y, sr = librosa.load(str(temp_path), sr=None)
                duration = librosa.get_duration(y=y, sr=sr)

                # Update recording with duration and sample rate if missing
                recording.duration = duration
                if recording.sample_rate is None:
                    recording.sample_rate = sr

                db.commit()
                updated_count += 1

                logger.info(
                    f"Updated recording {recording.id} - Duration: {duration:.2f}s, Sample Rate: {sr}"
                )

            except Exception as e:
                logger.error(f"Failed to analyze audio for recording {recording.id}: {str(e)}")
                errors.append(f"Recording {recording.id}: {str(e)}")
                failed_count += 1
            finally:
                # Clean up temporary file
                os.unlink(temp_path)

        except Exception as e:
            logger.error(f"Failed to process recording {recording.id}: {str(e)}")
            errors.append(f"Recording {recording.id}: {str(e)}")
            failed_count += 1

    result = {
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
