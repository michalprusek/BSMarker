from typing import TYPE_CHECKING

from app.db.base_class import Base
from sqlalchemy import Column, DateTime, Float, ForeignKey, Integer, String
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

if TYPE_CHECKING:
    from app.models.annotation import Annotation
    from app.models.project import Project
    from app.models.spectrogram import Spectrogram


class Recording(Base):
    __tablename__ = "recordings"

    id = Column(Integer, primary_key=True, index=True)
    filename = Column(String, nullable=False)
    original_filename = Column(String, nullable=False)
    file_path = Column(String, nullable=False)
    duration = Column(Float)
    sample_rate = Column(Integer)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    project = relationship("Project", back_populates="recordings")
    spectrograms = relationship(
        "Spectrogram", back_populates="recording", cascade="all, delete-orphan"
    )
    annotations = relationship(
        "Annotation", back_populates="recording", cascade="all, delete-orphan"
    )
