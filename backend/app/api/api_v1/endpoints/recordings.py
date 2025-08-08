import os
import uuid
from typing import Any, List
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
import librosa
from app.api import deps
from app.core.config import settings
from app.models.project import Project
from app.models.recording import Recording
from app.models.spectrogram import Spectrogram
from app.models.user import User
from app.schemas.recording import Recording as RecordingSchema
from app.services.minio_client import minio_client
from app.services.spectrogram import generate_spectrogram

router = APIRouter()

@router.post("/{project_id}/upload", response_model=RecordingSchema)
async def upload_recording(
    project_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user),
) -> Any:
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    if not current_user.is_admin and project.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not enough permissions")
    
    file_extension = os.path.splitext(file.filename)[1].lower()
    if file_extension not in settings.ALLOWED_AUDIO_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"File type not allowed. Allowed types: {settings.ALLOWED_AUDIO_EXTENSIONS}"
        )
    
    if file.size > settings.MAX_UPLOAD_SIZE:
        raise HTTPException(
            status_code=400,
            detail=f"File too large. Maximum size: {settings.MAX_UPLOAD_SIZE} bytes"
        )
    
    unique_filename = f"{uuid.uuid4()}{file_extension}"
    file_path = f"project_{project_id}/{unique_filename}"
    
    contents = await file.read()
    minio_client.upload_file(
        bucket_name=settings.MINIO_BUCKET_RECORDINGS,
        object_name=file_path,
        data=contents,
        content_type=file.content_type
    )
    
    with open(f"/tmp/{unique_filename}", "wb") as f:
        f.write(contents)
    
    try:
        y, sr = librosa.load(f"/tmp/{unique_filename}", sr=None)
        duration = librosa.get_duration(y=y, sr=sr)
    except Exception as e:
        duration = None
        sr = None
    finally:
        os.remove(f"/tmp/{unique_filename}")
    
    recording = Recording(
        filename=unique_filename,
        original_filename=file.filename,
        file_path=file_path,
        duration=duration,
        sample_rate=sr,
        project_id=project_id
    )
    db.add(recording)
    db.commit()
    db.refresh(recording)
    
    # TODO: Implement async spectrogram generation
    # generate_spectrogram.delay(recording.id)
    
    return recording

@router.get("/{project_id}/recordings", response_model=List[RecordingSchema])
def read_recordings(
    project_id: int,
    db: Session = Depends(deps.get_db),
    skip: int = 0,
    limit: int = 100,
    current_user: User = Depends(deps.get_current_active_user),
) -> Any:
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    if not current_user.is_admin and project.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not enough permissions")
    
    recordings = db.query(Recording).filter(
        Recording.project_id == project_id
    ).offset(skip).limit(limit).all()
    return recordings

@router.get("/{recording_id}", response_model=RecordingSchema)
def read_recording(
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
def delete_recording(
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
        bucket_name=settings.MINIO_BUCKET_RECORDINGS,
        object_name=recording.file_path
    )
    
    db.delete(recording)
    db.commit()
    return {"message": "Recording deleted successfully"}

@router.get("/{recording_id}/audio")
async def get_recording_audio(
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
            bucket_name=settings.MINIO_BUCKET_RECORDINGS,
            object_name=recording.file_path
        )
        
        # Determine content type based on file extension
        ext = os.path.splitext(recording.filename)[1].lower()
        content_type_map = {
            '.mp3': 'audio/mpeg',
            '.wav': 'audio/wav',
            '.m4a': 'audio/mp4',
            '.flac': 'audio/flac'
        }
        content_type = content_type_map.get(ext, 'audio/mpeg')
        
        return StreamingResponse(
            audio_data,
            media_type=content_type,
            headers={
                "Content-Disposition": f"inline; filename={recording.original_filename}"
            }
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to retrieve audio: {str(e)}")

@router.get("/{recording_id}/spectrogram")
async def get_recording_spectrogram(
    recording_id: int,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user),
) -> Any:
    """Get or generate spectrogram for a recording."""
    recording = db.query(Recording).filter(Recording.id == recording_id).first()
    if not recording:
        raise HTTPException(status_code=404, detail="Recording not found")
    
    project = db.query(Project).filter(Project.id == recording.project_id).first()
    if not current_user.is_admin and project.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not enough permissions")
    
    # Check if spectrogram exists
    spectrogram = db.query(Spectrogram).filter(
        Spectrogram.recording_id == recording_id
    ).first()
    
    if not spectrogram:
        # Generate spectrogram synchronously
        try:
            # Download audio file to temp location
            audio_data = minio_client.get_file(
                bucket_name=settings.MINIO_BUCKET_RECORDINGS,
                object_name=recording.file_path
            )
            
            temp_audio_path = f"/tmp/{recording.filename}"
            with open(temp_audio_path, "wb") as f:
                f.write(audio_data.read())
            
            # Generate spectrogram
            spectrogram_path = generate_spectrogram(
                audio_path=temp_audio_path,
                recording_id=recording_id,
                db=db
            )
            
            # Clean up temp file
            os.remove(temp_audio_path)
            
            # Get the newly created spectrogram
            spectrogram = db.query(Spectrogram).filter(
                Spectrogram.recording_id == recording_id
            ).first()
            
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to generate spectrogram: {str(e)}")
    
    # Serve the spectrogram image
    try:
        spectrogram_data = minio_client.get_file(
            bucket_name=settings.MINIO_BUCKET_SPECTROGRAMS,
            object_name=spectrogram.image_path
        )
        
        return StreamingResponse(
            spectrogram_data,
            media_type="image/png",
            headers={
                "Content-Disposition": f"inline; filename=spectrogram_{recording_id}.png"
            }
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to retrieve spectrogram: {str(e)}")