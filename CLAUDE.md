# BSMarker - Bird Song Annotation Tool

## Project Overview
BSMarker is a full-stack web application designed for annotating bird songs using spectrograms. It enables researchers and ornithologists to upload audio recordings, automatically generate spectrograms, and annotate them with bounding boxes to identify different bird species and sound types.

## ⚠️ IMPORTANT DEVELOPMENT NOTES
- **run_local.py**: ALWAYS use this script for local development - it's managed and run by the user
- **Docker**: Currently NOT functional - do not suggest Docker commands
- **Ports**: Frontend runs on 3456, Backend API on 8123
- **Hot Reload**: Both frontend and backend MUST run with hot reload enabled

## Critical Best Practices

### 🔴 SSOT (Single Source of Truth) Principle
**NEVER duplicate code, types, or business logic!**
- Types & Interfaces → `packages/shared/types`
- Constants → `packages/shared/constants`
- Validation → `packages/shared/validation`
- Utilities → `packages/shared/utils`
- Before creating anything: Search if it exists first

### 🔴 Security First
**Current vulnerabilities to fix immediately:**
- Remove `new Function()` usage (analyze-missing-zh.js)
- Fix SQL injection risks (testDb.ts)
- Move hardcoded credentials to env variables
- Never log sensitive data (passwords, tokens, PII)
- Always validate and sanitize input

### 🔴 Error Debugging Workflow
When encountering errors, ALWAYS gather maximum context:
1. Check Docker logs: `docker-compose logs [service] --tail=100`
2. Check browser console for client-side errors
3. Verify database state if relevant
4. Look for patterns across services
5. Fix root cause, not symptoms

### 🔴 Subagent Usage (USE FREQUENTLY!)
**MAXIMIZE subagent usage to preserve context window:**
Subagents can handle independent tasks without cluttering the main conversation. This allows you to:
- Focus on high-level coordination in main conversation
- Offload detailed work to subagents
- Preserve context for future reference

IMPORTANT: ALWAYS EXPLAIN THE PROJECT CONTEXT TO SUBAGENTS!

## Architecture

### Tech Stack
- **Backend**: FastAPI (Python 3.11)
- **Frontend**: React 18 with TypeScript
- **Database**: PostgreSQL 15
- **Cache/Queue**: Redis
- **File Storage**: MinIO (S3-compatible)
- **Containerization**: Docker & Docker Compose (NOT WORKING - use run_local.py)

### Key Features
1. **User Management**: Admin-controlled user creation with role-based access (admin/regular user)
2. **Project Organization**: Users can create projects to organize their recordings
3. **Audio Upload**: Support for MP3, WAV, M4A, FLAC formats (max 100MB)
4. **Automatic Spectrogram Generation**: Using librosa for audio processing
5. **Annotation Editor**: 
   - Draw bounding boxes on spectrograms
   - Assign labels (bird species, call types)
   - Time and frequency range tracking
6. **Audio Playback**: Synchronized waveform visualization with spectrogram cursor
7. **Data Persistence**: All annotations saved to PostgreSQL

## Project Structure

```
BSMarker/
├── backend/
│   ├── app/
│   │   ├── api/            # REST API endpoints
│   │   │   └── api_v1/
│   │   │       └── endpoints/
│   │   │           ├── auth.py       # Authentication endpoints
│   │   │           ├── users.py      # User management
│   │   │           ├── projects.py   # Project CRUD
│   │   │           ├── recordings.py # Audio file handling
│   │   │           └── annotations.py # Annotation management
│   │   ├── core/           # Core configuration
│   │   │   ├── config.py    # Settings management
│   │   │   └── security.py  # JWT & password hashing
│   │   ├── db/             # Database configuration
│   │   ├── models/         # SQLAlchemy ORM models
│   │   ├── schemas/        # Pydantic validation schemas
│   │   └── services/       # Business logic
│   │       ├── minio_client.py    # File storage service
│   │       └── spectrogram.py     # Audio processing
│   ├── Dockerfile
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── components/    # Reusable React components
│   │   ├── contexts/      # React contexts (Auth)
│   │   ├── pages/         # Page components
│   │   │   ├── LoginPage.tsx
│   │   │   ├── ProjectsPage.tsx
│   │   │   ├── ProjectDetailPage.tsx
│   │   │   ├── AnnotationEditor.tsx
│   │   │   └── AdminUsersPage.tsx
│   │   ├── services/      # API client services
│   │   └── types/         # TypeScript type definitions
│   ├── Dockerfile
│   └── package.json
├── docker-compose.yml      # Multi-container orchestration (NOT WORKING)
├── run_local.py           # LOCAL DEVELOPMENT SCRIPT (USE THIS!)
├── start.sh               # Startup script
├── stop.sh                # Shutdown script
└── README.md              # User documentation
```

## Database Schema

### Tables
1. **users**: User accounts with authentication
   - id, email, username, hashed_password, full_name, is_active, is_admin

2. **projects**: Recording collections
   - id, name, description, owner_id (FK to users)

3. **recordings**: Audio files metadata
   - id, filename, file_path, duration, sample_rate, project_id (FK)

4. **spectrograms**: Generated spectrogram data
   - id, recording_id (FK), image_path, parameters, dimensions

5. **annotations**: Annotation sessions
   - id, recording_id (FK), user_id (FK), timestamps

