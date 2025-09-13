# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# BSMarker - Bird Song Annotation Tool

## Project Overview
BSMarker is a full-stack web application designed for annotating bird songs using spectrograms. It enables researchers and ornithologists to upload audio recordings, automatically generate spectrograms, and annotate them with bounding boxes to identify different bird species and sound types.

## Technology Stack

### Frontend
- **React 18** with TypeScript
- **Tailwind CSS** for styling
- **Konva.js** for canvas-based annotation
- **WaveSurfer.js** for audio waveform visualization
- **React Router v6** for navigation
- **Axios** for API communication
- **React Hook Form** for form management

### Backend
- **FastAPI** (Python) for REST API
- **SQLAlchemy** for ORM
- **PostgreSQL** for database
- **MinIO** for object storage
- **Redis** for caching and task queue
- **Celery** for background tasks
- **JWT** for authentication

### Deployment
- **Docker** and **Docker Compose** for containerization
- **Nginx** as reverse proxy and load balancer
- **Let's Encrypt** for SSL certificates
- **GitHub Actions** for CI/CD

## Architecture Principles

### Frontend Architecture
```
src/
├── components/       # Reusable UI components
│   ├── annotation/   # Domain-specific components
│   └── shared/       # Generic components
├── contexts/         # React Context providers
├── pages/           # Route-level components
├── services/        # API clients and external services
├── hooks/           # Custom React hooks
├── utils/           # Helper functions and utilities
└── types/           # TypeScript type definitions
```

### Backend Architecture
```
app/
├── api/             # API endpoints and routing
│   └── v1/          # API version 1
├── core/            # Core configuration and security
├── db/              # Database configuration
├── models/          # SQLAlchemy models
├── schemas/         # Pydantic schemas
├── services/        # Business logic layer
└── utils/           # Helper utilities
```

### Layered Architecture Pattern
```
API Endpoints → Services → Models → Database
     ↓              ↓         ↓         ↓
Controllers    Business   Domain    Data
               Logic      Models    Access
```

## Coding Standards & Best Practices

### General Principles
1. **Single Source of Truth (SSOT)**: Avoid code duplication, centralize shared logic
2. **Separation of Concerns**: Keep business logic in services, UI logic in components
3. **Type Safety**: Use TypeScript/Python type hints throughout
4. **Error Handling**: Consistent error handling with proper logging
5. **Security First**: Never hardcode secrets, validate all inputs

### Frontend Best Practices

#### Naming Conventions
- **Components**: PascalCase (`AnnotationEditor.tsx`)
- **Hooks**: camelCase starting with 'use' (`useSpectrogramZoom.ts`)
- **Utils**: camelCase (`coordinates.ts`)
- **Constants**: UPPER_SNAKE_CASE (`LAYOUT_CONSTANTS`)
- **Types/Interfaces**: PascalCase with 'I' prefix for interfaces

#### Component Patterns
```typescript
// Functional component with typed props
interface ComponentProps {
  data: DataType;
  onAction: (id: number) => void;
}

const Component: React.FC<ComponentProps> = ({ data, onAction }) => {
  // Hook usage at top
  const [state, setState] = useState<StateType>(initialState);

  // Effects after hooks
  useEffect(() => {
    // Cleanup in return
    return () => cleanup();
  }, [dependencies]);

  // Event handlers
  const handleClick = useCallback(() => {
    onAction(data.id);
  }, [data.id, onAction]);

  // Render
  return <div onClick={handleClick}>{data.name}</div>;
};
```

#### State Management
- Use React Context for global state (auth, theme)
- Use local state for component-specific data
- Use custom hooks for reusable stateful logic

#### API Service Pattern
```typescript
// Centralized API client
import api from '../services/api';  // Note: default export

// Service functions
export const recordingService = {
  getAll: () => api.get<Recording[]>('/recordings'),
  getById: (id: number) => api.get<Recording>(`/recordings/${id}`),
  create: (data: CreateRecordingDto) => api.post<Recording>('/recordings', data),
  update: (id: number, data: UpdateRecordingDto) => api.put<Recording>(`/recordings/${id}`, data),
  delete: (id: number) => api.delete(`/recordings/${id}`)
};
```

### Backend Best Practices

#### Naming Conventions
- **Variables/Functions**: snake_case
- **Classes**: PascalCase
- **Constants**: UPPER_SNAKE_CASE
- **Files**: snake_case
- **API Routes**: kebab-case

#### Service Pattern
```python
from sqlalchemy.orm import Session
from app.models.recording import Recording
from app.schemas.recording import RecordingCreate

class RecordingService:
    @staticmethod
    def create_recording(db: Session, recording: RecordingCreate, user_id: int) -> Recording:
        db_recording = Recording(
            **recording.dict(),
            user_id=user_id
        )
        db.add(db_recording)
        db.commit()
        db.refresh(db_recording)
        return db_recording

    @staticmethod
    def get_recording(db: Session, recording_id: int) -> Recording:
        return db.query(Recording).filter(Recording.id == recording_id).first()
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
    if not current_user:
        raise HTTPException(status_code=403, detail="Not authenticated")
    return services.recording.create_recording(db, recording, current_user.id)
```

### Database Conventions
- **Table Names**: Plural, snake_case (`users`, `bounding_boxes`)
- **Column Names**: snake_case
- **Primary Keys**: `id` (integer auto-increment)
- **Foreign Keys**: `{table_singular}_id` (e.g., `user_id`)
- **Timestamps**: `created_at`, `updated_at` with timezone

