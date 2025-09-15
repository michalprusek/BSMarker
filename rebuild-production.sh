#!/bin/bash

# ============================================
# BSMarker Production Rebuild Script
# ============================================
# This script performs a complete rebuild of the production environment
# with safety checks and rollback capability

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
COMPOSE_FILE="docker-compose.prod.yml"
BACKUP_DIR="./backups/$(date +%Y%m%d_%H%M%S)"
MAX_WAIT_TIME=60  # Maximum time to wait for services to be healthy

# Function to print colored messages
print_message() {
    local color=$1
    local message=$2
    echo -e "${color}${message}${NC}"
}

# Function to check if docker-compose file exists
check_compose_file() {
    if [ ! -f "$COMPOSE_FILE" ]; then
        print_message "$RED" "❌ Error: $COMPOSE_FILE not found!"
        exit 1
    fi
}

# Function to create backup
create_backup() {
    print_message "$BLUE" "📦 Creating backup of current configuration..."
    mkdir -p "$BACKUP_DIR"

    # Backup docker-compose file
    cp "$COMPOSE_FILE" "$BACKUP_DIR/" 2>/dev/null || true

    # Save current container info
    docker-compose -f "$COMPOSE_FILE" ps > "$BACKUP_DIR/container_status.txt" 2>/dev/null || true

    # Save current image tags
    docker-compose -f "$COMPOSE_FILE" images > "$BACKUP_DIR/images.txt" 2>/dev/null || true

    print_message "$GREEN" "✅ Backup created in $BACKUP_DIR"
}

# Function to check service health
check_service_health() {
    local service=$1
    local max_attempts=30
    local attempt=0

    print_message "$YELLOW" "⏳ Waiting for $service to be healthy..."

    while [ $attempt -lt $max_attempts ]; do
        if docker-compose -f "$COMPOSE_FILE" ps | grep -q "$service.*healthy\|$service.*running"; then
            print_message "$GREEN" "✅ $service is healthy"
            return 0
        fi

        sleep 2
        attempt=$((attempt + 1))
    done

    print_message "$RED" "❌ $service failed to become healthy"
    return 1
}

# Main deployment process
main() {
    print_message "$BLUE" "
╔════════════════════════════════════════════╗
║     BSMarker Production Rebuild Script     ║
║              $(date +"%Y-%m-%d %H:%M:%S")              ║
╚════════════════════════════════════════════╝
"

    # Step 1: Check prerequisites
    print_message "$YELLOW" "📋 Step 1: Checking prerequisites..."
    check_compose_file

    # Step 2: Pull latest code
    print_message "$YELLOW" "📥 Step 2: Pulling latest code from dev branch..."
    git fetch origin
    git checkout dev
    git pull origin dev

    # Show recent commits
    print_message "$BLUE" "📝 Recent commits:"
    git log --oneline -5

    # Step 3: Create backup
    print_message "$YELLOW" "💾 Step 3: Creating backup..."
    create_backup

    # Step 4: Build new images
    print_message "$YELLOW" "🔨 Step 4: Building new Docker images (this may take several minutes)..."
    docker-compose -f "$COMPOSE_FILE" build --no-cache

    if [ $? -ne 0 ]; then
        print_message "$RED" "❌ Build failed! Check the logs above for errors."
        exit 1
    fi

    # Step 5: Stop current containers
    print_message "$YELLOW" "🛑 Step 5: Stopping current containers..."
    docker-compose -f "$COMPOSE_FILE" down

    # Step 6: Remove old images to free space
    print_message "$YELLOW" "🧹 Step 6: Cleaning up old images..."
    docker image prune -f

    # Step 7: Start new containers
    print_message "$YELLOW" "🚀 Step 7: Starting new containers..."
    docker-compose -f "$COMPOSE_FILE" up -d

    # Step 8: Wait for services to be healthy
    print_message "$YELLOW" "⏳ Step 8: Waiting for services to be healthy..."

    sleep 10  # Initial wait for containers to start

    # Check each critical service
    services=("postgres" "redis" "backend" "frontend" "nginx")
    all_healthy=true

    for service in "${services[@]}"; do
        if ! check_service_health "$service"; then
            all_healthy=false
        fi
    done

    # Step 9: Verify deployment
    print_message "$YELLOW" "🔍 Step 9: Verifying deployment..."

    # Check container status
    docker-compose -f "$COMPOSE_FILE" ps

    # Test HTTP endpoint
    print_message "$YELLOW" "🌐 Testing HTTP endpoint..."
    if curl -f -s -o /dev/null -w "%{http_code}" https://bsmarker.utia.cas.cz/api/v1/health | grep -q "200"; then
        print_message "$GREEN" "✅ API is responding"
    else
        print_message "$YELLOW" "⚠️  API may not be fully ready yet"
    fi

    # Step 10: Show logs
    print_message "$YELLOW" "📋 Step 10: Recent logs from services..."
    docker-compose -f "$COMPOSE_FILE" logs --tail=10

    # Final status
    if [ "$all_healthy" = true ]; then
        print_message "$GREEN" "
╔════════════════════════════════════════════╗
║        ✅ DEPLOYMENT SUCCESSFUL! ✅        ║
╚════════════════════════════════════════════╝

🎯 Next steps:
1. Visit https://bsmarker.utia.cas.cz
2. Test login functionality
3. Test right-click on bounding boxes
4. Verify all 3 context menu options work:
   - Edit Label
   - Copy (Ctrl+C)
   - Delete (Del)

📊 To monitor logs:
   docker-compose -f $COMPOSE_FILE logs -f [service_name]

🔄 To rollback if needed:
   docker-compose -f $COMPOSE_FILE down
   # Then restore from backup in $BACKUP_DIR
"
    else
        print_message "$RED" "
╔════════════════════════════════════════════╗
║     ⚠️  DEPLOYMENT COMPLETED WITH WARNINGS  ║
╚════════════════════════════════════════════╝

Some services may not be fully healthy.
Please check the logs and verify manually.

To check logs:
   docker-compose -f $COMPOSE_FILE logs [service_name]
"
    fi
}

# Run main function
main
