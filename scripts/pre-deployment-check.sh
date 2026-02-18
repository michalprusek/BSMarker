#!/bin/bash
# Pre-deployment checks for BSMarker production

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}════════════════════════════════════════════════${NC}"
echo -e "${BLUE}  BSMarker Pre-Deployment Checks${NC}"
echo -e "${BLUE}════════════════════════════════════════════════${NC}"
echo ""

ERRORS=0
WARNINGS=0

# Check 1: Docker version
echo -n "🐋 Checking Docker version... "
DOCKER_VERSION=$(docker --version | grep -oP '\d+\.\d+\.\d+' | head -1)
DOCKER_MAJOR=$(echo $DOCKER_VERSION | cut -d. -f1)
DOCKER_MINOR=$(echo $DOCKER_VERSION | cut -d. -f2)

if [ "$DOCKER_MAJOR" -lt 20 ] || ([ "$DOCKER_MAJOR" -eq 20 ] && [ "$DOCKER_MINOR" -lt 10 ]); then
    echo -e "${RED}✗ Docker $DOCKER_VERSION (need 20.10+)${NC}"
    ERRORS=$((ERRORS + 1))
else
    echo -e "${GREEN}✓ Docker $DOCKER_VERSION${NC}"
fi

# Check 2: Docker Compose version
echo -n "🐋 Checking Docker Compose version... "
COMPOSE_VERSION=$(docker-compose --version | grep -oP '\d+\.\d+\.\d+' | head -1)
COMPOSE_MAJOR=$(echo $COMPOSE_VERSION | cut -d. -f1)
COMPOSE_MINOR=$(echo $COMPOSE_VERSION | cut -d. -f2)

if [ "$COMPOSE_MAJOR" -lt 1 ] || ([ "$COMPOSE_MAJOR" -eq 1 ] && [ "$COMPOSE_MINOR" -lt 29 ]); then
    echo -e "${RED}✗ Docker Compose $COMPOSE_VERSION (need 1.29+)${NC}"
    ERRORS=$((ERRORS + 1))
else
    echo -e "${GREEN}✓ Docker Compose $COMPOSE_VERSION${NC}"
fi

# Check 3: .env.production file
echo -n "📄 Checking .env.production... "
if [ ! -f .env.production ]; then
    echo -e "${RED}✗ Missing${NC}"
    echo -e "   ${YELLOW}Create from template: cp .env.production.template .env.production${NC}"
    ERRORS=$((ERRORS + 1))
else
    # Check for placeholder values
    if grep -q "CHANGE_ME" .env.production 2>/dev/null; then
        echo -e "${YELLOW}⚠ Contains placeholder values${NC}"
        echo -e "   ${YELLOW}Run: ./scripts/generate-secrets.sh${NC}"
        WARNINGS=$((WARNINGS + 1))
    else
        echo -e "${GREEN}✓ Exists and configured${NC}"
    fi
fi

# Check 4: SSL certificates
DOMAIN="${DOMAIN:-your-domain.example.com}"
echo -n "🔒 Checking SSL certificates... "
if [ -d "certbot/conf/live/${DOMAIN}" ]; then
    echo -e "${GREEN}✓ Present${NC}"

    # Check expiry
    if [ -f "certbot/conf/live/${DOMAIN}/fullchain.pem" ]; then
        EXPIRY=$(openssl x509 -in "certbot/conf/live/${DOMAIN}/fullchain.pem" -noout -enddate | cut -d= -f2)
        echo -e "   ${BLUE}Expires: $EXPIRY${NC}"
    fi
else
    echo -e "${YELLOW}⚠ Not found${NC}"
    echo -e "   ${YELLOW}Run: sudo ./scripts/setup-ssl.sh${NC}"
    WARNINGS=$((WARNINGS + 1))
fi

# Check 5: Ports availability
echo -n "🔌 Checking port 80... "
if netstat -tuln 2>/dev/null | grep -q ":80 " || ss -tuln 2>/dev/null | grep -q ":80 "; then
    echo -e "${YELLOW}⚠ Already in use${NC}"
    WARNINGS=$((WARNINGS + 1))
