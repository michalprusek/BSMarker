# CLAUDE.md

This file provides guidance to Claude Code when working with the BSMarker codebase.

# BSMarker - Bird Song Annotation Tool

## Test Credentials
- **Username**: newcastlea@gmail.com
- **Password**: bsmarker
- **Production URL**: https://bsmarker.utia.cas.cz

## Project Overview

BSMarker is a full-stack web application for annotating bird songs using spectrograms. Researchers and ornithologists can upload audio recordings, automatically generate spectrograms with inverted grayscale colormap (white background, black peaks), and annotate them with bounding boxes to identify bird species and sound types.

### Key Features
- Audio file upload and management (MP3, WAV, M4A, FLAC)
- Automatic spectrogram generation using Celery background tasks
- **Grayscale spectrograms** with white background and black peaks for optimal visibility
- Interactive canvas-based annotation with Konva.js
- Audio waveform visualization with WaveSurfer.js
- Zoom-to-cursor functionality for precise annotation
- Project-based organization
- Bulk operations (upload, delete, export)
- Real-time annotation feedback

## Repository Structure

```
BSMarker/
├── backend/                  # Python FastAPI backend
│   ├── app/
│   │   ├── api/             # API endpoints (versioned)
│   │   │   └── v1/
│   │   │       └── endpoints/  # Route handlers
│   │   ├── core/            # Core configuration & security
│   │   ├── db/              # Database session & connection
│   │   ├── models/          # SQLAlchemy ORM models
│   │   ├── schemas/         # Pydantic request/response schemas
│   │   ├── services/        # Business logic layer
│   │   │   ├── minio_client.py    # Object storage
│   │   │   └── cache_service.py   # Redis caching
│   │   ├── tasks/           # Celery background tasks
│   │   │   └── spectrogram_tasks.py  # Spectrogram generation
│   │   └── main.py          # FastAPI application entry
│   ├── migrations/          # Alembic database migrations
│   ├── scripts/             # Utility scripts
│   ├── tests/               # Backend tests
│   ├── requirements.txt     # Python dependencies
│   ├── Dockerfile           # Development image
│   └── Dockerfile.prod      # Production image
├── frontend/                # React TypeScript frontend
│   ├── src/
│   │   ├── components/      # React components
│   │   │   ├── annotation/  # Annotation-specific
│   │   │   └── shared/      # Reusable UI
│   │   ├── contexts/        # React Context providers
│   │   ├── hooks/           # Custom React hooks
│   │   ├── lib/             # Utility libraries
│   │   │   ├── spectrogram-utils.ts  # Coordinate transformations
│   │   │   ├── fileUtils.ts          # File handling
│   │   │   ├── errorUtils.ts         # Error utilities
│   │   │   └── notifications.ts      # Toast notifications
│   │   ├── pages/           # Route-level pages
│   │   ├── services/        # API client services
│   │   ├── types/           # TypeScript type definitions
│   │   └── utils/           # Helper utilities
│   ├── public/              # Static assets
│   ├── package.json         # Node dependencies
│   └── Dockerfile           # Production image
├── nginx/                   # Nginx reverse proxy config
├── scripts/                 # Deployment & utility scripts
├── docker-compose.yml       # Development orchestration
├── docker-compose.prod.yml  # Production orchestration
├── .pre-commit-config.yaml  # Pre-commit hooks
└── CLAUDE.md               # This file
```

## Technology Stack

### Frontend
- **React 18.2** with TypeScript 4.9
- **Tailwind CSS 3.3** for styling
- **Konva.js 9.3** for canvas-based annotation
- **WaveSurfer.js 7.5** for audio waveform visualization
- **React Router v6** for navigation
- **Axios 1.6** for API communication
- **React Hook Form 7.48** for form management
- **React Hot Toast** for notifications
- **React Window** for virtualized lists (performance)

