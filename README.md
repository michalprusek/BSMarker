# BSMarker - Bird Song Annotation Tool

## About

BSMarker is a web application for annotating bird songs using spectrograms. It enables researchers and ornithologists to upload audio recordings and annotate them on a fast, zoomable spectrogram with boxes marking individual syllables.

### Key Features
- 🎵 Audio upload (MP3, WAV, FLAC, M4A)
- 🔍 Spectrogram computed in the browser, sharp at any zoom — from the whole recording down to milliseconds, with frequency zoom
- 🎯 Modeless box editing: draw, move, resize, snap to neighbours; full-band time segments
- 🔤 One-key labels (A–Z), undo/redo, copy/paste, autosave
- ⚠️ Live checks of time-axis rules (overlaps, gaps < 10 ms, nested boxes) with one-click fixes
- 🎧 Sample-accurate playback, slow-down, looping, and a listen-through review box by box
- 👥 Multi-user projects (each annotator has their own annotation per recording)
- 💾 Annotation export in JSON format

## Quick Start with Docker

### Prerequisites
- Docker and Docker Compose installed
- At least 4GB of free RAM
- Port 80 available (or modify docker-compose.yml)

### Running BSMarker Locally

```bash
# Clone the repository
git clone https://github.com/yourusername/BSMarker.git
cd BSMarker

# Optional: Create .env file for custom settings
cp .env.example .env
# Edit .env to set ADMIN_EMAIL and ADMIN_PASSWORD

# Start all services (production mode)
docker-compose up -d

# Wait for services to be ready (about 1-2 minutes on first run)
docker-compose ps

# The application will be available at:
# http://localhost
```

### Default Login Credentials
- **Email**: admin@localhost
- **Password**: admin123

You can change these by setting `ADMIN_EMAIL` and `ADMIN_PASSWORD` in your `.env` file before starting.

### Architecture

The application runs as a set of Docker containers:

| Service | Description |
|---------|-------------|
| nginx | Web server and reverse proxy (port 80) |
| frontend | React application (production build) |
| backend | FastAPI server |
| postgres | PostgreSQL database |
| redis | Cache and message queue |
| minio | S3-compatible object storage |

### Basic Management

**Stop the application:**
```bash
docker-compose down
```

**View logs:**
```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f backend
```

**Reset everything (including data):**
```bash
docker-compose down -v
docker-compose up -d
```

**Update to latest version:**
```bash
git pull
docker-compose down
docker-compose build --no-cache
docker-compose up -d
```

### For Developers

If you want to modify the code and see changes immediately, use the development configuration:

```bash
# Use development mode with hot-reload
docker-compose -f docker-compose.dev.yml up -d

# Frontend will be at: http://localhost:3000
# Backend API at: http://localhost:8000
# MinIO console at: http://localhost:9001
```

Development mode includes:
- Hot-reload for both frontend and backend
- Debug logging
- Direct port access to all services
- Source code mounted as volumes

### Troubleshooting

**Port 80 is already in use:**
- Stop any other web servers (Apache, Nginx, etc.)
- Or change the port in docker-compose.yml: `ports: - "8080:80"`

**Not enough memory:**
- Increase Docker's memory limit in Docker Desktop settings
- Reduce worker counts in docker-compose.yml

**Can't upload files:**
- Check MinIO is running: `docker-compose ps minio`
- Check logs: `docker-compose logs minio`

**Database connection errors:**
- Wait a bit longer for services to start
- Check PostgreSQL logs: `docker-compose logs postgres`

## Production Deployment

### Requirements
- Linux server (Ubuntu/Debian recommended)
- Docker and Docker Compose
- Minimum 4GB RAM
- 20GB free disk space
- Domain with SSL certificate (for HTTPS)

### Installation

1. **Clone the repository**
```bash
git clone https://github.com/yourusername/BSMarker.git
cd BSMarker
```

2. **Create production configuration**
```bash
# Copy the sample file
cp backend/.env.example backend/.env

# Edit the configuration
nano backend/.env
```

Important variables in `.env`:
```env
# Database
DATABASE_URL=postgresql://bsmarker:STRONG_PASSWORD@postgres:5432/bsmarker_db

# Redis
REDIS_URL=redis://redis:6379

# MinIO Storage
MINIO_ENDPOINT=minio:9000
MINIO_ACCESS_KEY=SECURE_KEY
MINIO_SECRET_KEY=SECURE_PASSWORD

# Security
SECRET_KEY=RANDOM_64_CHAR_STRING
JWT_SECRET_KEY=ANOTHER_RANDOM_STRING

# First admin account
FIRST_ADMIN_EMAIL=admin@example.com
FIRST_ADMIN_PASSWORD=STRONG_ADMIN_PASSWORD

# CORS - set your domain
CORS_ORIGINS=["https://yourdomain.com"]
```

