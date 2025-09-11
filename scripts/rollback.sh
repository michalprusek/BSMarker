#!/bin/bash

# BSMarker Rollback Script
# Usage: ./scripts/rollback.sh [backup_date]

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Configuration
DEPLOY_DIR="/opt/bsmarker"
BACKUP_DIR="/var/backups/bsmarker"
COMPOSE_FILE="docker-compose.prod.yml"

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

# Check if running as root
if [[ $EUID -ne 0 ]]; then
   error "This script must be run as root or with sudo"
fi

cd "$DEPLOY_DIR"

# Load environment variables for DB connection
if [ -f ".env.production" ]; then
    while IFS='=' read -r key value; do
        # Skip empty lines and comments
        [[ -z "$key" || "$key" =~ ^[[:space:]]*# ]] && continue
        # Export variable
        export "$key"="$value"
    done < <(grep -v '^#' .env.production | grep -v '^[[:space:]]*$')
else
    error ".env.production file not found"
fi

# Get backup date from argument or find latest
if [ -z "$1" ]; then
    log "Finding latest backup..."
    LATEST_DB_BACKUP=$(ls -t "$BACKUP_DIR"/db_*.sql 2>/dev/null | head -1)
    if [ -z "$LATEST_DB_BACKUP" ]; then
        error "No database backups found in $BACKUP_DIR"
    fi
    BACKUP_DATE=$(basename "$LATEST_DB_BACKUP" | sed 's/db_\(.*\)\.sql/\1/')
else
    BACKUP_DATE=$1
fi

log "Rolling back to backup from $BACKUP_DATE"

# Check if backup files exist
DB_BACKUP="$BACKUP_DIR/db_${BACKUP_DATE}.sql"
MINIO_BACKUP="$BACKUP_DIR/minio_${BACKUP_DATE}.tar.gz"

if [ ! -f "$DB_BACKUP" ]; then
    error "Database backup $DB_BACKUP not found"
fi

# Stop current deployment
log "Stopping current deployment..."
docker-compose -f "$COMPOSE_FILE" down

# Restore database
log "Restoring database..."
docker-compose -f "$COMPOSE_FILE" up -d postgres

# Wait for postgres to be ready
log "Waiting for PostgreSQL to be ready..."
retries=30
while ! docker-compose -f "$COMPOSE_FILE" exec -T postgres pg_isready -U postgres > /dev/null 2>&1; do
    retries=$((retries-1))
    if [ $retries -eq 0 ]; then
        error "PostgreSQL failed to start after 30 attempts"
    fi
    sleep 1
done
log "PostgreSQL is ready"

# Drop existing database and recreate
docker-compose -f "$COMPOSE_FILE" exec -T postgres psql -U postgres -c "DROP DATABASE IF EXISTS \"${DB_NAME}\";"
docker-compose -f "$COMPOSE_FILE" exec -T postgres psql -U postgres -c "CREATE DATABASE \"${DB_NAME}\" OWNER \"${DB_USER}\";"

# Restore database backup
docker-compose -f "$COMPOSE_FILE" exec -T postgres psql -U "$DB_USER" "$DB_NAME" < "$DB_BACKUP"

# Restore MinIO data if backup exists
if [ -f "$MINIO_BACKUP" ]; then
    log "Restoring MinIO data..."
    docker-compose -f "$COMPOSE_FILE" up -d minio
    sleep 10
    docker-compose -f "$COMPOSE_FILE" exec -T minio sh -c "cd / && tar xzf -" < "$MINIO_BACKUP"
else
    warning "MinIO backup not found, skipping MinIO restoration"
fi

# Checkout previous git commit if needed
read -p "Do you want to revert to a previous code version? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    log "Showing recent commits..."
    git log --oneline -10
    read -p "Enter commit hash to revert to: " COMMIT_HASH

    # Validate commit hash exists
    if git cat-file -e "$COMMIT_HASH^{commit}" 2>/dev/null; then
        # Create backup branch before checkout
        BACKUP_BRANCH="rollback-backup-$(date +%Y%m%d_%H%M%S)"
        git branch "$BACKUP_BRANCH"
        log "Created backup branch: $BACKUP_BRANCH"

        git checkout "$COMMIT_HASH"
        log "Reverted to commit: $COMMIT_HASH"

        # Rebuild images with old code
        log "Rebuilding Docker images..."
        docker-compose -f "$COMPOSE_FILE" build
    else
        error "Invalid commit hash: $COMMIT_HASH"
    fi
fi

# Start all services
log "Starting all services..."
docker-compose -f "$COMPOSE_FILE" up -d

# Wait for services to be healthy
log "Waiting for services to be healthy..."
sleep 30

# Verify rollback
log "Verifying rollback..."
curl -f https://bsmarker.utia.cas.cz/health > /dev/null 2>&1
if [ $? -eq 0 ]; then
    log "Rollback successful! Application is running"
else
    error "Rollback verification failed. Please check logs."
fi

log "Rollback completed successfully!"