### Backend
- **FastAPI 0.104** (Python) for REST API
- **SQLAlchemy 2.0** for ORM
- **PostgreSQL** for relational database
- **MinIO 7.2** for object storage (S3-compatible)
- **Redis 4.6** for caching and task queue
- **Celery 5.3** for background tasks (spectrogram generation)
- **JWT** (python-jose) for authentication
- **Librosa 0.10** for audio processing
- **Pillow 10.1** for image manipulation

### Infrastructure
- **Docker & Docker Compose** for containerization
- **Nginx** as reverse proxy and SSL termination
- **Let's Encrypt** for SSL certificates
- **Gunicorn** as WSGI server (production)
- **Uvicorn** as ASGI server (development)

## Architecture

### Layered Architecture Pattern

```
┌─────────────────────────────────────────────┐
│         Frontend (React + TypeScript)       │
│   Components → Hooks → Services → API      │
└─────────────────────┬───────────────────────┘
                      │ HTTPS (Nginx)
┌─────────────────────▼───────────────────────┐
│         Backend (FastAPI + Python)          │
│   API Endpoints → Services → Models → DB   │
│        ↓                ↓                   │
│   Celery Tasks    MinIO Storage            │
└─────────────────────────────────────────────┘
```

### Data Flow for Spectrogram Generation

```
1. User uploads audio file
2. Backend saves to MinIO
3. Celery task queued (generate_spectrogram_task)
4. Worker downloads audio, processes with librosa
5. Generate grayscale PNG (inverted: white bg, black peaks)
6. Upload spectrogram to MinIO
7. Update database with completion status
8. Frontend polls/fetches completed spectrogram
```

### Frontend Architecture

```
src/
├── components/
│   ├── annotation/       # Domain-specific components
│   │   ├── AnnotationCanvas.tsx
│   │   ├── BoundingBoxList.tsx
│   │   └── SpectrogramViewer.tsx
│   └── shared/           # Reusable UI components
│       ├── LoadingSpinner.tsx
│       ├── ErrorMessage.tsx
│       └── Modal.tsx
├── contexts/             # Global state management
│   ├── AuthContext.tsx
│   └── AnnotationEditorContext.tsx
├── hooks/                # Custom React hooks
│   ├── useAnnotationHistory.ts
│   └── useAuth.ts
├── lib/                  # Utility libraries (SSOT)
│   ├── spectrogram-utils.ts  # Coordinate transformations
│   ├── fileUtils.ts
│   ├── errorUtils.ts
│   └── notifications.ts
├── pages/                # Route-level components
│   ├── AnnotationEditor.tsx
│   ├── ProjectDashboard.tsx
│   └── RecordingsList.tsx
├── services/             # API communication
│   ├── api.ts           # Axios instance (default export)
│   ├── authService.ts
│   └── recordingService.ts
├── types/                # TypeScript definitions
│   └── index.ts
└── utils/                # Helper utilities
    └── coordinates.ts
```

### Backend Architecture

```
app/
├── api/
│   └── v1/
│       ├── api.py              # API router aggregation
│       └── endpoints/          # Individual route modules
│           ├── auth.py
│           ├── projects.py
│           ├── recordings.py
│           └── annotations.py
├── core/
│   ├── config.py              # Settings (Pydantic BaseSettings)
│   ├── security.py            # JWT, password hashing
│   └── celery_app.py          # Celery configuration
├── db/
│   ├── base.py                # SQLAlchemy Base
│   └── session.py             # Database session factory
├── models/                    # SQLAlchemy ORM models
│   ├── user.py
│   ├── project.py
│   ├── recording.py
│   ├── spectrogram.py
│   └── annotation.py
├── schemas/                   # Pydantic validation schemas
│   ├── user.py
│   ├── recording.py
│   └── annotation.py
├── services/                  # Business logic layer
│   ├── minio_client.py       # Object storage operations
│   └── cache_service.py      # Redis caching
├── tasks/                    # Celery background tasks
│   └── spectrogram_tasks.py  # Spectrogram generation
└── main.py                   # FastAPI app initialization
```

