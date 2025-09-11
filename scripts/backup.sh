#!/bin/bash

# BSMarker Backup Script
# Can be run manually or via cron
# Usage: ./scripts/backup.sh [--full]

set -e

# Configuration
BACKUP_DIR="/var/backups/bsmarker"
DEPLOY_DIR="/opt/bsmarker"
COMPOSE_FILE="docker-compose.prod.yml"
RETENTION_DAYS=7
S3_BUCKET="s3://backup.utia.cas.cz/bsmarker"  # Optional S3 backup

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

log() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1"
}

error() {
    echo -e "${RED}[$(date +'%Y-%m-%d %H:%M:%S')] ERROR:${NC} $1"
    exit 1
}

# Parse arguments
FULL_BACKUP=false
if [ "$1" == "--full" ]; then
    FULL_BACKUP=true
fi

# Create backup directory
mkdir -p "$BACKUP_DIR"
cd "$DEPLOY_DIR"

TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# Load environment variables safely
while IFS='=' read -r key value; do
    # Skip empty lines and comments
    [[ -z "$key" || "$key" =~ ^[[:space:]]*# ]] && continue
    # Export variable
    export "$key"="$value"
done < <(grep -v '^#' .env.production | grep -v '^[[:space:]]*$')

log "Starting backup process..."

# 1. Database backup
log "Backing up PostgreSQL database..."
docker-compose -f "$COMPOSE_FILE" exec -T postgres pg_dump -U "$DB_USER" "$DB_NAME" | gzip > "$BACKUP_DIR/db_${TIMESTAMP}.sql.gz"

# 2. MinIO backup (only if full backup requested)
if [ "$FULL_BACKUP" = true ]; then
    log "Backing up MinIO data (this may take a while)..."
    docker-compose -f "$COMPOSE_FILE" exec -T minio tar czf - /data > "$BACKUP_DIR/minio_${TIMESTAMP}.tar.gz"
fi

# 3. Configuration backup
log "Backing up configuration files..."
# Check which files exist before adding to tar
config_files=()
[ -f .env.production ] && config_files+=(.env.production)
[ -d nginx ] && find nginx -name "*.conf" -type f | while read -r file; do config_files+=("$file"); done
[ -f docker-compose.prod.yml ] && config_files+=(docker-compose.prod.yml)

if [ ${#config_files[@]} -gt 0 ]; then
    tar czf "$BACKUP_DIR/config_${TIMESTAMP}.tar.gz" "${config_files[@]}"
else
    warning "No configuration files found to backup"
fi

# 4. Application logs backup
log "Backing up application logs..."
# Check which log directories exist before backing up
log_files=()
[ -d backend/logs ] && find backend/logs -type f | while read -r file; do log_files+=("$file"); done
[ -d /var/log/nginx ] && find /var/log/nginx -type f | while read -r file; do log_files+=("$file"); done

if [ ${#log_files[@]} -gt 0 ]; then
    tar czf "$BACKUP_DIR/logs_${TIMESTAMP}.tar.gz" "${log_files[@]}"
else
    warning "No log files found to backup"
fi

# 5. Clean old backups
log "Cleaning old backups (keeping last $RETENTION_DAYS days)..."
find "$BACKUP_DIR" -name "*.gz" -mtime +$RETENTION_DAYS -delete

# 6. Upload to S3 (if configured)
if command -v aws &> /dev/null && [ ! -z "$S3_BUCKET" ]; then
    log "Uploading backups to S3..."
    aws s3 cp "$BACKUP_DIR/db_${TIMESTAMP}.sql.gz" "$S3_BUCKET/daily/" || true

    if [ "$FULL_BACKUP" = true ]; then
        aws s3 cp "$BACKUP_DIR/minio_${TIMESTAMP}.tar.gz" "$S3_BUCKET/full/" || true
    fi
fi

# 7. Generate backup report
BACKUP_SIZE=$(du -sh "$BACKUP_DIR" | cut -f1)
DB_SIZE=$(du -sh "$BACKUP_DIR/db_${TIMESTAMP}.sql.gz" | cut -f1)

cat > "$BACKUP_DIR/backup_${TIMESTAMP}.log" <<EOF
Backup Report - $(date)
========================
Database backup: db_${TIMESTAMP}.sql.gz (${DB_SIZE})
Full backup: ${FULL_BACKUP}
Total backup size: ${BACKUP_SIZE}
Retention: ${RETENTION_DAYS} days
EOF

log "Backup completed successfully!"
log "Database backup: $BACKUP_DIR/db_${TIMESTAMP}.sql.gz (${DB_SIZE})"
log "Total backup directory size: ${BACKUP_SIZE}"

# Send notification (optional)
# echo "BSMarker backup completed at $(date)" | mail -s "BSMarker Backup Report" admin@utia.cas.cz
