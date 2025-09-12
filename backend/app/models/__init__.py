"""BSMarker models package."""

# Import all models to ensure relationships are properly configured
# Order matters for SQLAlchemy relationship configuration
from app.models.annotation import Annotation, BoundingBox
from app.models.project import Project
from app.models.recording import Recording
from app.models.spectrogram import Spectrogram
from app.models.user import User

__all__ = [
    "User",
    "Project",
    "Recording",
    "Spectrogram",
    "Annotation",
    "BoundingBox",
]
