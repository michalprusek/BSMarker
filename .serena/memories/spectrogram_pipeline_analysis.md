# BSMarker Spectrogram Generation Pipeline Analysis

## Current Status: FUNCTIONAL ✅

The spectrogram generation workflow is working correctly after the recent refactoring. The `backend/app/services/spectrogram.py` service was moved into `backend/app/tasks/spectrogram_tasks.py` as part of a proper async task implementation.

## Complete Workflow

### 1. Audio Upload Process
- **File Upload**: User uploads audio via `/api/v1/recordings/{project_id}/upload`
- **Validation**: File format validation (MP3, WAV, M4A, FLAC), size limits (100MB max)
- **Storage**: Audio file stored in MinIO bucket `recordings`
- **Database**: Recording metadata saved to PostgreSQL
- **Task Queue**: Celery task `generate_spectrogram_task` queued automatically

### 2. Spectrogram Generation (Async)
- **Celery Worker**: Processes task in dedicated `celery-worker` container
- **Audio Processing**: Uses librosa with optimized parameters:
  - `n_fft=2048` (FFT window size)
  - `hop_length=512` (frame hop length)
  - Frequency range: 0-10kHz (bird song optimized)
  - Dynamic width: 200 pixels/second (800-3200px range)
  - Fixed height: 400px
- **Image Generation**: Creates PNG with viridis colormap
- **Storage**: Saves spectrogram to MinIO bucket `spectrograms`
- **Database Update**: Updates spectrogram record with completion status

### 3. Frontend Display
- **Status Polling**: Frontend checks `/recordings/{id}/spectrogram/status`
- **Image Loading**: Fetches spectrogram via `/recordings/{id}/spectrogram`
- **Canvas Rendering**: Uses React Konva for annotation overlays
- **Synchronization**: Audio playback synced with spectrogram timeline

## Key Configuration

### Librosa Parameters (Optimized for Bird Songs)
```python
n_fft = 2048          # FFT window size
hop_length = 512      # Frame hop length  
max_frequency = 10000 # 10kHz upper limit
sample_rate = varies  # Preserved from original audio
```

### MinIO Buckets
- `recordings` - Original audio files
- `spectrograms` - Generated spectrogram images

### Database Models
- `recordings` - Audio file metadata
- `spectrograms` - Generation status, paths, parameters, timing

### Celery Configuration
- **Queue**: `spectrogram` queue for audio processing tasks
- **Timeout**: 5 minutes hard limit, 4 minutes soft limit
- **Concurrency**: 2 workers
- **Retry**: Task acks late, reject on worker lost

## Error Handling
- **Processing Failures**: Recorded in database with error messages
- **Status Tracking**: PENDING → PROCESSING → COMPLETED/FAILED
- **Frontend Feedback**: Real-time status updates and error messages
- **Timeout Handling**: SoftTimeLimitExceeded catches hung processes

## Performance Features
- **Async Processing**: Non-blocking uploads with background generation
- **Caching**: 24-hour cache headers for generated spectrograms
- **Memory Management**: Temporary file cleanup and stream processing
- **Connection Resilience**: MinIO reconnection on failures

## Verified Components ✅
1. ✅ Task queue properly configured (Celery + Redis)
2. ✅ Audio processing pipeline functional (librosa integration)
3. ✅ MinIO storage and retrieval working
4. ✅ Database models and status tracking complete
5. ✅ Frontend display and annotation system operational
6. ✅ API endpoints properly routing requests
7. ✅ Docker container orchestration configured
8. ✅ Error handling and timeout management implemented
