from app.db.base_class import Base
from app.models.annotation import Annotation, BoundingBox
from app.models.project import Project
from app.models.recording import Recording
from app.models.spectrogram import Spectrogram
from app.models.user import User

# Re-exported so that Base.metadata knows every table (used by init_db and alembic).
__all__ = [
    "Base",
    "Annotation",
    "BoundingBox",
    "Project",
    "Recording",
    "Spectrogram",
    "User",
]
