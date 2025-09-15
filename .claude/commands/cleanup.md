---
name: cleanup
description: Comprehensive system cleanup with intelligent space recovery and optimization
argument-hint: [--dry-run] [--aggressive] [--backup] [docker|files|logs|all]
---

# Overview

This command performs intelligent system cleanup to recover disk space, remove orphaned processes, clean Docker resources, and optimize the BSMarker application environment. It can run in dry-run mode for safety, create backups before cleanup, or perform aggressive cleaning when needed.

## Variables

- `$ARGUMENTS`: Control cleanup behavior and scope
  - `--dry-run`: Preview what would be cleaned without removing anything
  - `--aggressive`: Perform deep cleanup including all Docker images and caches
  - `--backup`: Create backup of important data before cleanup
  - `docker`: Clean only Docker resources
  - `files`: Clean only application files
  - `logs`: Clean only log files
  - `all`: Clean everything (default)

## Instructions

1. **Analysis**: Assess current disk usage and identify cleanup opportunities
2. **Safety Check**: Create backups if requested, validate critical services
3. **Docker Cleanup**: Remove unused containers, images, volumes, and networks
4. **Process Cleanup**: Terminate orphaned and zombie processes
5. **File Cleanup**: Remove temporary files, caches, and build artifacts
6. **Log Rotation**: Clean and rotate system and application logs
7. **Optimization**: Optimize databases and git repositories
8. **Reporting**: Generate comprehensive cleanup report with metrics

## Workflow

### Phase 1: Pre-Cleanup Analysis
```bash
echo "📊 Analyzing system before cleanup..."

# Check disk usage
df -h
echo ""

# Docker space analysis
docker system df
echo ""

# Directory sizes
du -sh /home/prusek/BSMarker/* 2>/dev/null | sort -rh | head -10
echo ""

# Journal log size
journalctl --disk-usage 2>/dev/null || echo "Journal size check not available"
echo ""

# Find large files
echo "🔍 Large files (>100MB):"
find /home/prusek/BSMarker -type f -size +100M -exec ls -lh {} \; 2>/dev/null | head -10

# Check for zombie processes
ZOMBIES=$(ps aux | grep '<defunct>' | wc -l)
echo "🧟 Zombie processes found: $ZOMBIES"
```

### Phase 2: Backup Creation (if --backup)
```bash
if [[ "$ARGUMENTS" == *"--backup"* ]]; then
    echo "💾 Creating backup..."
    BACKUP_DIR="/tmp/bsmarker-backup-$(date +%Y%m%d-%H%M%S)"
    mkdir -p "$BACKUP_DIR"

    # Backup important configuration
    cp -r /home/prusek/BSMarker/.env* "$BACKUP_DIR/" 2>/dev/null || true
    cp -r /home/prusek/BSMarker/docker-compose*.yml "$BACKUP_DIR/" 2>/dev/null || true
    cp -r /home/prusek/BSMarker/backend/prisma/schema.prisma "$BACKUP_DIR/" 2>/dev/null || true

    # Create file list before cleanup
    find /home/prusek/BSMarker -type f > "$BACKUP_DIR/files-before-cleanup.txt"

    echo "✅ Backup created at: $BACKUP_DIR"
fi
```

### Phase 3: Docker Cleanup
```bash
if [[ "$ARGUMENTS" == *"docker"* ]] || [[ "$ARGUMENTS" != *"files"* && "$ARGUMENTS" != *"logs"* ]]; then
    echo "🐳 Cleaning Docker resources..."

    if [[ "$ARGUMENTS" == *"--dry-run"* ]]; then
        echo "[DRY RUN] Would clean Docker resources:"
        docker system df
    else
        # Stop containers gracefully
        docker-compose -f docker-compose.prod.yml down 2>/dev/null || true
        docker-compose -f docker-compose.dev.yml down 2>/dev/null || true

        # Standard cleanup
        docker container prune -f
        docker network prune -f
        docker image prune -f

        if [[ "$ARGUMENTS" == *"--aggressive"* ]]; then
            echo "🔥 Aggressive Docker cleanup..."
            # Remove ALL images
            docker rmi $(docker images -q) 2>/dev/null || true
            # Remove ALL volumes
            docker volume prune -af
            # Complete system prune
            docker system prune -af --volumes
            # Clear build cache
            docker builder prune --all -f
        else
            # Remove dangling volumes
            docker volume prune -f
            # Remove images older than 30 days
            docker image prune -a --filter "until=720h" -f
            # Clean build cache
            docker builder prune -f
        fi
    fi
fi
```

