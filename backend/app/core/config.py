from pydantic_settings import BaseSettings
from pydantic import ConfigDict
from typing import List

class Settings(BaseSettings):
    model_config = ConfigDict(env_file=".env", case_sensitive=True, extra="ignore")
    
    PROJECT_NAME: str = "BSMarker"
    VERSION: str = "1.0.0"
    API_V1_STR: str = "/api/v1"
    
    DATABASE_URL: str = "postgresql://bsmarker:bsmarker_pass@postgres:5432/bsmarker_db"
    
    SECRET_KEY: str = "your-secret-key-change-in-production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    
    REDIS_URL: str = "redis://redis:6379"
    
    MINIO_ENDPOINT: str = "minio:9000"
    MINIO_ACCESS_KEY: str = "minioadmin"
    MINIO_SECRET_KEY: str = "minioadmin"
    MINIO_SECURE: bool = False
    MINIO_BUCKET_RECORDINGS: str = "recordings"
    MINIO_BUCKET_SPECTROGRAMS: str = "spectrograms"
    
    CORS_ORIGINS: List[str] = ["http://localhost:9993", "http://localhost:3000", "http://192.168.1.192:3000"]
    
    FIRST_ADMIN_EMAIL: str = "admin@bsmarker.com"
    FIRST_ADMIN_PASSWORD: str = "admin123"
    
    MAX_UPLOAD_SIZE: int = 100 * 1024 * 1024
    ALLOWED_AUDIO_EXTENSIONS: List[str] = [".mp3", ".wav", ".m4a", ".flac"]
    
    SPECTROGRAM_N_FFT: int = 2048
    SPECTROGRAM_HOP_LENGTH: int = 512
    SPECTROGRAM_N_MELS: int = 128

settings = Settings()