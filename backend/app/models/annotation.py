from sqlalchemy import Column, Integer, String, ForeignKey, DateTime, Float, JSON
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.db.database import Base

class Annotation(Base):
    __tablename__ = "annotations"

    id = Column(Integer, primary_key=True, index=True)
    recording_id = Column(Integer, ForeignKey("recordings.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    recording = relationship("Recording", back_populates="annotations")
    user = relationship("User", back_populates="annotations")
    bounding_boxes = relationship("BoundingBox", back_populates="annotation", cascade="all, delete-orphan")

class BoundingBox(Base):
    __tablename__ = "bounding_boxes"

    id = Column(Integer, primary_key=True, index=True)
    annotation_id = Column(Integer, ForeignKey("annotations.id"), nullable=False)
    x = Column(Float, nullable=False)
    y = Column(Float, nullable=False)
    width = Column(Float, nullable=False)
    height = Column(Float, nullable=False)
    start_time = Column(Float, nullable=False)
    end_time = Column(Float, nullable=False)
    min_frequency = Column(Float)
    max_frequency = Column(Float)
    label = Column(String, nullable=False)
    confidence = Column(Float)
    extra_data = Column(JSON)

    annotation = relationship("Annotation", back_populates="bounding_boxes")