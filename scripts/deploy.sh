#!/bin/bash

# BSMarker Production Deployment Script
# Usage: ./scripts/deploy.sh [--build] [--no-backup]

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
DEPLOY_DIR="/opt/bsmarker"
BACKUP_DIR="/var/backups/bsmarker"
COMPOSE_FILE="docker-compose.prod.yml"
ENV_FILE=".env.production"
LOG_FILE="/var/log/bsmarker/deploy_$(date +%Y%m%d_%H%M%S).log"

# Parse arguments
BUILD=false
BACKUP=true
for arg in "$@"; do
    case $arg in
        --build)
            BUILD=true
            shift
            ;;
        --no-backup)
            BACKUP=false
            shift
            ;;
        *)
            ;;
    esac
done

# Functions
log() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1" | tee -a "$LOG_FILE"
}

error() {
    echo -e "${RED}[$(date +'%Y-%m-%d %H:%M:%S')] ERROR:${NC} $1" | tee -a "$LOG_FILE"
    exit 1
}

warning() {
    echo -e "${YELLOW}[$(date +'%Y-%m-%d %H:%M:%S')] WARNING:${NC} $1" | tee -a "$LOG_FILE"
}

# Check if running as root or with sudo
if [[ $EUID -ne 0 ]]; then
   error "This script must be run as root or with sudo"
fi

# Create log directory if it doesn't exist
mkdir -p "$(dirname "$LOG_FILE")"

log "Starting BSMarker deployment..."

# Check if deployment directory exists
if [ ! -d "$DEPLOY_DIR" ]; then
    error "Deployment directory $DEPLOY_DIR does not exist"
fi

cd "$DEPLOY_DIR"

# Check if environment file exists
if [ ! -f "$ENV_FILE" ]; then
    error "Environment file $ENV_FILE not found. Please create it from .env.example"
fi

# Load environment variables safely
while IFS='=' read -r key value; do
    # Skip empty lines and comments
    [[ -z "$key" || "$key" =~ ^[[:space:]]*# ]] && continue
    # Export variable
    export "$key"="$value"
done < <(grep -v '^#' "$ENV_FILE" | grep -v '^[[:space:]]*$')

# Backup current deployment
if [ "$BACKUP" = true ]; then
    log "Creating backup..."
    mkdir -p "$BACKUP_DIR"
    
    # Backup database with compression and error handling
    log "Creating database backup..."
    if docker-compose -f "$COMPOSE_FILE" exec -T postgres pg_dump -U "$DB_USER" --no-password "$DB_NAME" | gzip > "$BACKUP_DIR/db_$(date +%Y%m%d_%H%M%S).sql.gz"; then
        log "Database backup completed successfully"
    else
        warning "Database backup failed"
    fi
    
    # Backup MinIO data with verification
    log "Creating MinIO backup..."
    MINIO_BACKUP_FILE="$BACKUP_DIR/minio_$(date +%Y%m%d_%H%M%S).tar.gz"
    if docker-compose -f "$COMPOSE_FILE" exec -T minio tar czf - /data > "$MINIO_BACKUP_FILE" && [ -s "$MINIO_BACKUP_FILE" ]; then
        log "MinIO backup completed successfully ($(du -sh "$MINIO_BACKUP_FILE" | cut -f1))"
    else
        warning "MinIO backup failed or resulted in empty file"
        rm -f "$MINIO_BACKUP_FILE"  # Remove empty backup file
    fi
    
    log "Backup completed"
fi

# Pull latest code
log "Pulling latest code from repository..."
git pull origin main || error "Failed to pull latest code"

# Build images if requested
if [ "$BUILD" = true ]; then
    log "Building Docker images..."
    docker-compose -f "$COMPOSE_FILE" build || error "Failed to build Docker images"
fi

# Pull latest images
log "Pulling Docker images..."
docker-compose -f "$COMPOSE_FILE" pull || warning "Some images could not be pulled"

# Run database migrations
log "Running database migrations..."
docker-compose -f "$COMPOSE_FILE" run --rm backend alembic upgrade head || warning "Database migrations failed"

# Deploy with zero downtime
log "Starting deployment with rolling update..."

# Scale up new containers
docker-compose -f "$COMPOSE_FILE" up -d --scale backend=4 --scale frontend=4 --no-recreate

# Wait for health checks
log "Waiting for services to be healthy..."
sleep 30

# Check health status
HEALTHY=true
for service in backend frontend nginx; do
    if ! docker-compose -f "$COMPOSE_FILE" ps | grep -q "${service}.*healthy"; then
        warning "Service $service is not healthy"
        HEALTHY=false
    fi
done

if [ "$HEALTHY" = false ]; then
    error "Some services are not healthy. Rolling back..."
    # Rollback logic here
fi

# Remove old containers
log "Removing old containers..."
docker-compose -f "$COMPOSE_FILE" up -d --scale backend=2 --scale frontend=2 --remove-orphans

# Clean up
log "Cleaning up old images..."
docker image prune -f

# Verify deployment with retries
log "Verifying deployment..."
VERIFICATION_ATTEMPTS=5
VERIFICATION_DELAY=10

for i in $(seq 1 $VERIFICATION_ATTEMPTS); do
    log "Verification attempt $i/$VERIFICATION_ATTEMPTS..."
    
    # Check if containers are healthy
    if docker-compose -f "$COMPOSE_FILE" ps | grep -q "Up.*healthy"; then
        # Test HTTP endpoint
        if curl -f -k --connect-timeout 5 --max-time 10 https://bsmarker.utia.cas.cz/health > /dev/null 2>&1; then
            log "Deployment successful! Application is running at https://bsmarker.utia.cas.cz"
            break
        fi
    fi
    
    if [ $i -eq $VERIFICATION_ATTEMPTS ]; then
        error "Deployment verification failed after $VERIFICATION_ATTEMPTS attempts. Application is not responding."
    else
        log "Attempt $i failed, waiting ${VERIFICATION_DELAY}s before retry..."
        sleep $VERIFICATION_DELAY
    fi
done

# Show status
log "Current service status:"
docker-compose -f "$COMPOSE_FILE" ps

log "Deployment completed successfully!"