6. **bounding_boxes**: Individual annotations
   - id, annotation_id (FK), coordinates (x, y, width, height)
   - time_range (start_time, end_time)
   - frequency_range (min_frequency, max_frequency)
   - label (bird species/sound type)

## API Endpoints

### Authentication
- `POST /api/v1/auth/login` - User login
- `GET /api/v1/auth/me` - Get current user

### Users (Admin only)
- `GET /api/v1/users` - List all users
- `POST /api/v1/users` - Create new user
- `PUT /api/v1/users/{id}` - Update user

### Projects
- `GET /api/v1/projects` - List user's projects
- `POST /api/v1/projects` - Create project
- `GET /api/v1/projects/{id}` - Get project details
- `PUT /api/v1/projects/{id}` - Update project
- `DELETE /api/v1/projects/{id}` - Delete project

### Recordings
- `POST /api/v1/recordings/{project_id}/upload` - Upload audio file
- `GET /api/v1/recordings/{project_id}/recordings` - List recordings
- `GET /api/v1/recordings/{id}` - Get recording details
- `DELETE /api/v1/recordings/{id}` - Delete recording

### Annotations
- `POST /api/v1/annotations/{recording_id}` - Create annotation
- `GET /api/v1/annotations/{recording_id}` - List annotations
- `PUT /api/v1/annotations/{id}` - Update annotation
- `DELETE /api/v1/annotations/{id}` - Delete annotation

## Development Guidelines

### Running Locally with run_local.py

**IMPORTANT**: Always use `run_local.py` for local development. Docker is NOT functional.

```bash
# User runs this script manually
python3 run_local.py
```

### Access Points (with run_local.py):
- Frontend: http://localhost:3456
- Backend API: http://localhost:8123
- API Docs: http://localhost:8123/docs
- MinIO Console: http://localhost:9001

### Default credentials:
- Email: admin@bsmarker.com
- Password: admin123

### Hot Reload Configuration
The `run_local.py` script MUST ensure:
- Backend runs with `--reload` flag for uvicorn
- Frontend runs with React's hot reload enabled (default with `npm start`)
- Changes to source files are immediately reflected without restart

### Code Quality

#### Backend
- Use type hints for all functions
- Follow PEP 8 style guidelines
- Validate all inputs with Pydantic
- Handle errors with appropriate HTTP status codes
- Use dependency injection for database sessions

#### Frontend
- Use TypeScript strict mode
- Follow React hooks best practices
- Implement proper error boundaries
- Use React Hook Form for form validation
- Show loading states and error messages

### Testing Commands

```bash
# Backend tests
cd backend
pytest

# Frontend tests
cd frontend
npm test

# Linting
cd backend
pylint app/
cd frontend
npm run lint
```

## Workflow

### User Journey
1. **Admin creates user account** → sends credentials to user
2. **User logs in** → redirected to projects page
3. **User creates project** → organizes recordings
4. **User uploads MP3** → system generates spectrogram
5. **User opens annotation editor** → sees spectrogram + waveform
6. **User draws bounding boxes** → assigns bird species labels
7. **User saves annotations** → stored in database

### Audio Processing Pipeline
1. User uploads audio file → stored in MinIO
2. Celery task triggered → processes audio with librosa
3. Spectrogram generated → saved as PNG in MinIO
4. Metadata saved → PostgreSQL database
5. Frontend fetches → displays for annotation

## Important Considerations

### Security
- JWT tokens for authentication
- Password hashing with bcrypt
- CORS configuration for frontend
- Input validation at all levels
- SQL injection protection via ORM

### Performance
- Async processing for spectrograms
- Redis caching for frequently accessed data
- Pagination for large datasets
- Optimized Docker images (alpine variants)
- MinIO for scalable file storage

### Limitations
- Max file size: 100MB
- Supported formats: MP3, WAV, M4A, FLAC
- Spectrogram generation may take several seconds
- Browser compatibility: Modern browsers only

## Future Enhancements
- Export annotations to CSV/JSON
- Batch upload functionality
- Collaborative annotation features
- Machine learning model integration
- Real-time collaboration
- Advanced filtering and search
- Annotation statistics and analytics
- Mobile responsive design improvements

## Troubleshooting

### Common Issues

1. **Port conflicts**:
```bash
# Check ports 3456, 8123, 5432, 6379, 9000, 9001
lsof -i :3456
lsof -i :8123
```

2. **Database connection issues**:
```bash
# Check PostgreSQL is running
psql -U bsmarker -d bsmarker_db -h localhost
```

3. **Backend not starting**:
```bash
# Check Python dependencies
cd backend
pip install -r requirements.txt
```

4. **Frontend not starting**:
```bash
# Check Node dependencies
cd frontend
npm install
```

## Maintenance

### Backup Database
```bash
pg_dump -U bsmarker bsmarker_db > backup.sql
```

### Update Dependencies
```bash
# Backend
cd backend
pip install --upgrade -r requirements.txt

# Frontend
cd frontend
npm update
```

## Contact & Support
For issues or questions, please create an issue in the repository or contact the development team.

# important-instruction-reminders
Do what has been asked; nothing more, nothing less.
NEVER create files unless they're absolutely necessary for achieving your goal.
ALWAYS prefer editing an existing file to creating a new one.
NEVER proactively create documentation files (*.md) or README files. Only create documentation files if explicitly requested by the User.