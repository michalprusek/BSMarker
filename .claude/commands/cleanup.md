# System Cleanup Command

## Usage
```
/cleanup [--dry-run] [--aggressive] [--backup]
```

## Description
Comprehensive cleanup command that safely removes unused Docker resources, orphaned processes, legacy files, and temporary data while maintaining system integrity.

## Parameters
- `--dry-run`: Show what would be cleaned without actually removing anything
- `--aggressive`: Perform deep cleanup including all Docker images and build cache
- `--backup`: Create backup of important data before cleanup

## Cleanup Workflow

This command orchestrates a systematic cleanup process across multiple layers:

### Phase 1: Pre-Cleanup Analysis
**Safety first - analyze before cleaning**
```bash
# Check disk usage before cleanup
df -h
du -sh /home/cvat/cell-segmentation-hub/*

# Docker space analysis
docker system df

# Journal log size
journalctl --disk-usage

# Find large files
find . -type f -size +100M -exec ls -lh {} \;

# Check for zombie processes
ps aux | grep '<defunct>'
```

### Phase 2: Docker Cleanup
**Remove unused Docker resources systematically**

#### Standard Docker Cleanup
```bash
# Stop all containers gracefully
docker compose -f docker-compose.staging.yml down

# Remove stopped containers
docker container prune -f

# Remove unused networks
docker network prune -f

# Remove dangling images
docker image prune -f

# Remove unused volumes (careful!)
docker volume prune -f

# Clean build cache
docker builder prune -f

# Remove images older than 30 days
docker image prune -a --filter "until=720h" -f
```

#### Aggressive Docker Cleanup (--aggressive flag)
```bash
# Complete system prune
docker system prune -a --volumes -f

# Remove ALL images including tagged ones
docker rmi $(docker images -q) 2>/dev/null || true

# Clear Docker build cache completely
docker builder prune --all -f

# Remove Docker log files
truncate -s 0 /var/lib/docker/containers/*/*-json.log
```

### Phase 3: Process Cleanup
**Clean orphaned and zombie processes**

```bash
# Find and kill orphaned Node processes
pkill -f "node.*spheroseg" 2>/dev/null || true
pkill -f "npm.*spheroseg" 2>/dev/null || true

# Kill orphaned Python ML processes
pkill -f "python.*segmentation" 2>/dev/null || true
pkill -f "uvicorn.*8000" 2>/dev/null || true

# Clean zombie processes (if parent is not init)
ps aux | grep '<defunct>' | grep -v grep | awk '{print $2}' | xargs -r kill -9 2>/dev/null || true

# Reset systemd if needed
sudo systemctl daemon-reload

# Clean orphaned screen/tmux sessions
screen -ls | grep Detached | cut -d. -f1 | awk '{print $1}' | xargs -r kill 2>/dev/null || true
tmux kill-server 2>/dev/null || true
```

### Phase 4: Application Files Cleanup
**Remove legacy and temporary files**

#### Frontend Cleanup
```bash
# Remove node_modules if rebuilding
find . -name "node_modules" -type d -prune -exec rm -rf {} + 2>/dev/null || true

# Clear package manager caches
npm cache clean --force
pnpm store prune 2>/dev/null || true
yarn cache clean 2>/dev/null || true

# Remove build artifacts
rm -rf dist/ build/ .next/ out/ 2>/dev/null || true

# Clear test coverage reports
rm -rf coverage/ .nyc_output/ 2>/dev/null || true

# Remove Playwright traces and screenshots
rm -rf playwright-report/ test-results/ 2>/dev/null || true
rm -rf /tmp/playwright-* 2>/dev/null || true
```

#### Backend Cleanup
```bash
# Python cache and artifacts
find . -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true
find . -type f -name "*.pyc" -delete 2>/dev/null || true
find . -type f -name "*.pyo" -delete 2>/dev/null || true
find . -type d -name ".pytest_cache" -exec rm -rf {} + 2>/dev/null || true

# ML model cache
rm -rf /tmp/transformers/ 2>/dev/null || true
rm -rf ~/.cache/torch/ 2>/dev/null || true
rm -rf ~/.cache/huggingface/ 2>/dev/null || true
```

#### Legacy Files Cleanup
```bash
# Find and remove backup files
find . -name "*.bak" -o -name "*.backup" -o -name "*~" -delete 2>/dev/null || true

# Remove old log files
find . -name "*.log" -mtime +30 -delete 2>/dev/null || true

# Clean temporary files
rm -rf /tmp/spheroseg-* 2>/dev/null || true
rm -rf /tmp/upload-* 2>/dev/null || true

# Remove .DS_Store files (macOS)
find . -name ".DS_Store" -delete 2>/dev/null || true

# Remove Thumbs.db files (Windows)
find . -name "Thumbs.db" -delete 2>/dev/null || true

# Clean vim swap files
find . -name "*.swp" -o -name "*.swo" -delete 2>/dev/null || true

# Remove empty directories
find . -type d -empty -delete 2>/dev/null || true
```

### Phase 5: System Logs Cleanup
**Clean system and application logs**