### Docker Best Practices
1. **Multi-stage builds** for smaller images
2. **Health checks** for all services
3. **Resource limits** to prevent resource exhaustion
4. **Network isolation** between services
5. **Volume mounts** for persistent data
6. **Environment variables** for configuration

## Development Workflow

### Setting Up Development Environment
1. Clone repository
2. Copy `.env.example` to `.env` and configure
3. Run `docker-compose up` for local development
4. Frontend: `npm install && npm run dev`
5. Backend: `pip install -r requirements.txt && uvicorn app.main:app --reload`

### Adding New Features
1. Create feature branch from `dev`
2. Implement following established patterns
3. Write tests for new functionality
4. Update documentation if needed
5. Create pull request to `dev`

### Code Quality Checks

#### Frontend
```bash
npm run typecheck   # TypeScript checking
npm run lint        # ESLint
npm run test        # Run tests
npm run build       # Production build
```

#### Backend
```bash
python -m mypy app/        # Type checking
python -m black app/       # Code formatting
python -m pylint app/      # Linting
python -m pytest           # Run tests
```

### Pre-commit Hooks
The project uses pre-commit hooks to ensure code quality:
- Black (Python formatting)
- isort (Python import sorting)
- Flake8 (Python linting)
- MyPy (Python type checking)
- ESLint (JavaScript/TypeScript linting)
- Prettier (JavaScript/TypeScript formatting)

**IMPORTANT**: Never skip pre-commit checks - always fix errors and warnings

## Deployment

### Production Deployment
```bash
# Build and deploy
docker-compose -f docker-compose.prod.yml build
docker-compose -f docker-compose.prod.yml up -d

# Update frontend after changes
docker-compose -f docker-compose.prod.yml build frontend
docker-compose -f docker-compose.prod.yml stop frontend nginx
docker-compose -f docker-compose.prod.yml rm -f frontend nginx
docker-compose -f docker-compose.prod.yml up -d frontend nginx
```

### SSL Certificate Management
- Certificates managed via Let's Encrypt
- Auto-renewal configured via cron
- Nginx handles SSL termination

## Security Considerations
1. **Authentication**: JWT tokens with secure storage
2. **Authorization**: Role-based access control (RBAC)
3. **Input Validation**: All inputs validated with Pydantic/TypeScript
4. **SQL Injection**: Prevented via ORM parameterized queries
5. **XSS Protection**: React's built-in escaping
6. **CORS**: Properly configured for production domain
7. **Rate Limiting**: Applied to all endpoints
8. **Secrets Management**: Environment variables, never hardcoded

## Performance Optimization
1. **Database Indexing**: Indexes on frequently queried columns
2. **Query Optimization**: Avoid N+1 queries, use joins
3. **Caching**: Redis for frequently accessed data
4. **Pagination**: All list endpoints paginated
5. **Lazy Loading**: Components and routes lazy loaded
6. **Image Optimization**: Spectrograms compressed and cached
7. **Connection Pooling**: Database connection pooling

## Testing Strategy
1. **Unit Tests**: For utilities and services
2. **Integration Tests**: For API endpoints
3. **Component Tests**: For React components
4. **E2E Tests**: For critical user flows
5. **Performance Tests**: For heavy operations

## Monitoring & Logging
1. **Structured Logging**: JSON format for easy parsing
2. **Error Tracking**: Centralized error logging
3. **Health Checks**: All services have health endpoints
4. **Metrics Collection**: Performance and usage metrics
5. **Audit Logging**: Track user actions

## Common Patterns & Solutions

### Coordinate Transformations
All coordinate transformations are centralized in `frontend/src/utils/coordinates.ts` to maintain consistency across the application.

### Loading States
Use the shared `LoadingSpinner` component for consistent loading indicators.

### Error Handling
Use the shared `ErrorMessage` component for consistent error display.

### Form Validation
Use React Hook Form with Yup/Zod schemas for consistent validation.

### API Error Handling
```typescript
try {
  const response = await api.get('/endpoint');
  // Handle success
} catch (error) {
  if (axios.isAxiosError(error)) {
    // Handle API error
    toast.error(error.response?.data?.detail || 'An error occurred');
  } else {
    // Handle unexpected error
    console.error('Unexpected error:', error);
  }
}
```

## Troubleshooting

### Common Issues
1. **Container not starting**: Check logs with `docker logs <container_name>`
2. **Database connection failed**: Verify credentials and network
3. **Frontend build fails**: Clear node_modules and reinstall
4. **API errors**: Check backend logs and database state
5. **MinIO issues**: Verify bucket permissions and connectivity

### Debugging Commands
```bash
# View container logs
docker logs -f <container_name>

# Enter container shell
docker exec -it <container_name> /bin/bash

# Check database
docker exec <postgres_container> psql -U <user> -d <database>

# Test API endpoint
curl -X GET http://localhost:8000/api/v1/health

# Check Redis
docker exec <redis_container> redis-cli ping
```

## Contributing Guidelines
1. Follow established patterns and conventions
2. Write clean, self-documenting code
3. Add tests for new functionality
4. Update documentation as needed
5. Use meaningful commit messages
6. Request code review before merging

## Additional Resources
- [FastAPI Documentation](https://fastapi.tiangolo.com/)
- [React Documentation](https://react.dev/)
- [Docker Documentation](https://docs.docker.com/)
- [PostgreSQL Documentation](https://www.postgresql.org/docs/)
- [TypeScript Documentation](https://www.typescriptlang.org/docs/)
