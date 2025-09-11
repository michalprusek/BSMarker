# BSMarker Project Overview

## Purpose
BSMarker is a full-stack web application for annotating bird songs using spectrograms. It enables researchers and ornithologists to upload audio recordings, automatically generate spectrograms, and annotate them with bounding boxes to identify different bird species and sound types.

## Tech Stack

### Backend
- **FastAPI** - REST API framework with async support
- **PostgreSQL** - Primary database for storing metadata
- **Redis** - Cache and Celery message broker
- **MinIO** - S3-compatible object storage for audio files and spectrograms
- **Celery** - Asynchronous task processing (spectrogram generation)
- **librosa** - Audio processing and spectrogram generation
- **SQLAlchemy** - ORM for database operations
- **Pydantic** - Data validation and serialization

### Frontend
- **React 18** with TypeScript
- **Tailwind CSS** - Utility-first CSS framework
- **React Konva** - Canvas library for annotation drawing
- **WaveSurfer.js** - Audio visualization and playback
- **React Hook Form** - Form handling
- **React Hot Toast** - Notifications
- **Axios** - HTTP client

## Architecture
- **Containerized deployment** with Docker and Docker Compose
- **Microservices architecture** with separate containers for:
  - FastAPI backend (2 replicas)
  - Celery worker for async tasks
  - Celery beat scheduler
  - PostgreSQL database
  - Redis message broker
  - MinIO object storage
  - React frontend (2 replicas)
  - Nginx reverse proxy with SSL
  - Automated backup service

## Domain
- **Production**: https://bsmarker.utia.cas.cz
- **SSL**: Let's Encrypt certificates with automated renewal
