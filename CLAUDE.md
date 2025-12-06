# CLAUDE.md - BSMarker

## Server Info
- **This is the PRODUCTION SERVER** (hostname: bsmarker)
- Path: /home/prusek/BSMarker
- Docker containers run here directly

## Test Credentials
- **URL**: https://bsmarker.utia.cas.cz
- **Username**: newcastlea@gmail.com
- **Password**: snehurka18

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
- CRITICAL:use context7 before each implementation
