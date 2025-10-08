#!/bin/bash
# Optimized production build script with parallelization and caching
# Usage: ./scripts/build-prod-optimized.sh [--no-cache] [--pull]

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Parse arguments
NO_CACHE=""
PULL=""
while [[ $# -gt 0 ]]; do
    case $1 in
        --no-cache)
            NO_CACHE="--no-cache"
            shift
            ;;
        --pull)
            PULL="--pull"
            shift
            ;;
        *)
            echo -e "${RED}Unknown option: $1${NC}"
            exit 1
            ;;
    esac
done

echo -e "${BLUE}════════════════════════════════════════════════${NC}"
echo -e "${BLUE}  BSMarker Production Build - Optimized${NC}"
echo -e "${BLUE}════════════════════════════════════════════════${NC}"
echo ""

# Check if BuildKit is enabled
if [ -z "$DOCKER_BUILDKIT" ]; then
    export DOCKER_BUILDKIT=1
    echo -e "${YELLOW}⚙️  Enabling Docker BuildKit for faster builds${NC}"
fi

# Check if docker-compose supports BuildKit
export COMPOSE_DOCKER_CLI_BUILD=1

echo -e "${GREEN}✓${NC} BuildKit enabled"
echo ""

# Load environment variables
if [ -f .env.production ]; then
    echo -e "${GREEN}✓${NC} Loading production environment variables"
    set -a
    source .env.production 2>/dev/null || true
    set +a
else
    echo -e "${RED}✗${NC} .env.production not found!"
    exit 1
fi

echo ""
echo -e "${BLUE}📊 Build Configuration:${NC}"
echo -e "   Cache: ${NO_CACHE:-enabled}"
echo -e "   Pull base images: ${PULL:-no}"
echo -e "   BuildKit: enabled"
echo -e "   Parallel builds: yes"
echo ""

# Prune old build cache (keep last 7 days)
echo -e "${YELLOW}🧹 Pruning old build cache (7 days+)...${NC}"
docker builder prune -a --filter "until=168h" -f || true
echo ""

# Build with parallel execution
echo -e "${BLUE}🚀 Starting parallel build process...${NC}"
echo ""

BUILD_START=$(date +%s)

# Build images in parallel using docker-compose
docker-compose -f docker-compose.prod.yml build \
    $NO_CACHE \
    $PULL \
    --parallel \
    --progress=auto \
    backend frontend nginx

BUILD_END=$(date +%s)
BUILD_TIME=$((BUILD_END - BUILD_START))

echo ""
echo -e "${GREEN}════════════════════════════════════════════════${NC}"
echo -e "${GREEN}✓ Build completed successfully!${NC}"
echo -e "${GREEN}════════════════════════════════════════════════${NC}"
echo ""
echo -e "${BLUE}📈 Build Statistics:${NC}"
echo -e "   Total time: ${BUILD_TIME}s"
echo ""

# Show image sizes
echo -e "${BLUE}📦 Image Sizes:${NC}"
docker images --format "table {{.Repository}}\t{{.Tag}}\t{{.Size}}" | grep -E "bsmarker|REPOSITORY"
echo ""

echo -e "${YELLOW}💡 Next steps:${NC}"
echo -e "   1. Test locally: docker-compose -f docker-compose.prod.yml up -d"
echo -e "   2. Check logs: docker-compose -f docker-compose.prod.yml logs -f"
echo -e "   3. Deploy: ./scripts/deploy-prod.sh"
echo ""