## Coding Standards & Best Practices

### General Principles

1. **Single Source of Truth (SSOT)**: Avoid code duplication. Centralize shared logic in `lib/` (frontend) or `services/` (backend).
2. **Separation of Concerns**: Keep business logic in services, UI logic in components, data access in models.
3. **Type Safety**: Use TypeScript interfaces and Python type hints throughout.
4. **Error Handling**: Consistent error handling with proper logging and user feedback.
5. **Security First**: Never hardcode secrets, validate all inputs, use parameterized queries.

### Frontend Best Practices

#### Naming Conventions
- **Components**: PascalCase (`AnnotationEditor.tsx`)
- **Hooks**: camelCase with 'use' prefix (`useSpectrogramZoom.ts`)
- **Utils/Lib**: camelCase (`coordinates.ts`, `spectrogram-utils.ts`)
- **Constants**: UPPER_SNAKE_CASE (`API_BASE_URL`)
- **Types/Interfaces**: PascalCase (`Recording`, `BoundingBox`)

#### Component Structure
```typescript
// Functional component with typed props
interface ComponentProps {
  data: DataType;
  onAction: (id: number) => void;
}

const Component: React.FC<ComponentProps> = ({ data, onAction }) => {
  // 1. Hooks at top
  const [state, setState] = useState<StateType>(initialState);

  // 2. Effects after hooks
  useEffect(() => {
    // Cleanup in return
    return () => cleanup();
  }, [dependencies]);

  // 3. Event handlers (memoized)
  const handleClick = useCallback(() => {
    onAction(data.id);
  }, [data.id, onAction]);

  // 4. Render
  return <div onClick={handleClick}>{data.name}</div>;
};
```

#### API Service Pattern
```typescript
// Centralized API client
import api from '../services/api';  // Default export!

// Service functions
export const recordingService = {
  getAll: () => api.get<Recording[]>('/recordings'),
  getById: (id: number) => api.get<Recording>(`/recordings/${id}`),
  create: (data: FormData) => api.post<Recording>('/recordings', data),
  delete: (id: number) => api.delete(`/recordings/${id}`)
};
```

#### State Management
- **Global State**: React Context for auth, theme
- **Local State**: useState for component-specific data
- **Custom Hooks**: Extract reusable stateful logic
- **No Redux**: Context API sufficient for current scale

#### Coordinate Transformations
**IMPORTANT**: All coordinate transformations centralized in `frontend/src/lib/spectrogram-utils.ts`:
- `SpectrogramCoordinates.timeToPixel()`
- `SpectrogramCoordinates.frequencyToPixel()`
- `SpectrogramCoordinates.pixelToTime()`
- `SpectrogramCoordinates.pixelToFrequency()`

Never duplicate coordinate transformation logic!

### Backend Best Practices

#### Naming Conventions
- **Variables/Functions**: snake_case
- **Classes**: PascalCase
- **Constants**: UPPER_SNAKE_CASE
- **Files**: snake_case
- **API Routes**: kebab-case (`/api/v1/recordings/{id}/spectrogram`)

#### Service Layer Pattern
```python
from sqlalchemy.orm import Session
from app.models.recording import Recording
from app.schemas.recording import RecordingCreate

class RecordingService:
    @staticmethod
    def create_recording(
        db: Session,
        recording: RecordingCreate,
        user_id: int
    ) -> Recording:
        db_recording = Recording(
            **recording.dict(),
            user_id=user_id
        )
        db.add(db_recording)
        db.commit()
        db.refresh(db_recording)
        return db_recording
```

#### API Endpoint Pattern
```python
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.api import deps

router = APIRouter()

@router.post("/", response_model=schemas.Recording)
def create_recording(
    recording: schemas.RecordingCreate,
    db: Session = Depends(deps.get_db),
    current_user: models.User = Depends(deps.get_current_user),
):
    # Dependency injection for DB and auth
    if not current_user:
        raise HTTPException(status_code=403, detail="Not authenticated")
    return services.recording.create_recording(db, recording, current_user.id)
```

