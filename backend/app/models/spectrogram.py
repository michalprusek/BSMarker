from sqlalchemy import Column, Integer, String, ForeignKey, DateTime, JSON
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.db.database import Base

class Spectrogram(Base):
    __tablename__ = "spectrograms"

    id = Column(Integer, primary_key=True, index=True)
    recording_id = Column(Integer, ForeignKey("recordings.id"), nullable=False)
    image_path = Column(String, nullable=False)
    parameters = Column(JSON)
    width = Column(Integer)
    height = Column(Integer)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    recording = relationship("Recording", back_populates="spectrograms")