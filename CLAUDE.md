# CLAUDE.md - BSMarker

## Server Info
- **This is the PRODUCTION SERVER** (hostname: bsmarker)
- Path: /home/prusek/BSMarker
- Docker containers run here directly

## ⚠️ PRODUCTION SAFETY RULES

**CRITICAL: This server contains REAL USER DATA - handle with extreme care!**

1. **NEVER run DELETE, DROP, or TRUNCATE** on the database without explicit user approval
2. **NEVER use destructive git commands** (force push, hard reset) without backup
3. **ALWAYS backup before migrations** that modify existing data
4. **Use read-only queries first** to understand data before any modifications
5. **Test ALL changes on development** before deploying to production
6. **Review each implementation** with `code-simplifier` agent before committing

### Database Access (Read-Only)
```bash
docker exec dc8142b91d23_bsmarker_postgres_1 psql -U bsmarker -d bsmarker_db -c "YOUR_QUERY"
```

### Current Data Volume (as of 2026-01-15)
| Table | Records | Notes |
|-------|---------|-------|
| users | 6 | 3 admins, 3 annotators |
| projects | 5 | 1 main + 4 test projects |
| recordings | 1,051 | 1,011 in main project |
| spectrograms | 1,051 | 1:1 with recordings |
| annotations | 1,027 | User annotation sessions |
| bounding_boxes | 51,459 | Actual bird song annotations |

## Test Credentials
- **URL**: https://bsmarker.utia.cas.cz
- **Username**: newcastlea@gmail.com
- **Password**: bsmarker

## Overview
Bird song annotation tool - upload audio, generate spectrograms, annotate with bounding boxes.

## Tech Stack
| Frontend | Backend | Infrastructure |
|----------|---------|----------------|
| React 18 + TypeScript | FastAPI + Python | Docker + Nginx |
| Tailwind CSS | SQLAlchemy + PostgreSQL | Let's Encrypt SSL |
| Konva.js (canvas) | Celery + Redis | MinIO (S3 storage) |
| WaveSurfer.js (audio) | Librosa (audio processing) | |

## Project Structure
```
BSMarker/
├── backend/
│   └── app/
│       ├── api/v1/endpoints/    # Route handlers
│       ├── core/                # Config, security, celery
│       ├── models/              # SQLAlchemy models
│       ├── schemas/             # Pydantic schemas
│       ├── services/            # Business logic (minio, cache)
│       └── tasks/               # Celery tasks (spectrogram)
├── frontend/
│   └── src/
│       ├── components/          # React components
│       ├── contexts/            # Auth, AnnotationEditor
│       ├── hooks/               # Custom hooks
│       ├── lib/                 # Utils (spectrogram-utils.ts!)
│       ├── pages/               # Route pages
│       └── services/            # API client
├── nginx/                       # Reverse proxy
├── scripts/                     # Deployment scripts
├── docker-compose.yml           # Development
└── docker-compose.prod.yml      # Production
```

## Naming Conventions

### Frontend
- Components: `PascalCase.tsx`
- Hooks: `useHookName.ts`
- Utils: `camelCase.ts`
- Types: `PascalCase`

### Backend
- Files/functions: `snake_case`
- Classes: `PascalCase`
- API routes: `kebab-case`
- Tables: plural `snake_case` (users, recordings)
- Foreign keys: `{table_singular}_id`

## Critical Rules

1. **Coordinate transformations**: Always use `frontend/src/lib/spectrogram-utils.ts` - never duplicate!
2. **API client**: Use `import api from '../services/api'` (default export)
3. **State**: React Context for global (auth), useState for local
4. **Spectrograms**: Inverted grayscale (white bg, black peaks)

## API Endpoints
```
GET/POST   /api/v1/projects
GET/PUT/DEL /api/v1/projects/{id}

GET        /api/v1/recordings/{project_id}/recordings  (pagination, filters)
POST       /api/v1/recordings/{project_id}/upload
PATCH      /api/v1/recordings/{id}/finished

GET/POST   /api/v1/annotations/{recording_id}
PUT/DEL    /api/v1/annotations/{id}
```

## Development
```bash
docker-compose up -d
# Frontend: http://localhost:3000
# Backend: http://localhost:8000/docs
```

## Production Deployment
```bash
./scripts/deploy-prod.sh --build    # Build & deploy
./scripts/deploy-prod.sh            # Deploy only
```

## Quick Debugging
```bash
docker logs -f <container>
docker exec -it <container> /bin/bash
docker stats
```

## Database Schema

```
users (6)
├── id, email (unique), username (unique), hashed_password
├── full_name, is_active, is_admin, created_at, updated_at
└── Referenced by: projects.owner_id, annotations.user_id

projects (5)
├── id, name, description, owner_id → users.id
├── created_at, updated_at
└── Referenced by: recordings.project_id

recordings (1,051)
├── id, filename, original_filename, file_path
├── duration, sample_rate, project_id → projects.id
├── is_finished, created_at
└── Referenced by: spectrograms.recording_id, annotations.recording_id

spectrograms (1,051)
├── id, recording_id → recordings.id
├── status (enum: pending, processing, completed, failed)
├── thumbnail_path, standard_path, full_path, image_path
├── width, height, parameters (json)
└── error_message, processing_time, created_at, updated_at

annotations (1,027)
├── id, recording_id → recordings.id, user_id → users.id
├── created_at, updated_at
└── Referenced by: bounding_boxes.annotation_id

bounding_boxes (51,459)
├── id, annotation_id → annotations.id
├── x, y, width, height (pixel coords)
├── start_time, end_time (seconds)
├── min_frequency, max_frequency (Hz)
├── label, confidence, extra_metadata (json)
```

## Implementation Checklist
- CRITICAL: Use context7 before each implementation
- CRITICAL: Run `code-simplifier` agent after completing any implementation
- CRITICAL: Never modify production data without explicit approval
