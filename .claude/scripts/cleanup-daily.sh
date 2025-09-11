#!/bin/bash
# Daily cleanup script - Light maintenance
# Runs at 3 AM daily via cron

set -e

LOG_FILE="/var/log/spheroseg-cleanup-daily.log"
exec 1>>"$LOG_FILE"
exec 2>&1

echo "=== Daily Cleanup Started: $(date) ==="

# Clean Docker dangling images
docker image prune -f

# Clear old logs (older than 7 days)
find /home/cvat/cell-segmentation-hub -name "*.log" -mtime +7 -delete 2>/dev/null || true

# Clean temporary files
rm -rf /tmp/spheroseg-* 2>/dev/null || true
rm -rf /tmp/upload-* 2>/dev/null || true

# Truncate large application logs
for log in /home/cvat/cell-segmentation-hub/backend/logs/*.log; do
    if [ -f "$log" ] && [ $(stat -c%s "$log") -gt 104857600 ]; then  # 100MB
        tail -n 10000 "$log" > "$log.tmp"
        mv "$log.tmp" "$log"
        echo "Truncated large log: $log"
    fi
done

# Clean npm/yarn cache if it's too large
NPM_CACHE_SIZE=$(du -sm ~/.npm 2>/dev/null | cut -f1)
if [ "$NPM_CACHE_SIZE" -gt 500 ]; then
    npm cache clean --force
    echo "Cleaned npm cache (was ${NPM_CACHE_SIZE}MB)"
fi

# Report disk usage
echo "Disk usage after cleanup:"
df -h / | tail -1

echo "=== Daily Cleanup Completed: $(date) ==="
echo ""