#### Celery Task Pattern
```python
from app.core.celery_app import celery_app

@celery_app.task(bind=True, name="app.tasks.spectrogram_tasks.generate_spectrogram_task")
def generate_spectrogram_task(self, recording_id: int) -> Dict:
    """
    Generate spectrogram for a recording.
    Updates task state during processing.
    """
    self.update_state(state="PROCESSING", meta={"stage": "loading_audio"})
    # ... processing logic
    return {"status": "success", "recording_id": recording_id}
```

### Database Conventions

- **Table Names**: Plural, snake_case (`users`, `bounding_boxes`, `spectrograms`)
- **Column Names**: snake_case (`original_filename`, `created_at`)
- **Primary Keys**: `id` (integer auto-increment)
- **Foreign Keys**: `{table_singular}_id` (e.g., `user_id`, `recording_id`)
- **Timestamps**: `created_at`, `updated_at` with timezone
- **Indexes**: On foreign keys and frequently queried columns
- **Relationships**: Defined in models with `relationship()` and `back_populates`

### Error Handling

#### Frontend
```typescript
try {
  const response = await api.get('/endpoint');
  // Handle success
} catch (error) {
  if (axios.isAxiosError(error)) {
    // API error with response
    const message = error.response?.data?.detail || 'An error occurred';
    toast.error(message);
  } else {
    // Unexpected error
    console.error('Unexpected error:', error);
    toast.error('An unexpected error occurred');
  }
}
```

#### Backend
```python
from fastapi import HTTPException
from app.services.cache_service import cache_service
import logging

logger = logging.getLogger(__name__)

try:
    recording = db.query(Recording).filter(Recording.id == id).first()
    if not recording:
        raise HTTPException(status_code=404, detail="Recording not found")
except Exception as e:
    logger.error(f"Error fetching recording {id}: {str(e)}")
    raise HTTPException(status_code=500, detail="Internal server error")
```

## Key Implementation Details

### Spectrogram Generation

**Location**: `backend/app/tasks/spectrogram_tasks.py`

**Colormap**: Inverted grayscale
- White background (255) = low coefficients (silence)
- Black peaks (0) = high coefficients (bird songs)
- Implementation: `inverted_gray = 255 - S_db_norm`

**Process**:
1. Download audio from MinIO
2. Load with librosa: `y, sr = librosa.load(file, sr=None)`
3. Generate STFT: `librosa.stft(y, n_fft=2048, hop_length=512)`
4. Convert to dB: `librosa.amplitude_to_db()`
5. Normalize to 0-255
6. Invert for grayscale: `255 - normalized`
7. Create RGB image (R=G=B for grayscale)
8. Resize to target dimensions
9. Save as PNG to MinIO

**Parameters**:
- Width: 200 pixels/second (max 3200px, min 800px)
- Height: 400px
- n_fft: 2048
- hop_length: 512
- max_frequency: Nyquist frequency (sample_rate / 2)

### Authentication & Authorization

- **JWT tokens** with 30-minute expiration
- **Role-based access**: Admin vs. regular user
- **Password hashing**: bcrypt via passlib
- **Token storage**: localStorage (frontend)
- **Protected routes**: `Depends(deps.get_current_user)`

### Caching Strategy

**Redis caching** via `cache_service.py`:
- Project recordings list: 5 minutes TTL
- Individual recordings: 30 minutes TTL
- Spectrogram metadata: Until regeneration
- Cache invalidation on CRUD operations

### Performance Optimizations

#### Backend
1. **Database Indexes**: Applied via `scripts/apply_performance_indexes.py`
2. **Pagination**: All list endpoints with `skip` and `limit`
3. **JOINs**: Avoid N+1 queries with eager loading
4. **Connection Pooling**: SQLAlchemy pool size = 20
5. **Celery Workers**: Multiple workers for parallel processing

