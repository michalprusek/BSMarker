from sqlalchemy import Column, Integer, String, ForeignKey, DateTime, JSON, Float, Enum
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.db.base_class import Base
import enum

class SpectrogramStatus(enum.Enum):
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"

class Spectrogram(Base):
    __tablename__ = "spectrograms"

    id = Column(Integer, primary_key=True, index=True)
    recording_id = Column(Integer, ForeignKey("recordings.id"), nullable=False)
    
    # Status tracking
    status = Column(Enum(SpectrogramStatus), default=SpectrogramStatus.PENDING, nullable=False)
    error_message = Column(String, nullable=True)
    processing_time = Column(Float, nullable=True)
    
    # Multi-resolution paths
    thumbnail_path = Column(String, nullable=True)  # Small preview (~800px)
    standard_path = Column(String, nullable=True)   # Standard view (~1600px)
    full_path = Column(String, nullable=True)       # Full resolution (~6400px)
    
    # Legacy compatibility
    image_path = Column(String, nullable=True)  # Points to standard_path for backward compatibility
    
    # Metadata
    parameters = Column(JSON, nullable=True)
    width = Column(Integer, nullable=True)
    height = Column(Integer, nullable=True)
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relationships
    recording = relationship("Recording", back_populates="spectrograms")