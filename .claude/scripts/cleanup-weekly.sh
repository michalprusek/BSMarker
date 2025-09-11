#!/bin/bash
# Weekly cleanup script - Standard maintenance
# Runs Sunday at 4 AM via cron

set -e

LOG_FILE="/var/log/spheroseg-cleanup-weekly.log"
exec 1>>"$LOG_FILE"
exec 2>&1

echo "=== Weekly Cleanup Started: $(date) ==="

# Record initial disk usage
INITIAL_DISK=$(df -h / | tail -1 | awk '{print $3}')
echo "Initial disk usage: $INITIAL_DISK"

# Stop containers for cleanup
cd /home/cvat/cell-segmentation-hub
docker compose -f docker-compose.staging.yml down

# Docker cleanup
docker container prune -f
docker network prune -f
docker image prune -f
docker volume prune -f
docker builder prune -f --filter "until=168h"  # 7 days

# Clean orphaned processes
pkill -f "node.*spheroseg" 2>/dev/null || true
pkill -f "python.*segmentation" 2>/dev/null || true

# Clean Python cache
find /home/cvat/cell-segmentation-hub -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true
find /home/cvat/cell-segmentation-hub -type f -name "*.pyc" -delete 2>/dev/null || true

# Clean test artifacts
rm -rf /home/cvat/cell-segmentation-hub/coverage/ 2>/dev/null || true
rm -rf /home/cvat/cell-segmentation-hub/.nyc_output/ 2>/dev/null || true
rm -rf /home/cvat/cell-segmentation-hub/playwright-report/ 2>/dev/null || true

# Clean backup files
find /home/cvat/cell-segmentation-hub -name "*.bak" -o -name "*~" -delete 2>/dev/null || true

# Vacuum journal logs
sudo journalctl --vacuum-time=14d
sudo journalctl --vacuum-size=500M

# Clean Redis if needed
docker exec spheroseg-redis redis-cli --scan --pattern "bull:*" | head -1000 | xargs -L 1 docker exec spheroseg-redis redis-cli DEL 2>/dev/null || true

# Optimize git repository
cd /home/cvat/cell-segmentation-hub
git gc --auto
git prune-packed

# Restart containers
docker compose -f docker-compose.staging.yml up -d

# Report results
FINAL_DISK=$(df -h / | tail -1 | awk '{print $3}')
echo "Final disk usage: $FINAL_DISK"
echo "Docker space report:"
docker system df

echo "=== Weekly Cleanup Completed: $(date) ==="
echo ""