#### Frontend
1. **Virtual Scrolling**: `react-window` for large lists (1000+ items)
2. **Lazy Loading**: Code splitting with `React.lazy()`
3. **Debouncing**: 300ms on search inputs
4. **Memoization**: `React.memo` for expensive components
5. **Image Caching**: Browser cache with ETag validation

### File Upload & Storage

**Upload Flow**:
1. Frontend: FormData with file
2. Backend: Validate file type & size
3. Save to MinIO bucket: `recordings/`
4. Create DB record
5. Queue Celery task for spectrogram generation

**Supported Formats**: MP3, WAV, M4A, FLAC
**Max File Size**: 100MB (configurable)
**Storage**: MinIO (S3-compatible object storage)

## Development Workflow

### Local Development Setup

```bash
# 1. Clone repository
git clone <repo-url>
cd BSMarker

# 2. Environment configuration
cp .env.example .env
# Edit .env with your settings

# 3. Start Docker services
docker-compose up -d

# 4. Access application
# Frontend: http://localhost:3000
# Backend: http://localhost:8000
# API Docs: http://localhost:8000/docs
```

### Git Workflow

```bash
# Create feature branch from main
git checkout -b feature/new-feature main

# Make changes and commit
git add .
git commit -m "feat: Add new feature"

# Pre-commit hooks will run automatically
# Fix any issues before committing

# Push to remote
git push origin feature/new-feature

# Create pull request to main branch
```

### Code Quality Checks

#### Frontend
```bash
cd frontend
npm run typecheck      # TypeScript type checking
npm run lint           # ESLint
npm run lint:fix       # Auto-fix ESLint issues
npm run format         # Prettier formatting
npm run test           # Jest tests
npm run build          # Production build
```

#### Backend
```bash
cd backend
python -m black app/           # Code formatting
python -m isort app/           # Import sorting
python -m flake8 app/          # Linting
python -m mypy app/            # Type checking
python -m pytest               # Run tests
python -m pytest --cov=app     # Coverage report
```

### Pre-commit Hooks

**Configured** via `.pre-commit-config.yaml`:
- **black**: Python formatting
- **isort**: Python import sorting
- **flake8**: Python linting
- **mypy**: Python type checking
- **eslint**: TypeScript/JavaScript linting
- **prettier**: Code formatting
- **detect-secrets**: Prevent credential leaks

**Note**: Existing codebase may have pre-commit issues. Use `--no-verify` flag if necessary, but fix issues when possible.

### Testing Strategy

1. **Unit Tests**: Services, utilities, transformations
2. **Integration Tests**: API endpoints, database operations
3. **Component Tests**: React components with React Testing Library
4. **E2E Tests**: Critical user flows (Playwright)
5. **Performance Tests**: Large datasets, concurrent users

## Deployment

### Production Deployment

**Server**: https://bsmarker.utia.cas.cz

**IMPORTANT**: For production deployment, **ALWAYS use the optimized deployment scripts** located in the `scripts/` directory. These scripts provide:
- ✅ Parallel builds for faster deployment
- ✅ BuildKit caching for incremental builds
- ✅ Zero-downtime rolling updates
- ✅ Automated health checks
- ✅ SSL certificate management
- ✅ Resource monitoring

**Quick Start**:
```bash
# First-time setup (SSL certificates)
sudo ./scripts/setup-ssl.sh

# Build and deploy (optimized)
./scripts/deploy-prod.sh --build

# Deploy without rebuilding
./scripts/deploy-prod.sh

# Restart services only
./scripts/deploy-prod.sh --restart-only
```

**Build Only** (for testing):
```bash
# Standard optimized build with caching
./scripts/build-prod-optimized.sh

# Force rebuild without cache
./scripts/build-prod-optimized.sh --no-cache

# Pull latest base images before build
./scripts/build-prod-optimized.sh --pull
```

