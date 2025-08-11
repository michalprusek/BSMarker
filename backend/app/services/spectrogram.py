import io
import tempfile
import time
import logging
import numpy as np
import librosa
from pathlib import Path
from PIL import Image
from sqlalchemy.orm import Session
from app.core.config import settings
from app.db.session import SessionLocal
from app.models.recording import Recording
from app.models.spectrogram import Spectrogram
from app.services.minio_client import minio_client

logger = logging.getLogger(__name__)

def generate_spectrogram(audio_path: str, recording_id: int, db: Session):
    """Generate spectrogram from audio file and save to MinIO."""
    generation_start = time.time()
    logger.info(f"Starting spectrogram generation for recording {recording_id}")
    try:
        recording = db.query(Recording).filter(Recording.id == recording_id).first()
        if not recording:
            raise ValueError(f"Recording {recording_id} not found")
        
        # Validate that audio_path is within temp directory for security
        audio_path_obj = Path(audio_path).resolve()
        temp_dir = Path(tempfile.gettempdir()).resolve()
        
        if not audio_path_obj.is_relative_to(temp_dir):
            raise ValueError("Audio path is outside allowed temporary directory")
        
        if not audio_path_obj.exists():
            raise ValueError("Audio file does not exist")
        
        # Load audio from the provided path
        audio_load_start = time.time()
        y, sr = librosa.load(str(audio_path_obj), sr=None)
        logger.info(f"Audio loaded in {time.time() - audio_load_start:.2f}s - Duration: {len(y)/sr:.2f}s, Sample Rate: {sr}")
        
        # Generate STFT
        stft_start = time.time()
        D = librosa.stft(y, n_fft=settings.SPECTROGRAM_N_FFT, hop_length=settings.SPECTROGRAM_HOP_LENGTH)
        S_db = librosa.amplitude_to_db(np.abs(D), ref=np.max)
        logger.info(f"STFT computation completed in {time.time() - stft_start:.2f}s")
        
        # Limit frequency range to 0-10kHz
        # Calculate the frequency bins
        freqs = librosa.fft_frequencies(sr=sr, n_fft=settings.SPECTROGRAM_N_FFT)
        # Find the index for 10kHz cutoff
        max_freq_idx = np.where(freqs <= 10000)[0][-1]
        # Slice the spectrogram to only include frequencies up to 10kHz
        S_db_limited = S_db[:max_freq_idx, :]
        
        # Normalize to 0-255 for image
        S_db_norm = S_db_limited - S_db_limited.min()
        S_db_norm = (S_db_norm / S_db_norm.max() * 255).astype(np.uint8)
        
        # Flip vertically so low frequencies are at bottom
        S_db_norm = np.flipud(S_db_norm)
        
        # Apply viridis colormap manually
        from matplotlib import cm
        viridis = cm.get_cmap('viridis')
        colored = viridis(S_db_norm)
        # Convert to RGB (removing alpha channel)
        rgb_array = (colored[:, :, :3] * 255).astype(np.uint8)
        
        # Create PIL image
        img = Image.fromarray(rgb_array)
        
        # Resize to desired dimensions (width based on duration, height fixed)
        # Calculate appropriate width based on audio duration
        duration = len(y) / sr
        width = int(duration * 200)  # 200 pixels per second
        width = min(max(width, 800), 3200)  # Clamp between 800 and 3200 pixels
        height = 400
        img = img.resize((width, height), Image.Resampling.LANCZOS)
        
        # Save to buffer
        buffer = io.BytesIO()
        img.save(buffer, format='PNG')
        buffer.seek(0)
        image_data = buffer.read()
        
        spectrogram_path = f"spectrograms/{recording.id}_spectrogram.png"
        upload_start = time.time()
        minio_client.upload_file(
            settings.MINIO_BUCKET_SPECTROGRAMS,
            spectrogram_path,
            image_data,
            "image/png"
        )
        logger.info(f"Spectrogram uploaded to MinIO in {time.time() - upload_start:.2f}s")
        
        spectrogram = Spectrogram(
            recording_id=recording_id,
            image_path=spectrogram_path,
            parameters={
                "n_fft": settings.SPECTROGRAM_N_FFT,
                "hop_length": settings.SPECTROGRAM_HOP_LENGTH,
                "sample_rate": sr,
                "max_frequency": 10000
            },
            width=width,
            height=height
        )
        db.add(spectrogram)
        db.commit()
        
        total_time = time.time() - generation_start
        logger.info(f"Spectrogram generation completed for recording {recording_id} in {total_time:.2f}s")
        return spectrogram_path
        
    except Exception as e:
        logger.error(f"Error generating spectrogram for recording {recording_id}: {e}")
        raise