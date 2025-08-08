import io
import numpy as np
import librosa
import librosa.display
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from sqlalchemy.orm import Session
from app.core.config import settings
from app.db.session import SessionLocal
from app.models.recording import Recording
from app.models.spectrogram import Spectrogram
from app.services.minio_client import minio_client

def generate_spectrogram(audio_path: str, recording_id: int, db: Session):
    """Generate spectrogram from audio file and save to MinIO."""
    try:
        recording = db.query(Recording).filter(Recording.id == recording_id).first()
        if not recording:
            raise ValueError(f"Recording {recording_id} not found")
        
        # Load audio from the provided path
        y, sr = librosa.load(audio_path, sr=None)
        
        D = librosa.stft(y, n_fft=settings.SPECTROGRAM_N_FFT, hop_length=settings.SPECTROGRAM_HOP_LENGTH)
        S_db = librosa.amplitude_to_db(np.abs(D), ref=np.max)
        
        fig, ax = plt.subplots(figsize=(14, 5))
        img = librosa.display.specshow(
            S_db,
            sr=sr,
            hop_length=settings.SPECTROGRAM_HOP_LENGTH,
            x_axis='time',
            y_axis='hz',
            ax=ax,
            cmap='viridis'
        )
        ax.set_ylim(0, 10000)
        plt.colorbar(img, ax=ax, format='%+2.0f dB')
        plt.tight_layout()
        
        buffer = io.BytesIO()
        plt.savefig(buffer, format='png', dpi=100)
        buffer.seek(0)
        image_data = buffer.read()
        plt.close()
        
        spectrogram_path = f"spectrograms/{recording.id}_spectrogram.png"
        minio_client.upload_file(
            settings.MINIO_BUCKET_SPECTROGRAMS,
            spectrogram_path,
            image_data,
            "image/png"
        )
        
        spectrogram = Spectrogram(
            recording_id=recording_id,
            image_path=spectrogram_path,
            parameters={
                "n_fft": settings.SPECTROGRAM_N_FFT,
                "hop_length": settings.SPECTROGRAM_HOP_LENGTH,
                "sample_rate": sr
            },
            width=1400,
            height=500
        )
        db.add(spectrogram)
        db.commit()
        
        return spectrogram_path
        
    except Exception as e:
        print(f"Error generating spectrogram: {e}")
        raise