**Expected Performance**:
- First build (no cache): ~5-8 minutes
- Incremental build (with cache): ~1-2 minutes
- 3-5x faster than traditional docker-compose build

**⚠️ DO NOT USE** manual docker-compose commands for production:
```bash
# ❌ DEPRECATED - Don't use this anymore
docker-compose -f docker-compose.prod.yml build --no-cache
docker-compose -f docker-compose.prod.yml up -d
```

**Services**:
- `nginx`: Reverse proxy (ports 80, 443)
- `frontend`: React production build (nginx + static files)
- `backend`: FastAPI with Gunicorn
- `celery-worker`: Background task processor
- `celery-beat`: Scheduled tasks
- `postgres`: Database
- `redis`: Cache & message broker
- `minio`: Object storage

**For detailed deployment instructions**, see [DEPLOYMENT.md](DEPLOYMENT.md)

### SSL Certificates

- **Provider**: Let's Encrypt
- **Auto-renewal**: Certbot with cron job
- **Termination**: Nginx

### Environment Variables

**Backend** (`.env`):
```bash
DATABASE_URL=postgresql://user:password@postgres:5432/dbname  # pragma: allowlist secret
SECRET_KEY=<random-secret>
REDIS_URL=redis://redis:6379/0
MINIO_ENDPOINT=minio:9000
MINIO_ACCESS_KEY=<access-key>
MINIO_SECRET_KEY=<secret-key>
```

**Frontend**:
```bash
REACT_APP_API_BASE_URL=https://bsmarker.utia.cas.cz/api
```

## Security

1. **Authentication**: JWT with expiration and refresh
2. **Authorization**: Role-based access control (RBAC)
3. **Input Validation**: Pydantic schemas, TypeScript types
4. **SQL Injection**: Prevented via ORM parameterized queries
5. **XSS Protection**: React's built-in escaping
6. **CORS**: Configured for production domain only
7. **Rate Limiting**: SlowAPI middleware on all endpoints
8. **Secrets Management**: Environment variables, never in code
9. **HTTPS**: Enforced in production via Nginx

## Troubleshooting

### Common Issues

1. **Container not starting**
   ```bash
   docker logs <container_name>
   docker-compose restart <service>
   ```

2. **Database connection failed**
   ```bash
   docker exec bsmarker_postgres_1 psql -U user -d dbname
   # Check DATABASE_URL in .env
   ```

3. **Frontend build fails**
   ```bash
   rm -rf frontend/node_modules frontend/package-lock.json
   cd frontend && npm install
   ```

4. **Spectrogram generation stuck**
   ```bash
   docker logs bsmarker_celery-worker_1
   docker-compose restart celery-worker
   ```

5. **MinIO connection issues**
   ```bash
   docker exec bsmarker_minio_1 mc admin info local
   # Check MINIO_ENDPOINT, access keys
   ```

### Debugging Commands

```bash
# View logs
docker logs -f <container_name>

# Enter container
docker exec -it <container_name> /bin/bash

# Check database
docker exec bsmarker_postgres_1 psql -U bsmarker -d bsmarker

# Test API endpoint
curl -X GET https://bsmarker.utia.cas.cz/api/v1/health

# Check Redis
docker exec bsmarker_redis_1 redis-cli ping

# List MinIO buckets
docker exec bsmarker_minio_1 mc ls local/
```

### Performance Monitoring

```bash
# Container stats
docker stats

# Database connections
docker exec bsmarker_postgres_1 psql -U bsmarker -c "SELECT count(*) FROM pg_stat_activity;"

# Redis memory
docker exec bsmarker_redis_1 redis-cli INFO memory

# Celery task queue
docker exec bsmarker_redis_1 redis-cli LLEN celery
```

## API Endpoints

### Recording Endpoints