### Phase 4: Process Cleanup
```bash
if [[ "$ARGUMENTS" != *"--dry-run"* ]]; then
    echo "🔄 Cleaning orphaned processes..."

    # Kill orphaned Node processes
    pkill -f "node.*bsmarker" 2>/dev/null || true
    pkill -f "npm.*bsmarker" 2>/dev/null || true

    # Kill orphaned Python ML processes
    pkill -f "python.*segmentation" 2>/dev/null || true
    pkill -f "uvicorn.*8000" 2>/dev/null || true

    # Clean zombie processes
    ps aux | grep '<defunct>' | grep -v grep | awk '{print $2}' | xargs -r kill -9 2>/dev/null || true

    # Clean orphaned screen/tmux sessions
    screen -ls | grep Detached | cut -d. -f1 | awk '{print $1}' | xargs -r kill 2>/dev/null || true
    tmux kill-server 2>/dev/null || true
fi
```

### Phase 5: Application Files Cleanup
```bash
if [[ "$ARGUMENTS" == *"files"* ]] || [[ "$ARGUMENTS" != *"docker"* && "$ARGUMENTS" != *"logs"* ]]; then
    echo "📁 Cleaning application files..."

    if [[ "$ARGUMENTS" == *"--dry-run"* ]]; then
        echo "[DRY RUN] Would remove:"
        find /home/prusek/BSMarker -name "node_modules" -type d 2>/dev/null | head -5
        find /home/prusek/BSMarker -name "__pycache__" -type d 2>/dev/null | head -5
        find /home/prusek/BSMarker -name "*.log" -mtime +30 2>/dev/null | head -5
    else
        # Frontend cleanup
        if [[ "$ARGUMENTS" == *"--aggressive"* ]]; then
            find /home/prusek/BSMarker -name "node_modules" -type d -prune -exec rm -rf {} + 2>/dev/null || true
        fi
        npm cache clean --force 2>/dev/null || true
        rm -rf /home/prusek/BSMarker/frontend/dist /home/prusek/BSMarker/frontend/build 2>/dev/null || true
        rm -rf /home/prusek/BSMarker/frontend/coverage /home/prusek/BSMarker/frontend/.nyc_output 2>/dev/null || true

        # Backend cleanup
        find /home/prusek/BSMarker -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true
        find /home/prusek/BSMarker -type f -name "*.pyc" -delete 2>/dev/null || true
        find /home/prusek/BSMarker -type f -name "*.pyo" -delete 2>/dev/null || true
        rm -rf /home/prusek/BSMarker/backend/.pytest_cache 2>/dev/null || true

        # ML model cache
        rm -rf /tmp/transformers/ /tmp/torch_extensions/ 2>/dev/null || true
        rm -rf ~/.cache/torch/ ~/.cache/huggingface/ 2>/dev/null || true

        # General cleanup
        find /home/prusek/BSMarker -name "*.bak" -o -name "*.backup" -o -name "*~" -delete 2>/dev/null || true
        find /home/prusek/BSMarker -name ".DS_Store" -o -name "Thumbs.db" -delete 2>/dev/null || true
        find /home/prusek/BSMarker -name "*.swp" -o -name "*.swo" -delete 2>/dev/null || true

        # Remove old log files
        find /home/prusek/BSMarker -name "*.log" -mtime +30 -delete 2>/dev/null || true

        # Clean temporary files
        rm -rf /tmp/bsmarker-* /tmp/spheroseg-* 2>/dev/null || true

        # Remove empty directories
        find /home/prusek/BSMarker -type d -empty -delete 2>/dev/null || true
    fi
fi
```

### Phase 6: Log Cleanup
```bash
if [[ "$ARGUMENTS" == *"logs"* ]] || [[ "$ARGUMENTS" != *"docker"* && "$ARGUMENTS" != *"files"* ]]; then
    echo "📋 Cleaning logs..."

    if [[ "$ARGUMENTS" == *"--dry-run"* ]]; then
        echo "[DRY RUN] Would clean logs:"
        journalctl --disk-usage
        ls -lh /home/prusek/BSMarker/backend/logs/*.log 2>/dev/null || echo "No backend logs"
    else
        # Clean journalctl logs
        sudo journalctl --vacuum-time=7d 2>/dev/null || true
        sudo journalctl --vacuum-size=500M 2>/dev/null || true

        # Clear application logs
        for log in /home/prusek/BSMarker/backend/logs/*.log; do
            if [ -f "$log" ]; then
                > "$log"
            fi
        done

        # Clear nginx logs
        truncate -s 0 /var/log/nginx/*.log 2>/dev/null || true

        # Clear Redis dump if too large
        REDIS_DUMP="/home/prusek/BSMarker/dump.rdb"
        if [ -f "$REDIS_DUMP" ] && [ $(stat -f%z "$REDIS_DUMP" 2>/dev/null || stat -c%s "$REDIS_DUMP" 2>/dev/null) -gt 104857600 ]; then
            rm -f "$REDIS_DUMP"
            echo "Removed large Redis dump file"
        fi
    fi
fi
```

