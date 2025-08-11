from pydantic_settings import BaseSettings
from pydantic import ConfigDict, Field, field_validator
from typing import List
import re
import warnings


class Settings(BaseSettings):
    model_config = ConfigDict(env_file=".env", case_sensitive=True, extra="ignore")
    
    # Application Settings
    PROJECT_NAME: str = "BSMarker"
    VERSION: str = "1.0.0"
    API_V1_STR: str = "/api/v1"
    
    # Security Settings - NO HARDCODED DEFAULTS FOR PRODUCTION SECRETS
    DATABASE_URL: str = Field(..., description="PostgreSQL connection URL")
    SECRET_KEY: str = Field(..., description="JWT signing secret key")
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    
    # External Services - NO HARDCODED DEFAULTS FOR PRODUCTION SECRETS
    REDIS_URL: str = Field(..., description="Redis connection URL")
    
    # MinIO Storage Settings - NO HARDCODED DEFAULTS
    MINIO_ENDPOINT: str = Field(..., description="MinIO endpoint")
    MINIO_ACCESS_KEY: str = Field(..., description="MinIO access key") 
    MINIO_SECRET_KEY: str = Field(..., description="MinIO secret key")
    MINIO_SECURE: bool = False
    MINIO_BUCKET_RECORDINGS: str = "recordings"
    MINIO_BUCKET_SPECTROGRAMS: str = "spectrograms"
    
    # CORS Settings
    CORS_ORIGINS: List[str] = ["http://localhost:3456"]
    
    # Initial Admin User - NO HARDCODED DEFAULTS
    FIRST_ADMIN_EMAIL: str = Field(default="admin@bsmarker.com", description="Initial admin email")
    FIRST_ADMIN_PASSWORD: str = Field(..., description="Initial admin password")
    
    # File Upload Settings
    MAX_UPLOAD_SIZE: int = 100 * 1024 * 1024
    ALLOWED_AUDIO_EXTENSIONS: List[str] = [".mp3", ".wav", ".m4a", ".flac"]
    
    # Spectrogram Generation Settings
    SPECTROGRAM_N_FFT: int = 2048
    SPECTROGRAM_HOP_LENGTH: int = 512
    SPECTROGRAM_N_MELS: int = 128

    @field_validator('SECRET_KEY')
    @classmethod
    def validate_secret_key(cls, v: str) -> str:
        """Validate SECRET_KEY meets security requirements"""
        if len(v) < 32:
            raise ValueError("SECRET_KEY must be at least 32 characters long")
        
        # Check for common weak secrets
        weak_secrets = [
            "your-secret-key",
            "change-in-production", 
            "secret",
            "password",
            "admin123",
            "12345",
            "test"
        ]
        
        v_lower = v.lower()
        for weak in weak_secrets:
            if weak in v_lower:
                raise ValueError(f"SECRET_KEY contains weak pattern: {weak}")
        
        return v

    @field_validator('DATABASE_URL')
    @classmethod
    def validate_database_url(cls, v: str) -> str:
        """Validate DATABASE_URL format"""
        if not v.startswith('postgresql://'):
            raise ValueError("DATABASE_URL must start with 'postgresql://'")
        
        # Basic format validation
        if not re.match(r'postgresql://[^:]+:[^@]+@[^:/]+:\d+/[^/]+', v):
            raise ValueError("DATABASE_URL format invalid. Expected: postgresql://user:pass@host:port/db")
            
        # Check for weak passwords in URL
        if ':password@' in v or ':admin@' in v or ':123@' in v:
            warnings.warn("Database URL contains weak credentials", UserWarning)
        
        return v

    @field_validator('REDIS_URL')
    @classmethod
    def validate_redis_url(cls, v: str) -> str:
        """Validate REDIS_URL format"""
        if not v.startswith('redis://'):
            raise ValueError("REDIS_URL must start with 'redis://'")
        return v

    @field_validator('MINIO_ACCESS_KEY')
    @classmethod
    def validate_minio_access_key(cls, v: str) -> str:
        """Validate MinIO access key"""
        if len(v) < 8:
            raise ValueError("MINIO_ACCESS_KEY must be at least 8 characters long")
        
        if v == 'minioadmin':
            warnings.warn("Using default MinIO credentials in production is insecure", UserWarning)
        
        return v

    @field_validator('MINIO_SECRET_KEY')
    @classmethod
    def validate_minio_secret_key(cls, v: str) -> str:
        """Validate MinIO secret key"""
        if len(v) < 8:
            raise ValueError("MINIO_SECRET_KEY must be at least 8 characters long")
            
        if v == 'minioadmin':
            warnings.warn("Using default MinIO credentials in production is insecure", UserWarning)
        
        return v

    @field_validator('FIRST_ADMIN_PASSWORD')
    @classmethod 
    def validate_admin_password(cls, v: str) -> str:
        """Validate initial admin password"""
        if len(v) < 8:
            raise ValueError("FIRST_ADMIN_PASSWORD must be at least 8 characters long")
            
        weak_passwords = ['admin123', 'password', '12345678', 'admin', 'test']
        if v in weak_passwords:
            raise ValueError(f"FIRST_ADMIN_PASSWORD is too weak: {v}")
        
        return v

    @field_validator('CORS_ORIGINS')
    @classmethod
    def validate_cors_origins(cls, v: List[str]) -> List[str]:
        """Validate CORS origins"""
        for origin in v:
            if not origin.startswith(('http://', 'https://')):
                raise ValueError(f"CORS origin must start with http:// or https://: {origin}")
        return v


settings = Settings()