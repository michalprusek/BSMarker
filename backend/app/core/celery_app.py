"""
Celery configuration for BSMarker background tasks.
"""

from app.core.config import settings

# Import all models to ensure SQLAlchemy relationships are properly configured
# This must happen before creating the Celery app to avoid relationship errors
from app.models import *  # noqa: F403,F401
from celery import Celery

# Create Celery instance
celery_app = Celery(
    "bsmarker",
    broker=settings.REDIS_URL,
    backend=settings.REDIS_URL,
    include=["app.tasks.spectrogram_tasks"],
)

# Configure Celery
celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    # Task configuration
    task_track_started=True,
    task_time_limit=300,  # 5 minutes max per task
    task_soft_time_limit=240,  # 4 minutes soft limit
    # Result backend configuration
    result_expires=3600,  # Results expire after 1 hour
    # Worker configuration
    worker_prefetch_multiplier=2,
    worker_max_tasks_per_child=100,
    # Retry configuration
    task_acks_late=True,
    task_reject_on_worker_lost=True,
    # Beat schedule for periodic tasks (if needed)
    beat_schedule={},
)

# Task routing
celery_app.conf.task_routes = {
    "app.tasks.spectrogram_tasks.*": {"queue": "spectrogram"},
    "app.tasks.default.*": {"queue": "default"},
}

# Task priorities
celery_app.conf.task_annotations = {
    "app.tasks.spectrogram_tasks.generate_spectrogram_task": {"priority": 5},
    "app.tasks.spectrogram_tasks.generate_thumbnail_task": {"priority": 10},
}