else
    echo -e "${GREEN}✓ Available${NC}"
fi

echo -n "🔌 Checking port 443... "
if netstat -tuln 2>/dev/null | grep -q ":443 " || ss -tuln 2>/dev/null | grep -q ":443 "; then
    echo -e "${YELLOW}⚠ Already in use${NC}"
    WARNINGS=$((WARNINGS + 1))
else
    echo -e "${GREEN}✓ Available${NC}"
fi

# Check 6: Disk space
echo -n "💾 Checking disk space... "
AVAILABLE=$(df -BG . | tail -1 | awk '{print $4}' | sed 's/G//')
if [ "$AVAILABLE" -lt 10 ]; then
    echo -e "${RED}✗ Only ${AVAILABLE}GB available (need 10GB+)${NC}"
    ERRORS=$((ERRORS + 1))
elif [ "$AVAILABLE" -lt 20 ]; then
    echo -e "${YELLOW}⚠ Only ${AVAILABLE}GB available (recommend 20GB+)${NC}"
    WARNINGS=$((WARNINGS + 1))
else
    echo -e "${GREEN}✓ ${AVAILABLE}GB available${NC}"
fi

# Check 7: Memory
echo -n "🧠 Checking memory... "
TOTAL_MEM=$(free -g | grep Mem | awk '{print $2}')
if [ "$TOTAL_MEM" -lt 4 ]; then
    echo -e "${YELLOW}⚠ Only ${TOTAL_MEM}GB (recommend 4GB+)${NC}"
    WARNINGS=$((WARNINGS + 1))
else
    echo -e "${GREEN}✓ ${TOTAL_MEM}GB available${NC}"
fi

# Check 8: BuildKit
echo -n "⚙️  Checking BuildKit... "
if [ "$DOCKER_BUILDKIT" = "1" ]; then
    echo -e "${GREEN}✓ Enabled${NC}"
else
    echo -e "${YELLOW}⚠ Not enabled${NC}"
    echo -e "   ${YELLOW}Run: export DOCKER_BUILDKIT=1${NC}"
    WARNINGS=$((WARNINGS + 1))
fi

# Check 9: Required scripts
echo -n "📜 Checking deployment scripts... "
MISSING_SCRIPTS=0
for script in build-prod-optimized.sh deploy-prod.sh setup-ssl.sh renew-ssl.sh; do
    if [ ! -x "scripts/$script" ]; then
        MISSING_SCRIPTS=$((MISSING_SCRIPTS + 1))
    fi
done

if [ $MISSING_SCRIPTS -gt 0 ]; then
    echo -e "${RED}✗ $MISSING_SCRIPTS script(s) missing or not executable${NC}"
    ERRORS=$((ERRORS + 1))
else
    echo -e "${GREEN}✓ All present${NC}"
fi

# Check 10: Docker daemon running
echo -n "🐳 Checking Docker daemon... "
if docker info >/dev/null 2>&1; then
    echo -e "${GREEN}✓ Running${NC}"
else
    echo -e "${RED}✗ Not running${NC}"
    ERRORS=$((ERRORS + 1))
fi

echo ""
echo -e "${BLUE}════════════════════════════════════════════════${NC}"

# Summary
if [ $ERRORS -eq 0 ] && [ $WARNINGS -eq 0 ]; then
    echo -e "${GREEN}✓ All checks passed! Ready to deploy.${NC}"
    echo ""
    echo -e "${BLUE}Next steps:${NC}"
    echo -e "   1. ./scripts/deploy-prod.sh --build"
    echo -e "   2. Monitor logs: docker-compose -f docker-compose.prod.yml logs -f"
    exit 0
elif [ $ERRORS -eq 0 ]; then
    echo -e "${YELLOW}⚠ $WARNINGS warning(s) - can deploy but review warnings${NC}"
    echo ""
    exit 0
else
    echo -e "${RED}✗ $ERRORS error(s) and $WARNINGS warning(s) - fix errors before deploying${NC}"
    echo ""
    exit 1
fi
