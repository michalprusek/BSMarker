from typing import TYPE_CHECKING, List

from sqlalchemy import JSON, Column, DateTime, Float, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, relationship
from sqlalchemy.sql import func

from app.db.base_class import Base

if TYPE_CHECKING:
    from app.models.recording import Recording
    from app.models.user import User


class Annotation(Base):
    __tablename__ = "annotations"

    id = Column(Integer, primary_key=True, index=True)
    recording_id = Column(Integer, ForeignKey("recordings.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    recording: Mapped["Recording"] = relationship("Recording", back_populates="annotations")
    user: Mapped["User"] = relationship("User", back_populates="annotations")
    bounding_boxes: Mapped[List["BoundingBox"]] = relationship(
        "BoundingBox", back_populates="annotation", cascade="all, delete-orphan"
    )


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
    extra_metadata = Column(JSON)  # Keep original column name

    annotation: Mapped["Annotation"] = relationship("Annotation", back_populates="bounding_boxes")
