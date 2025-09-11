#!/bin/bash
# Monthly cleanup script - Aggressive maintenance
# Runs on 1st of month at 5 AM via cron

set -e

LOG_FILE="/var/log/spheroseg-cleanup-monthly.log"
BACKUP_DIR="/backups/monthly-cleanup-$(date +%Y%m%d-%H%M%S)"

exec 1>>"$LOG_FILE"
exec 2>&1

echo "=== Monthly Aggressive Cleanup Started: $(date) ==="

# Create backup first
echo "Creating backup at $BACKUP_DIR..."
mkdir -p "$BACKUP_DIR"

# Backup important files
cd /home/cvat/cell-segmentation-hub
cp -r .env* "$BACKUP_DIR/" 2>/dev/null || true
cp -r docker-compose*.yml "$BACKUP_DIR/"
cp -r backend/prisma/schema.prisma "$BACKUP_DIR/"

# Backup database
docker exec spheroseg-db pg_dump -U spheroseg spheroseg_blue > "$BACKUP_DIR/database.sql" 2>/dev/null || echo "Database backup skipped"

# Record initial state
INITIAL_DISK=$(df -h / | tail -1)
echo "Initial disk state: $INITIAL_DISK"
docker system df > "$BACKUP_DIR/docker-usage-before.txt"

# Stop all containers
docker compose -f docker-compose.staging.yml down

# Aggressive Docker cleanup
docker system prune -a --volumes -f
docker builder prune --all -f

# Clear Docker logs
find /var/lib/docker/containers -name "*-json.log" -exec truncate -s 0 {} \; 2>/dev/null || true

# Clean all node_modules (will be reinstalled)
find /home/cvat/cell-segmentation-hub -name "node_modules" -type d -prune -exec rm -rf {} + 2>/dev/null || true

# Clear all package manager caches
npm cache clean --force
pnpm store prune 2>/dev/null || true
yarn cache clean 2>/dev/null || true

# Clean Python/ML caches
rm -rf ~/.cache/torch/ 2>/dev/null || true
rm -rf ~/.cache/huggingface/ 2>/dev/null || true
rm -rf ~/.cache/pip/ 2>/dev/null || true

# Clean all build artifacts
find /home/cvat/cell-segmentation-hub -type d \( -name "dist" -o -name "build" -o -name ".next" \) -exec rm -rf {} + 2>/dev/null || true

# Remove old database backups (keep last 10)
ls -t /backups/db/*.sql 2>/dev/null | tail -n +11 | xargs -r rm 2>/dev/null || true

# Vacuum and reindex database
docker start spheroseg-db 2>/dev/null || true
sleep 5
docker exec spheroseg-db psql -U spheroseg -d spheroseg_blue -c "VACUUM FULL ANALYZE;" 2>/dev/null || true
docker exec spheroseg-db psql -U spheroseg -d spheroseg_blue -c "REINDEX DATABASE spheroseg_blue;" 2>/dev/null || true

# Clean system logs aggressively
sudo journalctl --vacuum-time=3d
sudo journalctl --vacuum-size=200M

# Clean apt cache (if Ubuntu/Debian)
sudo apt-get clean 2>/dev/null || true
sudo apt-get autoremove -y 2>/dev/null || true

# Git aggressive cleanup
cd /home/cvat/cell-segmentation-hub
git gc --aggressive --prune=now
git repack -Ad
git reflog expire --expire=30.days --all
git stash clear

# Remove empty directories
find /home/cvat/cell-segmentation-hub -type d -empty -delete 2>/dev/null || true

# Rebuild containers with fresh images
docker compose -f docker-compose.staging.yml build --no-cache

# Install fresh dependencies
docker compose -f docker-compose.staging.yml run --rm frontend npm ci
docker compose -f docker-compose.staging.yml run --rm backend npm ci

# Start containers
docker compose -f docker-compose.staging.yml up -d

# Run health checks
sleep 30
HEALTH_CHECK=$(curl -s http://localhost:4000/health || echo "FAILED")
echo "Health check result: $HEALTH_CHECK"

# Generate report
echo "=== Cleanup Report ==="
FINAL_DISK=$(df -h / | tail -1)
echo "Final disk state: $FINAL_DISK"
echo ""
echo "Docker space after cleanup:"
docker system df
echo ""
echo "Largest directories:"
du -sh /home/cvat/cell-segmentation-hub/* | sort -rh | head -10
echo ""

# Keep cleanup logs for 90 days only
find /var/log -name "spheroseg-cleanup-*.log" -mtime +90 -delete 2>/dev/null || true

echo "=== Monthly Aggressive Cleanup Completed: $(date) ==="
echo "Backup available at: $BACKUP_DIR"
echo ""
