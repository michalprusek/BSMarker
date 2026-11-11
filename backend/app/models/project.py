from typing import TYPE_CHECKING, List

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, Text, false
from sqlalchemy.orm import Mapped, relationship
from sqlalchemy.sql import func

from app.db.base_class import Base

if TYPE_CHECKING:
    from app.models.recording import Recording
    from app.models.user import User


class Project(Base):
    __tablename__ = "projects"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    description = Column(Text)
    owner_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    # Whether syllables may overlap in time. Only changes what the editor reports
    # as a conflict; switching it never touches annotations.
    allow_overlaps = Column(Boolean, nullable=False, default=False, server_default=false())
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    owner: Mapped["User"] = relationship("User", back_populates="projects")
    recordings: Mapped[List["Recording"]] = relationship(
        "Recording", back_populates="project", cascade="all, delete-orphan"
    )
