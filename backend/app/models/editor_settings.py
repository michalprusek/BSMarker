"""Per-user view settings of the annotation editor (palette, FFT, contrast, ...)."""

from sqlalchemy import JSON, Column, DateTime, ForeignKey, Integer, UniqueConstraint
from sqlalchemy.sql import func

from app.db.base_class import Base


class EditorDefaults(Base):
    """A user's defaults, used for every recording that has no settings of its own."""

    __tablename__ = "editor_defaults"

    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    settings = Column(JSON, nullable=False, default=dict)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class RecordingViewSettings(Base):
    """How one user last viewed one recording."""

    __tablename__ = "recording_view_settings"
    __table_args__ = (UniqueConstraint("user_id", "recording_id"),)

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    # ON DELETE CASCADE: deleting a recording (or its project) must not fail on these rows.
    recording_id = Column(
        Integer, ForeignKey("recordings.id", ondelete="CASCADE"), nullable=False, index=True
    )
    settings = Column(JSON, nullable=False, default=dict)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
