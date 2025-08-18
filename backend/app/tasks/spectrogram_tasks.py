"""
Celery tasks for spectrogram generation with multi-resolution support.
"""

import io
import tempfile
import time
import logging
from pathlib import Path
from typing import Dict, Tuple, Optional
from celery import current_task
from celery.exceptions import SoftTimeLimitExceeded
import numpy as np
import librosa
from PIL import Image
from matplotlib import cm
from sqlalchemy.orm import Session

from app.core.celery_app import celery_app
from app.core.config import settings
from app.db.session import SessionLocal
from app.models.recording import Recording
from app.models.spectrogram import Spectrogram, SpectrogramStatus
from app.services.minio_client import minio_client

logger = logging.getLogger(__name__)


def generate_spectrogram_image(
    y: np.ndarray, 
    sr: int, 
    target_width: int, 
    target_height: int = 400,
    n_fft: int = 2048,
    hop_length: Optional[int] = None
) -> bytes:
    """
    Generate a spectrogram image at specified resolution.
    
    Args:
        y: Audio time series
        sr: Sample rate
        target_width: Target width in pixels
        target_height: Target height in pixels
        n_fft: FFT window size
        hop_length: Number of samples between successive frames
    
    Returns:
        PNG image data as bytes
    """
    # Adjust hop_length based on target width to get appropriate time resolution
    if hop_length is None:
        duration = len(y) / sr
        # Calculate hop_length to get approximately target_width time frames
        hop_length = max(1, int(len(y) / target_width))
    
    # Generate STFT
    D = librosa.stft(y, n_fft=n_fft, hop_length=hop_length)
    S_db = librosa.amplitude_to_db(np.abs(D), ref=np.max)
    
    # Limit frequency range to 0-10kHz
    freqs = librosa.fft_frequencies(sr=sr, n_fft=n_fft)
    max_freq_idx = np.where(freqs <= 10000)[0][-1]
    S_db_limited = S_db[:max_freq_idx, :]
    
    # Normalize to 0-255
    S_db_norm = S_db_limited - S_db_limited.min()
    if S_db_norm.max() > 0:
        S_db_norm = (S_db_norm / S_db_norm.max() * 255).astype(np.uint8)
    else:
        S_db_norm = S_db_norm.astype(np.uint8)
    
    # Flip vertically so low frequencies are at bottom
    S_db_norm = np.flipud(S_db_norm)
    
    # Apply viridis colormap
    viridis = cm.get_cmap('viridis')
    colored = viridis(S_db_norm)
    rgb_array = (colored[:, :, :3] * 255).astype(np.uint8)
    
    # Create PIL image and resize to target dimensions
    img = Image.fromarray(rgb_array)
    img = img.resize((target_width, target_height), Image.Resampling.LANCZOS)
    
    # Save to buffer
    buffer = io.BytesIO()
    img.save(buffer, format='PNG', optimize=True)
    buffer.seek(0)
    return buffer.read()