```bash
# Clean journalctl logs older than 7 days
sudo journalctl --vacuum-time=7d

# Limit journal size to 500M
sudo journalctl --vacuum-size=500M

# Rotate and flush logs
sudo journalctl --flush --rotate

# Clear application logs
> /home/cvat/cell-segmentation-hub/backend/logs/error.log
> /home/cvat/cell-segmentation-hub/backend/logs/access.log
> /home/cvat/cell-segmentation-hub/backend/logs/combined.log

# Clear nginx logs
truncate -s 0 /var/log/nginx/*.log 2>/dev/null || true

# Clear Redis logs
redis-cli FLUSHDB 2>/dev/null || true
```

### Phase 6: Database Cleanup
**Optimize database and remove orphaned data**

```bash
# Vacuum PostgreSQL database (inside container)
docker exec spheroseg-db psql -U spheroseg -d spheroseg_blue -c "VACUUM FULL ANALYZE;" 2>/dev/null || true

# Clean orphaned Prisma migrations
docker exec spheroseg-backend npx prisma migrate resolve --applied 2>/dev/null || true

# Remove old database backups (keep last 5)
ls -t /backups/db/*.sql 2>/dev/null | tail -n +6 | xargs -r rm 2>/dev/null || true
```

### Phase 7: Git Cleanup
**Optimize git repository**

```bash
# Clean git cache and optimize
git gc --aggressive --prune=now
git repack -Ad
git prune-packed

# Remove git reflog entries older than 30 days
git reflog expire --expire=30.days --all

# Clean git stash
git stash clear

# Remove untracked files (careful!)
# git clean -fdx  # Uncomment only if sure
```

### Phase 8: Dependency Cleanup
**Update and clean dependencies**

```bash
# Check for outdated packages
npm outdated || true

# Audit and fix vulnerabilities
npm audit fix || true

# Deduplicate npm packages
npm dedupe || true

# Remove unused dependencies (requires npm-check)
# npx npm-check -u  # Interactive removal
```

## Cleanup Report Generation

After cleanup, generate a comprehensive report:

```bash
echo "=== Cleanup Report ==="
echo "Disk Usage After:"
df -h
echo ""
echo "Docker Space Saved:"
docker system df
echo ""
echo "Directory Sizes:"
du -sh /home/cvat/cell-segmentation-hub/*
echo ""
echo "Active Processes:"
ps aux | grep -E "node|python|docker" | grep -v grep
echo ""
echo "Journal Size:"
journalctl --disk-usage
```

## Safety Measures

### Backup Creation (--backup flag)
```bash
# Create backup directory
mkdir -p /backups/cleanup-$(date +%Y%m%d-%H%M%S)

# Backup important configuration
cp -r .env* /backups/cleanup-*/
cp -r docker-compose*.yml /backups/cleanup-*/
cp -r /backend/prisma/schema.prisma /backups/cleanup-*/

# Backup database
docker exec spheroseg-db pg_dump -U spheroseg spheroseg_blue > /backups/cleanup-*/database.sql

# Create file list before cleanup
find . -type f > /backups/cleanup-*/files-before-cleanup.txt
```

### Dry Run Mode (--dry-run flag)
```bash
# Show what would be deleted without actually removing
docker system prune --dry-run
find . -name "*.log" -mtime +30 -print
du -sh node_modules/ 2>/dev/null || echo "No node_modules found"
```

## Automated Cleanup Schedule

Create a cron job for regular maintenance:

```bash
# Add to crontab (crontab -e)
# Daily at 3 AM - light cleanup
0 3 * * * /home/cvat/cell-segmentation-hub/.claude/scripts/cleanup-daily.sh

# Weekly on Sunday - standard cleanup
0 4 * * 0 /home/cvat/cell-segmentation-hub/.claude/scripts/cleanup-weekly.sh

# Monthly on 1st - aggressive cleanup
0 5 1 * * /home/cvat/cell-segmentation-hub/.claude/scripts/cleanup-monthly.sh
```

## Cleanup Checklist

- [ ] Docker containers stopped gracefully
- [ ] Docker images pruned (dangling/old)
- [ ] Docker volumes cleaned (unused)
- [ ] Docker build cache cleared
- [ ] Orphaned processes killed
- [ ] Node_modules cleaned (if needed)
- [ ] Package manager caches cleared
- [ ] Python caches removed
- [ ] Legacy files deleted
- [ ] Log files rotated/cleaned
- [ ] Journal logs vacuumed
- [ ] Database optimized
- [ ] Git repository optimized
- [ ] Temporary files removed
- [ ] Empty directories deleted
- [ ] Backup created (if requested)

## Space Saving Tips

1. **Use pnpm instead of npm** - Saves up to 50% disk space
2. **Enable Docker buildkit** - More efficient layer caching
3. **Use multi-stage builds** - Smaller final images
4. **Implement log rotation** - Prevent log bloat
5. **Regular cleanup schedule** - Prevent accumulation

## Recovery Commands

If cleanup was too aggressive:

```bash
# Restore from backup
cp -r /backups/cleanup-*/. /home/cvat/cell-segmentation-hub/

# Rebuild Docker images
docker compose -f docker-compose.staging.yml build --no-cache

# Reinstall dependencies
docker exec spheroseg-frontend npm ci
docker exec spheroseg-backend npm ci

# Restore database
docker exec -i spheroseg-db psql -U spheroseg spheroseg_blue < /backups/cleanup-*/database.sql
```

## Success Metrics

✅ Disk space recovered > 1GB
✅ No active zombie processes
✅ Docker space optimized
✅ All tests still passing
✅ Application runs normally
✅ No data loss
✅ Backup available if needed
✅ Performance improved