### Phase 7: Database Optimization
```bash
if [[ "$ARGUMENTS" != *"--dry-run"* ]] && [[ "$ARGUMENTS" == *"--aggressive"* ]]; then
    echo "🗄️ Optimizing database..."

    # Vacuum PostgreSQL database
    docker exec bsmarker-postgres psql -U postgres -d bsmarker -c "VACUUM FULL ANALYZE;" 2>/dev/null || echo "Database optimization skipped"

    # Clean old database backups (keep last 5)
    ls -t /home/prusek/BSMarker/backups/*.sql 2>/dev/null | tail -n +6 | xargs -r rm 2>/dev/null || true
fi
```

### Phase 8: Git Repository Optimization
```bash
if [[ "$ARGUMENTS" != *"--dry-run"* ]] && [[ "$ARGUMENTS" == *"--aggressive"* ]]; then
    echo "📦 Optimizing git repository..."

    cd /home/prusek/BSMarker
    git gc --aggressive --prune=now 2>/dev/null || true
    git repack -Ad 2>/dev/null || true
    git prune-packed 2>/dev/null || true
    git reflog expire --expire=30.days --all 2>/dev/null || true
fi
```

## Report

### Cleanup Summary
```bash
echo "
═══════════════════════════════════════════════════════
                   CLEANUP REPORT
═══════════════════════════════════════════════════════"

# Disk usage after cleanup
echo "
📊 Disk Usage After Cleanup:"
df -h | grep -E "Filesystem|/$|/home"

# Docker space saved
if [[ "$ARGUMENTS" == *"docker"* ]] || [[ "$ARGUMENTS" != *"files"* && "$ARGUMENTS" != *"logs"* ]]; then
    echo "
🐳 Docker Space Status:"
    docker system df
fi

# Directory sizes after cleanup
echo "
📁 Directory Sizes:"
du -sh /home/prusek/BSMarker/* 2>/dev/null | sort -rh | head -5

# Active processes
echo "
⚙️ Active BSMarker Processes:"
ps aux | grep -E "node|python|docker" | grep -i bsmarker | grep -v grep | wc -l

# Journal size
echo "
📋 System Journal Size:"
journalctl --disk-usage 2>/dev/null || echo "Not available"
```

### Cleanup Metrics
- **Mode**: ${ARGUMENTS:-"standard"}
- **Docker Cleaned**: [yes/no/dry-run]
- **Files Cleaned**: [yes/no/dry-run]
- **Logs Cleaned**: [yes/no/dry-run]
- **Processes Terminated**: [count]
- **Space Recovered**: [amount in GB]

### Actions Performed
✅ Docker containers stopped and removed
✅ Docker images pruned
✅ Docker volumes cleaned
✅ Orphaned processes terminated
✅ Cache directories cleared
✅ Temporary files removed
✅ Logs rotated and cleaned
✅ Empty directories removed
✅ Git repository optimized
✅ Database vacuumed

### Recommendations
1. Run cleanup weekly to prevent accumulation
2. Use `--dry-run` first to preview changes
3. Create backups before aggressive cleanup
4. Monitor disk usage regularly
5. Set up automated cleanup cron jobs

### Recovery Instructions
If cleanup was too aggressive:
```bash
# Restore from backup (if created)
cp -r /tmp/bsmarker-backup-*/* /home/prusek/BSMarker/

# Rebuild Docker images
docker-compose -f docker-compose.prod.yml build --no-cache

# Reinstall dependencies
cd /home/prusek/BSMarker/frontend && npm ci
cd /home/prusek/BSMarker/backend && npm ci
```

### Next Steps
- Run `/deploy` to rebuild if Docker was cleaned
- Run `/test` to verify application still works
- Set up monitoring to track disk usage
- Configure log rotation policies
