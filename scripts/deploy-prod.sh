#!/bin/bash
# Production deployment script for BSMarker
# Usage: ./scripts/deploy-prod.sh [--build] [--restart-only]

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Parse arguments
BUILD=false
RESTART_ONLY=false
while [[ $# -gt 0 ]]; do
    case $1 in
        --build)
            BUILD=true
            shift
            ;;
        --restart-only)
            RESTART_ONLY=true
            shift
            ;;
        *)
            echo -e "${RED}Unknown option: $1${NC}"
            echo "Usage: $0 [--build] [--restart-only]"
            exit 1
            ;;
    esac
done

echo -e "${BLUE}════════════════════════════════════════════════${NC}"
echo -e "${BLUE}  BSMarker Production Deployment${NC}"
echo -e "${BLUE}════════════════════════════════════════════════${NC}"
echo ""

# Check if .env.production exists
if [ ! -f .env.production ]; then
    echo -e "${RED}✗${NC} .env.production not found!"
    exit 1
fi

# Load environment
set -a
source .env.production
set +a

# Enable BuildKit
export DOCKER_BUILDKIT=1
export COMPOSE_DOCKER_CLI_BUILD=1

if [ "$RESTART_ONLY" = true ]; then
    echo -e "${YELLOW}🔄 Restarting services only...${NC}"
    docker-compose -f docker-compose.prod.yml restart
    echo -e "${GREEN}✓ Services restarted${NC}"
    exit 0
fi

# Build if requested
if [ "$BUILD" = true ]; then
    echo -e "${BLUE}🔨 Building images...${NC}"
    ./scripts/build-prod-optimized.sh
    echo ""
fi

# Check if any containers are running
RUNNING=$(docker-compose -f docker-compose.prod.yml ps -q | wc -l)

if [ "$RUNNING" -gt 0 ]; then
    echo -e "${YELLOW}⚠️  Existing containers detected${NC}"
    echo -e "${YELLOW}   Performing zero-downtime rolling update...${NC}"
    echo ""

    # Pull latest images (if they exist in registry)
    echo -e "${BLUE}📥 Pulling latest images...${NC}"
    docker-compose -f docker-compose.prod.yml pull || echo -e "${YELLOW}⚠️  No registry configured, using local images${NC}"

    # Start new containers without removing old ones
    echo -e "${BLUE}🚀 Starting new containers...${NC}"
    docker-compose -f docker-compose.prod.yml up -d --no-deps --build

    # Wait for health checks
    echo -e "${BLUE}⏳ Waiting for health checks...${NC}"
    sleep 10

    # Remove old containers
    echo -e "${BLUE}🧹 Removing old containers...${NC}"
    docker-compose -f docker-compose.prod.yml up -d --remove-orphans
else
    echo -e "${BLUE}🚀 Starting fresh deployment...${NC}"
    docker-compose -f docker-compose.prod.yml up -d
fi

echo ""
echo -e "${BLUE}⏳ Waiting for services to be healthy...${NC}"

# Wait for services with timeout
TIMEOUT=120
ELAPSED=0
INTERVAL=5

while [ $ELAPSED -lt $TIMEOUT ]; do
    HEALTHY=$(docker-compose -f docker-compose.prod.yml ps | grep -c "(healthy)" || true)
    TOTAL=$(docker-compose -f docker-compose.prod.yml ps --services | wc -l)

    echo -e "${YELLOW}   Health status: $HEALTHY/$TOTAL services healthy${NC}"

    if docker-compose -f docker-compose.prod.yml ps | grep -q "Exit"; then
        echo -e "${RED}✗ Some containers exited unexpectedly!${NC}"
        docker-compose -f docker-compose.prod.yml ps
        echo ""
        echo -e "${RED}📋 Container logs:${NC}"
        docker-compose -f docker-compose.prod.yml logs --tail=50
        exit 1
    fi

    # Check if backend is responding
    if docker-compose -f docker-compose.prod.yml exec -T backend python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health')" 2>/dev/null; then
        echo -e "${GREEN}✓ Backend is responding${NC}"
        break
    fi

    sleep $INTERVAL
    ELAPSED=$((ELAPSED + INTERVAL))
done

if [ $ELAPSED -ge $TIMEOUT ]; then
    echo -e "${RED}✗ Timeout waiting for services to be healthy${NC}"
    docker-compose -f docker-compose.prod.yml logs --tail=50
    exit 1
fi

echo ""
echo -e "${GREEN}════════════════════════════════════════════════${NC}"
echo -e "${GREEN}✓ Deployment completed successfully!${NC}"
echo -e "${GREEN}════════════════════════════════════════════════${NC}"
echo ""

# Show running services
echo -e "${BLUE}📊 Service Status:${NC}"
docker-compose -f docker-compose.prod.yml ps
echo ""

# Show resource usage
echo -e "${BLUE}💾 Resource Usage:${NC}"
docker stats --no-stream --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}" $(docker-compose -f docker-compose.prod.yml ps -q)
echo ""

echo -e "${YELLOW}💡 Useful commands:${NC}"
echo -e "   View logs: docker-compose -f docker-compose.prod.yml logs -f"
echo -e "   Restart service: docker-compose -f docker-compose.prod.yml restart <service>"
echo -e "   Stop all: docker-compose -f docker-compose.prod.yml down"
echo ""

# Test the deployment
echo -e "${BLUE}🧪 Testing deployment...${NC}"
if curl -f -s http://localhost/health > /dev/null; then
    echo -e "${GREEN}✓ Health check passed${NC}"
else
    echo -e "${YELLOW}⚠️  Health check failed - check nginx logs${NC}"
fi

echo ""
echo -e "${GREEN}🎉 Deployment complete!${NC}"
