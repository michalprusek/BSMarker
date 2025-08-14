# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# BSMarker - Bird Song Annotation Tool

## Project Overview
BSMarker is a full-stack web application designed for annotating bird songs using spectrograms. It enables researchers and ornithologists to upload audio recordings, automatically generate spectrograms, and annotate them with bounding boxes to identify different bird species and sound types.

## Recent Security Updates (2025-08-14)
- **Configuration**: Domain is now configurable via `REDIRECT_HOST` environment variable
- **Secrets Management**: All hardcoded credentials removed from documentation and code
- **Logging**: Replaced print statements with structured logging using Python's logging module
- **Docker Security**: Fixed health checks, pinned dependencies, and improved build reproducibility
- **Script Security**: Safe environment variable parsing, proper error handling, no command injection
- **Access Control**: MinIO proxy secured with IP restrictions and authentication
- **Rate Limiting**: Adjusted to reasonable levels (auth: 20r/m, general: 50r/s, api: 30r/s)

## ⚠️ PRODUCTION ENVIRONMENT SETUP
- **ALWAYS use Docker Compose** for running the application
- **Use `docker-compose.prod.yml`** for production deployment
- **Domain**: https://bsmarker.utia.cas.cz
- **Ports**: Frontend/Backend via nginx (80/443), MinIO=9000/9001 (internal), PostgreSQL=5432 (internal), Redis=6379 (internal)

## Common Docker Commands

### Backend (FastAPI in Docker)
```bash
# Run tests in Docker
sudo docker exec bsmarker_backend_1 python -m pytest

# Type checking
sudo docker exec bsmarker_backend_1 python -m mypy app/

# Linting
sudo docker exec bsmarker_backend_1 python -m pylint app/
sudo docker exec bsmarker_backend_1 python -m black app/ --check

# Database operations
sudo docker exec bsmarker_backend_1 python -c "from app.db.database import engine; from app.models import *; from app.db.base import Base; Base.metadata.create_all(bind=engine)"
```

### Frontend (React in Docker)
```bash
# Rebuild frontend image
sudo docker-compose -f docker-compose.prod.yml build frontend

# Check frontend logs
sudo docker logs bsmarker_frontend_1

# Restart frontend
sudo docker restart bsmarker_frontend_1 bsmarker_frontend_2
```

### Docker Management
```bash
# View all containers
sudo docker-compose -f docker-compose.prod.yml ps

# Restart all services
sudo docker-compose -f docker-compose.prod.yml restart

# View logs
sudo docker-compose -f docker-compose.prod.yml logs -f backend

# Execute commands in container
sudo docker exec bsmarker_backend_1 <command>
```

## Architecture Patterns & Key Decisions

### Backend Architecture (FastAPI)
- **Layered Architecture**: API endpoints → Services → Models → Database
- **Dependency Injection**: Database sessions via FastAPI dependencies
- **Authentication**: JWT tokens with passlib bcrypt hashing
- **File Processing**: Async with librosa for spectrogram generation
- **API Versioning**: `/api/v1/` prefix for all endpoints
- **Error Handling**: HTTPException with proper status codes
- **CORS**: Configured for https://bsmarker.utia.cas.cz

### Frontend Architecture (React/TypeScript)  
- **State Management**: React Context API for auth, local state for components
- **Routing**: React Router v6 with protected routes
- **Forms**: React Hook Form with validation
- **Canvas Annotations**: Konva.js for bounding box drawing
- **Audio**: WaveSurfer.js for waveform visualization
- **API Client**: Axios with interceptors for auth tokens
- **Styling**: Tailwind CSS with HeadlessUI components

### Critical File Patterns

#### Backend Service Pattern
```python
# backend/app/services/example.py
from sqlalchemy.orm import Session
from app.models.example import Example
from app.schemas.example import ExampleCreate

def create_example(db: Session, example: ExampleCreate):
    db_example = Example(**example.dict())
    db.add(db_example)
    db.commit()
    db.refresh(db_example)
    return db_example
```

#### Frontend API Service Pattern
```typescript
// frontend/src/services/api.ts
import axios from 'axios';

const API_URL = process.env.REACT_APP_API_URL || 'https://bsmarker.utia.cas.cz';

export const apiClient = axios.create({
  baseURL: `${API_URL}/api/v1`,
  headers: { 'Content-Type': 'application/json' }
});

// Add auth token interceptor
apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});
```

## Key Implementation Details

### Authentication Flow
1. User logs in via `/api/v1/auth/login` with email/password
2. Backend validates credentials, returns JWT token
3. Frontend stores token in localStorage
4. All subsequent requests include `Authorization: Bearer <token>` header
5. Backend validates JWT on protected endpoints via `get_current_user` dependency

### Spectrogram Generation Pipeline
1. User uploads audio file → stored in MinIO bucket
2. Backend creates database record with metadata
3. `services/spectrogram.py` processes audio with librosa:
   - Loads audio file from MinIO
   - Generates mel spectrogram (n_mels=128, hop_length=512)
   - Saves as PNG to MinIO
   - Updates database with spectrogram path
4. Frontend fetches spectrogram URL for display