3. **Configure docker-compose.prod.yml**

Open `docker-compose.prod.yml` and set:
- Correct ports (if 80/443 are busy)
- Volumes for persistent data
- Environment variables

4. **Launch the application**
```bash
# Build and start containers
docker-compose -f docker-compose.prod.yml build --no-cache
docker-compose -f docker-compose.prod.yml up -d

# Check status
docker-compose -f docker-compose.prod.yml ps

# Monitor logs
docker-compose -f docker-compose.prod.yml logs -f
```

5. **Set up SSL certificate**

For production, we recommend using Let's Encrypt:
```bash
# Install certbot
sudo apt-get update
sudo apt-get install certbot

# Get certificate
sudo certbot certonly --standalone -d yourdomain.com

# Certificates will be in:
# /etc/letsencrypt/live/yourdomain.com/
```

Update nginx configuration in `docker-compose.prod.yml` to use the certificates.

### Application Management

**Restart services:**
```bash
docker-compose -f docker-compose.prod.yml restart
```

**Update after code changes:**
```bash
# Pull latest code
git pull

# Rebuild and restart
docker-compose -f docker-compose.prod.yml build --no-cache
docker-compose -f docker-compose.prod.yml down
docker-compose -f docker-compose.prod.yml up -d
```

**Database backup:**
```bash
# Create backup
docker exec bsmarker_postgres_1 pg_dump -U bsmarker bsmarker_db > backup_$(date +%Y%m%d).sql

# Restore from backup
docker exec -i bsmarker_postgres_1 psql -U bsmarker bsmarker_db < backup.sql
```

**Monitor logs:**
```bash
# All services
docker-compose -f docker-compose.prod.yml logs -f

# Specific service
docker-compose -f docker-compose.prod.yml logs -f backend
docker-compose -f docker-compose.prod.yml logs -f frontend
```

**Health check:**
```bash
# Container status
docker ps --format "table {{.Names}}\t{{.Status}}"

# Resource usage
docker stats
```

### Service Architecture

The application runs in the following Docker containers:

| Service | Port | Description |
|---------|------|-------------|
| nginx | 80, 443 | Reverse proxy and SSL termination |
| frontend | - | React application |
| backend | - | FastAPI server |
| postgres | - | PostgreSQL database |
| redis | - | Cache and session storage |
| minio | - | Object storage for audio files |

### Troubleshooting

**Containers won't start:**
```bash
# Check logs
docker-compose -f docker-compose.prod.yml logs

# Verify configuration
docker-compose -f docker-compose.prod.yml config
```

**Database issues:**
```bash
# Connect to database
docker exec -it bsmarker_postgres_1 psql -U bsmarker -d bsmarker_db

# Check tables
\dt
```

**File upload problems:**
```bash
# Check MinIO
docker logs bsmarker_minio_1

# Check buckets
docker exec bsmarker_minio_1 mc ls local/
```

## Using the Application

1. **Login**
   - Navigate to https://yourdomain.com
   - Use the admin account configured in .env

2. **Create a project**
   - Click "New Project"
   - Enter name and description
   - Click "Create"

3. **Upload audio files**
   - Open the project
   - Click "Upload Recording"
   - Select audio files

4. **Annotate recordings**
   - Click a recording to open the editor
   - Drag on the spectrogram to draw a box, press a letter A–Z to label it
   - Changes are saved automatically; press `?` in the editor for all controls

5. **Export data**
   - In project overview, click "Download Annotations"
   - Data downloads as ZIP with JSON files

### Editor Controls (selection — press `?` in the editor for the full list)

| Input | Action |
|-------|--------|
| Drag on empty spectrogram / waveform | New box / new time segment |
| Drag a box, its edge or corner | Move / resize |
| `A`–`Z` | Label the selected boxes |
| `Space` / `Enter` | Play–pause / play the selection |
| Scroll, `Ctrl`/`⌘` + scroll, `Alt` + scroll | Pan, zoom time, zoom frequency |
| `Tab`, `F8` | Next box, next conflict |
| `Ctrl+Z` / `Ctrl+Shift+Z` | Undo / redo |
| `Page Up` / `Page Down` | Previous / next recording |

## Technologies

- **Backend**: FastAPI, PostgreSQL, Redis, MinIO
- **Frontend**: React 18, TypeScript, Tailwind CSS, WebGL2, Web Workers, Web Audio API
- **Deployment**: Docker, Docker Compose, Nginx

## Contact

For support contact: prusemic@cvut.cz

---

BSMarker v1.0.0 | ÚTIA AV ČR