- `GET /api/v1/recordings/{project_id}/recordings` - List recordings with pagination
  - Query params: `search`, `min_duration`, `max_duration`, `annotation_status` (`all`, `annotated`, `unannotated`, `finished`), `sort_by`, `sort_order`
  - Returns: `PaginatedResponse` with `finished_count` and `annotated_count` in metadata
- `POST /api/v1/recordings/{project_id}/upload` - Upload audio file
- `GET /api/v1/recordings/{id}` - Get recording details
- `DELETE /api/v1/recordings/{id}` - Delete recording
- **`PATCH /api/v1/recordings/{id}/finished`** ⭐ **NEW** - Toggle finished status
  - Body: `{"is_finished": true/false}`
  - Response: Updated recording object
  - Use case: Mark recording as completed/reviewed

### Project Endpoints

- `GET /api/v1/projects` - List all projects
- `POST /api/v1/projects` - Create project
- `GET /api/v1/projects/{id}` - Get project details
- `PUT /api/v1/projects/{id}` - Update project
- `DELETE /api/v1/projects/{id}` - Delete project

### Annotation Endpoints

- `GET /api/v1/annotations/{recording_id}` - Get annotations for recording
- `POST /api/v1/annotations/{recording_id}` - Create annotation
- `PUT /api/v1/annotations/{id}` - Update annotation
- `DELETE /api/v1/annotations/{id}` - Delete annotation

## Common Patterns

### Loading States
Use `LoadingSpinner` component:
```typescript
{isLoading ? <LoadingSpinner /> : <Content />}
```

### Error Display
Use `toast.error()` for user feedback:
```typescript
import { toast } from 'react-hot-toast';
toast.error('Failed to load recordings');
```

### Form Handling
Use React Hook Form:
```typescript
const { register, handleSubmit, formState: { errors } } = useForm();
```

### Status Badges
Use `StatusBadge` component for consistent UI:
```typescript
import StatusBadge from '../components/shared/StatusBadge';

{recording.is_finished && <StatusBadge status="finished" />}
{recording.annotation_count > 0 && <StatusBadge status="annotated" />}
```

### Pagination
Backend returns `PaginatedResponse`:
```python
PaginatedResponse(
    items=recordings,
    pagination=PaginationMetadata(
        total=count,
        page=page,
        page_size=limit,
        total_pages=total_pages,
        finished_count=finished_count,  # NEW
        annotated_count=annotated_count  # NEW
    )
)
```

## Additional Resources

- [FastAPI Documentation](https://fastapi.tiangolo.com/)
- [React Documentation](https://react.dev/)
- [SQLAlchemy Documentation](https://docs.sqlalchemy.org/)
- [Celery Documentation](https://docs.celeryq.dev/)
- [Librosa Documentation](https://librosa.org/doc/latest/)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)

## Contributing Guidelines

1. Follow established patterns and conventions
2. Write clean, self-documenting code with comments
3. Add tests for new functionality
4. Update CLAUDE.md for architectural changes
5. Use meaningful commit messages (Conventional Commits)
6. Request code review before merging
7. Keep pull requests focused and atomic

## Recent Changes

- **2025-10-10**: Added "Finished" status feature for recording workflow tracking
  - New `is_finished` boolean field on Recording model with database migration
  - PATCH `/recordings/{id}/finished` endpoint for toggling status
  - Enhanced pagination metadata with `finished_count` and `annotated_count`
  - Yellow "Finished" badge in UI (VirtualizedRecordingList, AnnotationEditor)
  - New reusable `StatusBadge` component for consistent status display
  - Filter support for "finished" annotation status
  - Comprehensive backend tests for finished status functionality
- **2025-01-08**: Changed spectrogram colormap to inverted grayscale (white background, black peaks)
- **2025-01-07**: Added spectrogram-utils library for coordinate transformations (SSOT)
- **2025-01-06**: Implemented zoom-to-cursor for spectrogram and waveform
- **2025-01-05**: Fixed high-DPI display issues with canvas rendering

---

**Last Updated**: 2025-10-10
**Version**: 1.1.0