### Annotation Data Model
- **annotations**: Session metadata (recording_id, user_id, created_at)
- **bounding_boxes**: Individual box data
  - Pixel coordinates: x, y, width, height
  - Time range: start_time, end_time (seconds)
  - Frequency range: min_freq, max_freq (Hz)
  - Label: species/call type string

## Debugging & Troubleshooting

### Common Issues & Solutions

#### Backend Not Starting
```bash
# Check Docker container status
sudo docker ps -a | grep backend

# Check backend logs
sudo docker logs bsmarker_backend_1 --tail 50

# Test database connection in Docker
sudo docker exec bsmarker_backend_1 python -c "from app.db.database import engine; print('DB connected')"

# Restart backend containers
sudo docker restart bsmarker_backend_1 bsmarker_backend_2
```

#### Frontend Issues
```bash
# Check frontend container status
sudo docker ps -a | grep frontend

# View frontend logs
sudo docker logs bsmarker_frontend_1 --tail 50

# Rebuild frontend
sudo docker-compose -f docker-compose.prod.yml build frontend
sudo docker-compose -f docker-compose.prod.yml up -d frontend
```

#### Service Health Checks
```bash
# Check nginx status
curl -k https://localhost/health

# Check all container health
sudo docker ps --format "table {{.Names}}\t{{.Status}}"

# Check MinIO connectivity
sudo docker exec bsmarker_backend_1 python -c "from app.services.minio_client import minio_client; print('MinIO connected')"
```

## API Testing with curl

```bash
# Set your credentials
export USERNAME="your-email@example.com"
export PASSWORD="your-password"

# Login and get token (via HTTPS)
TOKEN=$(curl -k -X POST https://localhost/api/v1/auth/login \
  -H "Content-Type: multipart/form-data" \
  -F "username=${USERNAME}" \
  -F "password=${PASSWORD}" \
  | jq -r '.access_token')

# Test authenticated endpoint
curl -k -H "Authorization: Bearer $TOKEN" \
  https://localhost/api/v1/auth/me

# Upload audio file
curl -k -X POST https://localhost/api/v1/recordings/1/upload \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@test.mp3"
```

## Critical Workflow Patterns

### Adding a New API Endpoint
1. Create Pydantic schema in `backend/app/schemas/`
2. Add SQLAlchemy model in `backend/app/models/` if needed
3. Implement service logic in `backend/app/services/`
4. Create endpoint in `backend/app/api/api_v1/endpoints/`
5. Add route to `backend/app/api/api_v1/api.py`
6. Update frontend API service in `frontend/src/services/`
7. Create/update React component in `frontend/src/pages/` or `frontend/src/components/`

### Database Changes
```bash
# Update database schema in Docker
sudo docker exec bsmarker_backend_1 python -c "from app.db.database import engine; from app.models import *; from app.db.base import Base; Base.metadata.create_all(bind=engine)"

# Check database tables
sudo docker exec bsmarker_postgres_1 psql -U bsmarker -d bsmarker_db -c "\dt"
```

### Debugging Failed Requests
1. Check browser DevTools Network tab for request/response
2. Check backend logs: `sudo docker logs bsmarker_backend_1 --tail 50`
3. Check nginx logs: `sudo docker logs bsmarker_nginx_1 --tail 50`
4. Verify token is valid: `localStorage.getItem('token')` in browser console
5. Test endpoint directly with curl (see API Testing section)

## Environment Variables

### Production Environment (.env.production)
```bash
DATABASE_URL=postgresql://bsmarker:${DB_PASSWORD}@postgres:5432/bsmarker_db
REDIS_URL=redis://redis:6379/0
MINIO_ENDPOINT=minio:9000
MINIO_ACCESS_KEY=${MINIO_ACCESS_KEY}
MINIO_SECRET_KEY=${MINIO_SECRET_KEY}
SECRET_KEY=${JWT_SECRET_KEY}
CORS_ORIGINS=["https://bsmarker.utia.cas.cz"]
FIRST_ADMIN_EMAIL=admin@bsmarker.com
FIRST_ADMIN_PASSWORD=${ADMIN_PASSWORD}
```

### Docker Compose Variables
```bash
# Set in docker-compose.prod.yml or via environment
DB_USER=bsmarker
DB_PASSWORD=<secure-password>
DB_NAME=bsmarker_db
MINIO_ACCESS_KEY=<secure-key>
MINIO_SECRET_KEY=<secure-key>
JWT_SECRET_KEY=<secure-key>
```

## Key Files to Know

### Backend
- `backend/app/main.py` - FastAPI app initialization, middleware, routers
- `backend/app/core/config.py` - Settings management with pydantic-settings
- `backend/app/core/security.py` - JWT creation, password hashing
- `backend/app/db/database.py` - SQLAlchemy engine and session setup
- `backend/app/api/deps.py` - Common dependencies (get_db, get_current_user)

### Frontend  
- `frontend/src/App.tsx` - Main app component with routing
- `frontend/src/contexts/AuthContext.tsx` - Authentication state management
- `frontend/src/services/api.ts` - Axios client configuration
- `frontend/src/pages/AnnotationEditor.tsx` - Complex Konva canvas implementation
- `frontend/src/components/AudioPlayer.tsx` - WaveSurfer.js integration