@celery_app.task(bind=True, name="app.tasks.spectrogram_tasks.generate_spectrogram_task")
def generate_spectrogram_task(self, recording_id: int) -> Dict:
    """
    Celery task to generate multi-resolution spectrograms for a recording.
    
    Args:
        recording_id: ID of the recording to process
    
    Returns:
        Dict with task results including generated paths and timings
    """
    task_start = time.time()
    db = SessionLocal()
    
    try:
        # Update task state
        self.update_state(state="PROCESSING", meta={"stage": "fetching_recording"})
        
        # Get recording from database
        recording = db.query(Recording).filter(Recording.id == recording_id).first()
        if not recording:
            raise ValueError(f"Recording {recording_id} not found")
        
        # Check if spectrogram already exists
        existing = db.query(Spectrogram).filter(
            Spectrogram.recording_id == recording_id
        ).first()
        
        if existing and existing.status == SpectrogramStatus.COMPLETED:
            logger.info(f"Spectrogram already exists for recording {recording_id}")
            return {
                "status": "already_exists",
                "recording_id": recording_id,
                "paths": {
                    "thumbnail": existing.thumbnail_path,
                    "standard": existing.standard_path,
                    "full": existing.full_path
                }
            }
        
        # Create or update spectrogram record with processing status
        if not existing:
            spectrogram = Spectrogram(
                recording_id=recording_id,
                status=SpectrogramStatus.PROCESSING
            )
            db.add(spectrogram)
            db.commit()
            db.refresh(spectrogram)
        else:
            existing.status = SpectrogramStatus.PROCESSING
            existing.error_message = None
            db.commit()
            spectrogram = existing
        
        # Download audio file from MinIO
        self.update_state(state="PROCESSING", meta={"stage": "downloading_audio", "progress": 10})
        
        audio_data = minio_client.get_file(
            bucket_name=settings.MINIO_BUCKET_RECORDINGS,
            object_name=recording.file_path
        )
        
        # Save to temporary file
        with tempfile.NamedTemporaryFile(suffix=Path(recording.filename).suffix) as temp_file:
            temp_file.write(audio_data.read())
            temp_file.flush()
            
            # Load audio
            self.update_state(state="PROCESSING", meta={"stage": "loading_audio", "progress": 20})
            y, sr = librosa.load(temp_file.name, sr=None)
            duration = len(y) / sr
            
            logger.info(f"Audio loaded: {duration:.2f}s, Sample Rate: {sr}")
            
            # Calculate appropriate dimensions based on duration
            base_width_per_second = 200
            
            # Generate thumbnail (small, fast preview)
            self.update_state(state="PROCESSING", meta={"stage": "generating_thumbnail", "progress": 30})
            thumbnail_width = min(800, int(duration * 50))  # 50px per second, max 800px
            thumbnail_data = generate_spectrogram_image(
                y, sr, thumbnail_width, 200, 
                n_fft=1024,  # Smaller FFT for faster processing
                hop_length=1024
            )
            
            # Upload thumbnail
            thumbnail_path = f"spectrograms/{recording_id}/thumbnail.png"
            minio_client.upload_file(
                settings.MINIO_BUCKET_SPECTROGRAMS,
                thumbnail_path,
                thumbnail_data,
                "image/png"
            )
            
            # Generate standard resolution
            self.update_state(state="PROCESSING", meta={"stage": "generating_standard", "progress": 50})
            standard_width = min(1600, max(800, int(duration * base_width_per_second)))
            standard_data = generate_spectrogram_image(
                y, sr, standard_width, 400,
                n_fft=2048,
                hop_length=512
            )
            
            # Upload standard
            standard_path = f"spectrograms/{recording_id}/standard.png"
            minio_client.upload_file(
                settings.MINIO_BUCKET_SPECTROGRAMS,
                standard_path,
                standard_data,
                "image/png"
            )
            
            # Generate full resolution (for detailed analysis)
            self.update_state(state="PROCESSING", meta={"stage": "generating_full", "progress": 70})
            full_width = min(6400, max(1600, int(duration * base_width_per_second * 2)))
            full_data = generate_spectrogram_image(
                y, sr, full_width, 600,
                n_fft=4096,
                hop_length=256
            )
            
            # Upload full resolution
            full_path = f"spectrograms/{recording_id}/full.png"
            minio_client.upload_file(
                settings.MINIO_BUCKET_SPECTROGRAMS,
                full_path,
                full_data,
                "image/png"
            )
            
            # Update database record
            self.update_state(state="PROCESSING", meta={"stage": "updating_database", "progress": 90})
            
            processing_time = time.time() - task_start
            
            spectrogram.status = SpectrogramStatus.COMPLETED
            spectrogram.thumbnail_path = thumbnail_path
            spectrogram.standard_path = standard_path
            spectrogram.full_path = full_path
            spectrogram.image_path = standard_path  # Keep backward compatibility
            spectrogram.width = standard_width
            spectrogram.height = 400
            spectrogram.processing_time = processing_time
            spectrogram.parameters = {
                "n_fft": 2048,
                "hop_length": 512,
                "sample_rate": sr,
                "max_frequency": 10000,
                "duration": duration,
                "resolutions": {
                    "thumbnail": {"width": thumbnail_width, "height": 200},
                    "standard": {"width": standard_width, "height": 400},
                    "full": {"width": full_width, "height": 600}
                }
            }
            
            db.commit()
            
            logger.info(f"Spectrogram generation completed for recording {recording_id} in {processing_time:.2f}s")
            
            return {
                "status": "success",
                "recording_id": recording_id,
                "processing_time": processing_time,
                "paths": {
                    "thumbnail": thumbnail_path,
                    "standard": standard_path,
                    "full": full_path
                }
            }
            
    except SoftTimeLimitExceeded:
        logger.error(f"Task timeout for recording {recording_id}")
        if 'spectrogram' in locals():
            spectrogram.status = SpectrogramStatus.FAILED
            spectrogram.error_message = "Task timeout"
            db.commit()
        raise
        
    except Exception as e:
        logger.error(f"Error generating spectrogram for recording {recording_id}: {str(e)}")
        if 'spectrogram' in locals():
            spectrogram.status = SpectrogramStatus.FAILED
            spectrogram.error_message = str(e)[:500]  # Limit error message length
            db.commit()
        raise
        
    finally:
        db.close()


@celery_app.task(bind=True, name="app.tasks.spectrogram_tasks.regenerate_all_spectrograms")
def regenerate_all_spectrograms(self) -> Dict:
    """
    Regenerate spectrograms for all recordings that don't have them yet.
    Useful for migration or batch processing.
    """
    db = SessionLocal()
    
    try:
        # Get all recordings without completed spectrograms
        recordings = db.query(Recording).outerjoin(Spectrogram).filter(
            (Spectrogram.id == None) | 
            (Spectrogram.status != SpectrogramStatus.COMPLETED)
        ).all()
        
        total = len(recordings)
        logger.info(f"Found {total} recordings to process")
        
        results = []
        for idx, recording in enumerate(recordings):
            self.update_state(
                state="PROCESSING", 
                meta={"current": idx + 1, "total": total, "recording_id": recording.id}
            )
            
            try:
                result = generate_spectrogram_task.delay(recording.id)
                results.append({
                    "recording_id": recording.id,
                    "task_id": result.id,
                    "status": "queued"
                })
            except Exception as e:
                results.append({
                    "recording_id": recording.id,
                    "status": "error",
                    "error": str(e)
                })
        
        return {
            "status": "completed",
            "total_processed": total,
            "results": results
        }
        
    finally:
        db.close()