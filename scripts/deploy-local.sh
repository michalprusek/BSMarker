#!/bin/bash

# BSMarker Local Production Deployment (without Docker)
# For environments without root/sudo access

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

log() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1"
}

error() {
    echo -e "${RED}[$(date +'%Y-%m-%d %H:%M:%S')] ERROR:${NC} $1"
    exit 1
}

warning() {
    echo -e "${YELLOW}[$(date +'%Y-%m-%d %H:%M:%S')] WARNING:${NC} $1"
}

# Configuration
BASE_DIR="$HOME/BSMarker"
BACKEND_PORT=8123
FRONTEND_PORT=3456

cd "$BASE_DIR"

log "BSMarker Local Production Deployment"
log "===================================="

# Check prerequisites
log "Checking prerequisites..."

if ! command -v python3 &> /dev/null; then
    error "Python 3 is not installed"
fi

if ! command -v node &> /dev/null; then
    error "Node.js is not installed"
fi

if ! command -v npm &> /dev/null; then
    error "npm is not installed"
fi

# Setup Backend
log "Setting up Backend..."

cd "$BASE_DIR/backend"

# Create virtual environment if it doesn't exist
if [ ! -d "venv" ]; then
    log "Creating Python virtual environment..."
    python3 -m venv venv
fi

# Activate virtual environment
source venv/bin/activate

# Install/update dependencies
log "Installing Python dependencies..."
pip install --upgrade pip
pip install -r requirements.txt
pip install gunicorn

# Copy production env to backend
if [ -f "$BASE_DIR/.env.production" ]; then
    cp "$BASE_DIR/.env.production" "$BASE_DIR/backend/.env"
    log "Environment file copied to backend"
else
    error ".env.production not found. Please create it from .env.example"
fi

# Create logs directory
mkdir -p "$BASE_DIR/backend/logs"

# Setup Frontend
log "Setting up Frontend..."

cd "$BASE_DIR/frontend"

# Install dependencies
log "Installing Node.js dependencies..."
npm ci

# Build production bundle
log "Building frontend production bundle..."
REACT_APP_API_URL="http://localhost:$BACKEND_PORT" npm run build

# Create systemd user services
log "Creating systemd user services..."

mkdir -p "$HOME/.config/systemd/user"

# Backend service
cat > "$HOME/.config/systemd/user/bsmarker-backend.service" << EOF
[Unit]
Description=BSMarker Backend API
After=network.target

[Service]
Type=simple
WorkingDirectory=$BASE_DIR/backend
Environment="PATH=$BASE_DIR/backend/venv/bin:/usr/local/bin:/usr/bin:/bin"
ExecStart=$BASE_DIR/backend/venv/bin/gunicorn app.main:app \\
    --worker-class uvicorn.workers.UvicornWorker \\
    --workers 2 \\
    --bind 0.0.0.0:$BACKEND_PORT \\
    --access-logfile $BASE_DIR/backend/logs/access.log \\
    --error-logfile $BASE_DIR/backend/logs/error.log \\
    --log-level info
Restart=always
RestartSec=10

[Install]
WantedBy=default.target
EOF

# Frontend service (using Python's http.server for simplicity)
cat > "$HOME/.config/systemd/user/bsmarker-frontend.service" << EOF
[Unit]
Description=BSMarker Frontend
After=network.target

[Service]
Type=simple
WorkingDirectory=$BASE_DIR/frontend/build
ExecStart=/usr/bin/python3 -m http.server $FRONTEND_PORT
Restart=always
RestartSec=10

[Install]
WantedBy=default.target
EOF

# Reload systemd
systemctl --user daemon-reload

# Start services
log "Starting services..."

systemctl --user enable bsmarker-backend.service
systemctl --user enable bsmarker-frontend.service

systemctl --user restart bsmarker-backend.service
systemctl --user restart bsmarker-frontend.service

# Wait for services to start
sleep 5

# Check status
log "Checking service status..."

if systemctl --user is-active --quiet bsmarker-backend.service; then
    log "✓ Backend is running on port $BACKEND_PORT"
else
    error "Backend failed to start. Check: systemctl --user status bsmarker-backend.service"
fi

if systemctl --user is-active --quiet bsmarker-frontend.service; then
    log "✓ Frontend is running on port $FRONTEND_PORT"
else
    error "Frontend failed to start. Check: systemctl --user status bsmarker-frontend.service"
fi

log "===================================="
log "Deployment completed successfully!"
log ""
log "Access points:"
log "  • Frontend: http://localhost:$FRONTEND_PORT"
log "  • Backend API: http://localhost:$BACKEND_PORT"
log "  • API Docs: http://localhost:$BACKEND_PORT/docs"
log ""
log "Admin credentials:"
log "  • Email: admin@bsmarker.com"
log "  • Password: Check .env.production file"
log ""
log "Service management:"
log "  • Status: systemctl --user status bsmarker-backend"
log "  • Logs: journalctl --user -u bsmarker-backend -f"
log "  • Restart: systemctl --user restart bsmarker-backend"
log ""
log "Note: This is running without Docker. For production with external"
log "access, you'll need:"
log "  1. PostgreSQL and Redis installed"
log "  2. Nginx reverse proxy configuration"
log "  3. SSL certificates"
log "===================================="
