# BSMarker - Bird Song Annotation Tool

> Professional web-based application for annotating bird songs using spectrograms

![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)
![License](https://img.shields.io/badge/license-MIT-green.svg)
![Docker](https://img.shields.io/badge/docker-ready-brightgreen.svg)
![Python](https://img.shields.io/badge/python-3.10+-blue.svg)
![Node](https://img.shields.io/badge/node-18+-green.svg)

## 📝 Overview

BSMarker is a full-stack web application designed for ornithologists and researchers to annotate bird songs using visual spectrograms. The application enables users to upload audio recordings, automatically generate spectrograms, and annotate them with bounding boxes to identify different bird species and sound types.

### Key Features
- 🎵 **Audio Processing** - Support for MP3, WAV, FLAC, OGG formats
- 📊 **Automatic Spectrogram Generation** - Mel-spectrograms using librosa
- 🎯 **Precise Annotation Tools** - Interactive bounding box drawing
- 🏷️ **Label Management** - Customizable species and call type labels
- 👥 **Multi-user Collaboration** - Project-based workflow with user management
- 💾 **Export Capabilities** - JSON/CSV export for analysis
- 🔄 **Real-time Synchronization** - Waveform and spectrogram sync at all zoom levels

## 🛠️ Technology Stack

### Backend
- **FastAPI** - High-performance Python web framework
- **PostgreSQL** - Primary database for structured data
- **Redis** - Caching and session management
- **MinIO** - S3-compatible object storage for audio files
- **Celery** - Asynchronous task processing
- **Librosa** - Audio analysis and spectrogram generation
- **SQLAlchemy** - ORM for database operations

### Frontend
- **React 18** with TypeScript
- **Tailwind CSS** - Utility-first CSS framework
- **Konva.js** - 2D canvas for annotations
- **WaveSurfer.js** - Audio waveform visualization
- **React Router v6** - Client-side routing
- **Axios** - HTTP client for API communication

## 🚀 Quick Start

### Prerequisites
- Docker & Docker Compose (for Docker installation)
- OR Python 3.10+, Node.js 18+, PostgreSQL 14+, Redis 7+ (for manual installation)

## 🐳 Installation with Docker (Recommended)

### 1. Clone the repository
```bash
git clone https://github.com/yourusername/BSMarker.git
cd BSMarker
```

### 2. Create environment file
```bash
# Create .env file from example
cp .env.example .env

# Edit .env file with your configuration
nano .env
```

Example `.env` configuration:
```env
# Database
DB_USER=bsmarker
DB_PASSWORD=secure_password_here
DB_NAME=bsmarker_db

# MinIO Storage
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin

# Security
JWT_SECRET_KEY=your_jwt_secret_key_here

# Admin Account
FIRST_ADMIN_EMAIL=prusemic@cvut.cz
FIRST_ADMIN_PASSWORD=admin123

# URLs
FRONTEND_URL=http://localhost:3000
BACKEND_URL=http://localhost:8000
```

### 3. Start the application
```bash
# Build and start all services
docker-compose up -d --build

# Check if services are running
docker-compose ps

# View logs
docker-compose logs -f
```

### 4. Access the application
- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:8000
- **API Documentation**: http://localhost:8000/docs
- **MinIO Console**: http://localhost:9001 (minioadmin/minioadmin)

### 5. Stop the application
```bash
docker-compose down

# To remove volumes as well (this will delete all data)
docker-compose down -v
```

## 💻 Installation without Docker

### 1. Install System Dependencies

#### Ubuntu/Debian
```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Python
sudo apt install python3.10 python3-pip python3-venv

# Install Node.js
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install nodejs

# Install PostgreSQL
sudo apt install postgresql postgresql-contrib

# Install Redis
sudo apt install redis-server

# Install FFmpeg (for audio processing)
sudo apt install ffmpeg

# Install development tools
sudo apt install build-essential libpq-dev
```

#### macOS
```bash
# Install Homebrew (if not installed)
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Install dependencies
brew install python@3.10 node@18 postgresql@14 redis ffmpeg

# Start services
brew services start postgresql
brew services start redis
```

#### Windows
1. Install [Python 3.10+](https://www.python.org/downloads/)
2. Install [Node.js 18+](https://nodejs.org/)
3. Install [PostgreSQL 14+](https://www.postgresql.org/download/windows/)
4. Install [Redis](https://github.com/microsoftarchive/redis/releases)
5. Install [FFmpeg](https://ffmpeg.org/download.html)

### 2. Set up PostgreSQL Database
```bash
# Access PostgreSQL
sudo -u postgres psql

# Create database and user
CREATE DATABASE bsmarker_db;
CREATE USER bsmarker WITH PASSWORD 'your_password_here';  -- pragma: allowlist secret
GRANT ALL PRIVILEGES ON DATABASE bsmarker_db TO bsmarker;
ALTER USER bsmarker CREATEDB;
\q
```

### 3. Install and Configure MinIO
```bash
# Download MinIO
wget https://dl.min.io/server/minio/release/linux-amd64/minio
chmod +x minio

# Create data directory
mkdir ~/minio-data

# Start MinIO (keep this running in a separate terminal)
./minio server ~/minio-data --console-address :9001

# Note the displayed access key and secret key
```

### 4. Set up Backend
```bash
cd backend

# Create virtual environment
python3 -m venv venv

# Activate virtual environment
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Create .env file
cat > .env << EOL
DATABASE_URL=postgresql://bsmarker:your_password@localhost:5432/bsmarker_db  # pragma: allowlist secret
REDIS_URL=redis://localhost:6379
MINIO_ENDPOINT=localhost:9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
MINIO_USE_SSL=false
JWT_SECRET_KEY=your_jwt_secret_key_here
SECRET_KEY=your_secret_key_here
CORS_ORIGINS=["http://localhost:3000"]
FIRST_ADMIN_EMAIL=prusemic@cvut.cz
FIRST_ADMIN_PASSWORD=admin123
EOL

# Run database migrations
alembic upgrade head

# Start backend server
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### 5. Set up Frontend (in a new terminal)
```bash
cd frontend

# Install dependencies
npm install

# Create .env file
echo "REACT_APP_API_URL=http://localhost:8000" > .env

# Start development server
npm start
```

### 6. Start Celery Workers (in a new terminal, optional for async tasks)
```bash
cd backend
source venv/bin/activate

# Start Celery worker
celery -A app.core.celery_app worker --loglevel=info

# In another terminal, start Celery beat for scheduled tasks
celery -A app.core.celery_app beat --loglevel=info
```

## 📖 Usage Guide

### Getting Started

1. **Login**
   - Navigate to http://localhost:3000
   - Use default admin credentials or create a new account
   - Default: prusemic@cvut.cz / admin123

2. **Create a Project**
   - Click "New Project" on the dashboard
   - Enter project name and description
   - Click "Create"

3. **Upload Audio Files**
   - Open your project
   - Click "Upload Recording"
   - Select audio files (MP3, WAV, FLAC, or OGG)
   - Wait for automatic spectrogram generation

4. **Annotate Recordings**
   - Click "Annotate" on a recording
   - Use mouse to draw bounding boxes on the spectrogram
   - Add labels for bird species or call types
   - Use keyboard shortcuts for efficiency
   - Save annotations regularly

5. **Export Data**
   - Go to project overview
   - Click "Export Annotations"
   - Choose format (JSON or CSV)
   - Download the file

### Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Space` | Play/Pause audio |
| `A` | Toggle annotation mode |
| `Delete` | Delete selected box |
| `Ctrl+C` | Copy selected box |
| `Ctrl+V` | Paste box |
| `Ctrl+Z` | Undo |
| `Ctrl+Y` | Redo |
| `Ctrl+S` | Save annotations |
| `+/-` | Zoom in/out |
| `←/→` | Navigate timeline |
| `Shift+Click` | Multi-select boxes |

## 🔧 Configuration

### Backend Configuration
Edit `backend/app/core/config.py`:

```python
# Spectrogram parameters
SPECTROGRAM_CONFIG = {
    "n_fft": 2048,
    "hop_length": 512,
    "n_mels": 128,
    "fmin": 0,
    "fmax": 10000,
}

# File upload limits
MAX_AUDIO_FILE_SIZE = 500 * 1024 * 1024  # 500MB
ALLOWED_AUDIO_FORMATS = ["mp3", "wav", "flac", "ogg", "m4a"]
```

### Frontend Configuration
Edit `frontend/src/config/app.config.ts`:

```typescript
export const APP_CONFIG = {
  MAX_ZOOM_LEVEL: 6,
  MIN_ZOOM_LEVEL: 1,
  DEFAULT_PLAYBACK_SPEED: 1,
  AUTOSAVE_INTERVAL: 30000, // 30 seconds
};
```

## 🐛 Troubleshooting

### Common Issues and Solutions

#### Docker Issues

**Problem**: Containers won't start
```bash
# Check logs
docker-compose logs -f

# Rebuild containers
docker-compose down
docker-compose up --build
```

**Problem**: Port already in use
```bash
# Change ports in docker-compose.yml or stop conflicting services
sudo lsof -i :3000  # Check what's using port 3000
sudo lsof -i :8000  # Check what's using port 8000
```

#### Database Issues

**Problem**: Database connection failed
```bash
# Check PostgreSQL status
sudo systemctl status postgresql

# Reset database
docker-compose exec backend alembic downgrade base
docker-compose exec backend alembic upgrade head
```

#### MinIO Issues

**Problem**: File upload fails
```bash
# Check MinIO is running
docker-compose logs minio

# Create bucket manually
docker-compose exec minio mc mb local/bsmarker
```

#### Frontend Issues

**Problem**: Blank page or build errors
```bash
# Clear cache and reinstall
cd frontend
rm -rf node_modules package-lock.json
npm install
npm start
```

#### Spectrogram Generation Issues

**Problem**: Spectrograms not generating
```bash
# Check Celery workers
docker-compose logs celery-worker

# Restart Celery
docker-compose restart celery-worker celery-beat
```

## 🚀 Production Deployment

### Using Docker Compose for Production

1. **Prepare production environment**
```bash
# Clone on production server
git clone https://github.com/yourusername/BSMarker.git
cd BSMarker

# Create production .env
cp .env.production.example .env
nano .env
```

2. **Configure for production**
```env
# Production .env
DOMAIN=yourdomain.com
DB_PASSWORD=strong_production_password
MINIO_ACCESS_KEY=strong_access_key
MINIO_SECRET_KEY=strong_secret_key
JWT_SECRET_KEY=strong_jwt_secret
CORS_ORIGINS=["https://yourdomain.com"]
```

3. **Deploy with production compose file**
```bash
# Build and start
docker-compose -f docker-compose.prod.yml up -d --build

# Set up SSL with Let's Encrypt
docker-compose -f docker-compose.certbot.yml up

# Check status
docker-compose -f docker-compose.prod.yml ps
```

### Manual Production Setup

1. **Set up Nginx as reverse proxy**
```nginx
server {
    listen 80;
    server_name yourdomain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    location /api {
        proxy_pass http://localhost:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

2. **Use PM2 for process management**
```bash
# Install PM2
npm install -g pm2

# Start backend
pm2 start "uvicorn app.main:app" --name bsmarker-backend

# Start frontend
pm2 start "npm start" --name bsmarker-frontend --cwd frontend

# Save PM2 configuration
pm2 save
pm2 startup
```

## 📊 API Documentation

### Authentication
All API requests require JWT token in Authorization header:
```
Authorization: Bearer <token>
```

### Main Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/auth/login` | User login |
| POST | `/api/v1/auth/register` | User registration |
| GET | `/api/v1/projects` | List projects |
| POST | `/api/v1/projects` | Create project |
| GET | `/api/v1/recordings` | List recordings |
| POST | `/api/v1/recordings/{id}/upload` | Upload audio file |
| GET | `/api/v1/annotations/{recording_id}` | Get annotations |
| POST | `/api/v1/annotations` | Save annotations |

Full API documentation available at: http://localhost:8000/docs

## 🧪 Testing

### Run tests
```bash
# Backend tests
cd backend
pytest

# Frontend tests
cd frontend
npm test

# With Docker
docker-compose exec backend pytest
docker-compose exec frontend npm test
```

## 🤝 Contributing

Contributions are welcome! Please follow these steps:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'feat: Add amazing feature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

### Commit Convention
Follow [Conventional Commits](https://www.conventionalcommits.org/):
- `feat:` New feature
- `fix:` Bug fix
- `docs:` Documentation
- `style:` Code style
- `refactor:` Code refactoring
- `test:` Tests
- `chore:` Maintenance

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 👥 Authors

- Your Name - Initial work

## 🙏 Acknowledgments

- [Librosa](https://librosa.org/) for audio processing
- [WaveSurfer.js](https://wavesurfer-js.org/) for waveform visualization
- [Konva.js](https://konvajs.org/) for canvas annotations

## 📞 Support

For support, email prusemic@cvut.cz or open an issue in the GitHub repository.

---

<p align="center">Made with ❤️ for the ornithology research community</p>
