"""
Celery tasks for spectrogram generation.
"""

import io
import logging
import os
import tempfile
import time
from pathlib import Path
from typing import Dict, Optional

import librosa
import numpy as np
from app.core.celery_app import celery_app
from app.core.config import settings
from app.db.session import SessionLocal
from app.models import Recording, Spectrogram
from app.models.spectrogram import SpectrogramStatus
from app.services.minio_client import minio_client
from celery.exceptions import SoftTimeLimitExceeded
from matplotlib import cm
from PIL import Image
from sqlalchemy.orm import Session

# Set cache directory for numba/librosa to avoid permission issues in Docker
os.environ["NUMBA_CACHE_DIR"] = "/tmp"

logger = logging.getLogger(__name__)


def generate_spectrogram_image(
    y: np.ndarray,
    sr: int,
    target_width: int,
    target_height: int = 400,
    n_fft: int = 2048,
    hop_length: Optional[int] = None,
    max_frequency: Optional[int] = None,
) -> bytes:
    """
    Generate a spectrogram image.

    Args:
        y: Audio time series
        sr: Sample rate
        target_width: Target width in pixels
        target_height: Target height in pixels
        n_fft: FFT window size
        hop_length: Number of samples between successive frames
        max_frequency: Maximum frequency to display (defaults to Nyquist frequency)

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

    # Limit frequency range based on max_frequency or Nyquist frequency
    if max_frequency is None:
        # Use Nyquist frequency (half of sample rate)
        max_frequency = sr // 2

    freqs = librosa.fft_frequencies(sr=sr, n_fft=n_fft)
    max_freq_idx = np.where(freqs <= max_frequency)[0][-1]
    S_db_limited = S_db[:max_freq_idx, :]

    logger.info(f"Using max frequency: {max_frequency} Hz (Nyquist: {sr // 2} Hz)")

    # Normalize to 0-255
    S_db_norm = S_db_limited - S_db_limited.min()
    if S_db_norm.max() > 0:
        S_db_norm = (S_db_norm / S_db_norm.max() * 255).astype(np.uint8)
    else:
        S_db_norm = S_db_norm.astype(np.uint8)

    # Flip vertically so low frequencies are at bottom
    S_db_norm = np.flipud(S_db_norm)

    # Apply viridis colormap
    viridis = cm.get_cmap("viridis")
    colored = viridis(S_db_norm)
    rgb_array = (colored[:, :, :3] * 255).astype(np.uint8)

    # Create PIL image and resize to target dimensions
    img = Image.fromarray(rgb_array)
    img = img.resize((target_width, target_height), Image.Resampling.LANCZOS)

    # Save to buffer
    buffer = io.BytesIO()
    img.save(buffer, format="PNG", optimize=True)
    buffer.seek(0)
    return buffer.read()


@celery_app.task(bind=True, name="app.tasks.spectrogram_tasks.generate_spectrogram_task")
def generate_spectrogram_task(self, recording_id: int) -> Dict:
    """
    Celery task to generate spectrogram for a recording.

    Args:
        recording_id: ID of the recording to process

    Returns:
        Dict with task results including generated path and timing
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
        existing = db.query(Spectrogram).filter(Spectrogram.recording_id == recording_id).first()

        if existing and existing.status == SpectrogramStatus.COMPLETED:
            logger.info(f"Spectrogram already exists for recording {recording_id}")
            return {
                "status": "already_exists",
                "recording_id": recording_id,
                "path": existing.image_path,
            }

        # Create or update spectrogram record with processing status
        if not existing:
            spectrogram = Spectrogram(
                recording_id=recording_id, status=SpectrogramStatus.PROCESSING
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
        self.update_state(state="PROCESSING", meta={"stage": "downloading_audio", "progress": 20})

        audio_data = minio_client.get_file(
            bucket_name=settings.MINIO_BUCKET_RECORDINGS, object_name=recording.file_path
        )

        # Save to temporary file
        with tempfile.NamedTemporaryFile(suffix=Path(recording.filename).suffix) as temp_file:
            temp_file.write(audio_data.read())
            temp_file.flush()

            # Load audio
            self.update_state(state="PROCESSING", meta={"stage": "loading_audio", "progress": 40})

            y, sr = librosa.load(temp_file.name, sr=None)
            duration = librosa.get_duration(y=y, sr=sr)

            # Update recording duration if missing
            if recording.duration is None:
                recording.duration = duration
                logger.info(
                    f"Updated missing duration for recording {recording.id}: {recording.duration:.2f}s"
                )
                db.commit()

            # Calculate Nyquist frequency (maximum meaningful frequency)
            nyquist_frequency = sr // 2

            # Update recording sample rate if not already set
            if recording.sample_rate != sr:
                logger.info(f"Updating recording sample rate from {recording.sample_rate} to {sr}")
                recording.sample_rate = sr
                db.commit()

            logger.info(
                f"Audio loaded: {duration:.2f}s, Sample Rate: {sr} Hz, Nyquist: {nyquist_frequency} Hz"
            )

            # Calculate appropriate width based on duration
            # Use 200 pixels per second for optimal resolution
            base_width_per_second = 200
            spectrogram_width = min(3200, max(800, int(duration * base_width_per_second)))
            spectrogram_height = 400

            # Generate spectrogram
            self.update_state(
                state="PROCESSING", meta={"stage": "generating_spectrogram", "progress": 60}
            )
            spectrogram_data = generate_spectrogram_image(
                y,
                sr,
                spectrogram_width,
                spectrogram_height,
                n_fft=2048,
                hop_length=512,
                max_frequency=nyquist_frequency,
            )

            # Upload spectrogram
            self.update_state(
                state="PROCESSING", meta={"stage": "uploading_spectrogram", "progress": 80}
            )
            spectrogram_path = f"spectrograms/{recording_id}/spectrogram.png"
            minio_client.upload_file(
                settings.MINIO_BUCKET_SPECTROGRAMS, spectrogram_path, spectrogram_data, "image/png"
            )

            # Update database record
            self.update_state(
                state="PROCESSING", meta={"stage": "updating_database", "progress": 90}
            )

            processing_time = time.time() - task_start

            spectrogram.status = SpectrogramStatus.COMPLETED
            spectrogram.image_path = spectrogram_path
            spectrogram.width = spectrogram_width
            spectrogram.height = spectrogram_height
            spectrogram.processing_time = processing_time
            spectrogram.parameters = {
                "n_fft": 2048,
                "hop_length": 512,
                "sample_rate": sr,
                "max_frequency": nyquist_frequency,
                "nyquist_frequency": nyquist_frequency,
                "duration": duration,
                "pixels_per_second": base_width_per_second,
            }

            # Clear multi-resolution paths if they exist
            spectrogram.thumbnail_path = None
            spectrogram.standard_path = None
            spectrogram.full_path = None

            db.commit()

            logger.info(
                f"Spectrogram generation completed for recording {recording_id} in {processing_time:.2f}s"
            )

            return {
                "status": "success",
                "recording_id": recording_id,
                "processing_time": processing_time,
                "path": spectrogram_path,
                "width": spectrogram_width,
                "height": spectrogram_height,
            }

    except SoftTimeLimitExceeded:
        logger.error(f"Task timeout for recording {recording_id}")
        if "spectrogram" in locals():
            spectrogram.status = SpectrogramStatus.FAILED
            spectrogram.error_message = "Task timeout"
            db.commit()
        raise

    except Exception as e:
        logger.error(f"Error generating spectrogram for recording {recording_id}: {str(e)}")
        if "spectrogram" in locals():
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
        recordings = (
            db.query(Recording)
            .outerjoin(Spectrogram)
            .filter((Spectrogram.id == None) | (Spectrogram.status != SpectrogramStatus.COMPLETED))
            .all()
        )

        total = len(recordings)
        logger.info(f"Found {total} recordings to process")

        results = []
        for idx, recording in enumerate(recordings):
            self.update_state(
                state="PROCESSING",
                meta={"current": idx + 1, "total": total, "recording_id": recording.id},
            )

            try:
                result = generate_spectrogram_task.delay(recording.id)
                results.append(
                    {"recording_id": recording.id, "task_id": result.id, "status": "queued"}
                )
            except Exception as e:
                results.append({"recording_id": recording.id, "status": "error", "error": str(e)})

        return {"status": "completed", "total_processed": total, "results": results}

    finally:
        db.close()
