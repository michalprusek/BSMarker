#!/bin/bash
# Complete BSMarker Production Setup Script
# This script automates the entire deployment process

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
MAGENTA='\033[0;35m'
NC='\033[0m'

clear

echo -e "${MAGENTA}"
cat << "EOF"
╔════════════════════════════════════════════════╗
║                                                ║
║       BSMarker Complete Production Setup       ║
║                                                ║
║     Automated Build & Deployment System        ║
║                                                ║
╚════════════════════════════════════════════════╝
EOF
echo -e "${NC}"
echo ""

# Step 1: Pre-deployment checks
echo -e "${BLUE}═══ Step 1/5: Running Pre-deployment Checks ═══${NC}"
if ./scripts/pre-deployment-check.sh; then
    echo -e "${GREEN}✓ All checks passed${NC}"
else
    echo -e "${RED}✗ Pre-deployment checks failed${NC}"
    echo -e "${YELLOW}Please fix the errors and run again${NC}"
    exit 1
fi
echo ""

# Step 2: Environment configuration
echo -e "${BLUE}═══ Step 2/5: Environment Configuration ═══${NC}"
if [ ! -f .env.production ]; then
    echo -e "${YELLOW}⚠️  .env.production not found${NC}"
    echo -n "Create from template? (Y/n): "
    read -r response
    if [[ "$response" =~ ^([yY][eE][sS]|[yY]| )$ ]] || [ -z "$response" ]; then
        cp .env.production.template .env.production
        echo -e "${GREEN}✓ Created .env.production from template${NC}"
        echo ""
        echo -e "${MAGENTA}═══ Generating Secure Secrets ═══${NC}"
        ./scripts/generate-secrets.sh > .env.secrets.txt
        cat .env.secrets.txt
        echo ""
        echo -e "${YELLOW}⚠️  IMPORTANT: Copy these secrets to .env.production NOW!${NC}"
        echo -e "${YELLOW}   Secrets saved to: .env.secrets.txt${NC}"
        echo ""
        echo -n "Press Enter after you've updated .env.production... "
        read
    else
        echo -e "${RED}✗ Cannot continue without .env.production${NC}"
        exit 1
    fi
else
    echo -e "${GREEN}✓ .env.production exists${NC}"

    # Check for placeholders
    if grep -q "CHANGE_ME" .env.production 2>/dev/null; then
        echo -e "${YELLOW}⚠️  Found placeholder values in .env.production${NC}"
        echo -n "Generate new secrets? (y/N): "
        read -r response
        if [[ "$response" =~ ^([yY][eE][sS]|[yY])$ ]]; then
            ./scripts/generate-secrets.sh
            echo ""
            echo -e "${YELLOW}Please update .env.production with these values${NC}"
            echo -n "Press Enter when done... "
            read
        fi
    fi
fi
echo ""

# Step 3: SSL Certificates
echo -e "${BLUE}═══ Step 3/5: SSL Certificate Setup ═══${NC}"
DOMAIN="${DOMAIN:-your-domain.example.com}"
if [ -d "certbot/conf/live/${DOMAIN}" ]; then
    echo -e "${GREEN}✓ SSL certificates already exist${NC}"

    # Check expiry
    if [ -f "certbot/conf/live/${DOMAIN}/fullchain.pem" ]; then
        EXPIRY=$(openssl x509 -in "certbot/conf/live/${DOMAIN}/fullchain.pem" -noout -enddate | cut -d= -f2)
        echo -e "${BLUE}  Expires: $EXPIRY${NC}"
    fi

    echo -n "Renew certificates? (y/N): "
    read -r response
    if [[ "$response" =~ ^([yY][eE][sS]|[yY])$ ]]; then
        echo -e "${YELLOW}Running SSL setup (requires sudo)...${NC}"
        sudo ./scripts/setup-ssl.sh
    fi
else
    echo -e "${YELLOW}⚠️  SSL certificates not found${NC}"
    echo -n "Setup SSL certificates now? (requires sudo) (Y/n): "
    read -r response
    if [[ "$response" =~ ^([yY][eE][sS]|[yY]| )$ ]] || [ -z "$response" ]; then
        sudo ./scripts/setup-ssl.sh
    else
        echo -e "${YELLOW}⚠️  Skipping SSL setup (you can run ./scripts/setup-ssl.sh later)${NC}"
    fi
fi
echo ""

# Step 4: Build Docker images
echo -e "${BLUE}═══ Step 4/5: Building Docker Images ═══${NC}"
echo -n "Build images now? (Y/n): "
read -r response
if [[ "$response" =~ ^([yY][eE][sS]|[yY]| )$ ]] || [ -z "$response" ]; then
    echo -e "${YELLOW}This will take 5-8 minutes (first build) or 1-2 minutes (incremental)...${NC}"
    ./scripts/build-prod-optimized.sh
else
    echo -e "${YELLOW}⚠️  Skipping build (you can run ./scripts/build-prod-optimized.sh later)${NC}"
fi
echo ""

# Step 5: Deploy
echo -e "${BLUE}═══ Step 5/5: Deployment ═══${NC}"
echo -n "Deploy to production now? (Y/n): "
read -r response
if [[ "$response" =~ ^([yY][eE][sS]|[yY]| )$ ]] || [ -z "$response" ]; then
    ./scripts/deploy-prod.sh

    echo ""
    echo -e "${GREEN}╔════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║                                                ║${NC}"
    echo -e "${GREEN}║         🎉 Deployment Complete! 🎉             ║${NC}"
    echo -e "${GREEN}║                                                ║${NC}"
    echo -e "${GREEN}╚════════════════════════════════════════════════╝${NC}"
    echo ""
    echo -e "${BLUE}🌐 Your application is now running at:${NC}"
    echo -e "${MAGENTA}   https://${DOMAIN}${NC}"
    echo ""
    echo -e "${BLUE}📊 Useful commands:${NC}"
    echo -e "   View logs:        ${YELLOW}docker-compose -f docker-compose.prod.yml logs -f${NC}"
    echo -e "   Check status:     ${YELLOW}docker-compose -f docker-compose.prod.yml ps${NC}"
    echo -e "   Restart service:  ${YELLOW}docker-compose -f docker-compose.prod.yml restart <service>${NC}"
    echo -e "   View resources:   ${YELLOW}docker stats${NC}"
    echo ""
    echo -e "${BLUE}🧪 Test your deployment:${NC}"
    echo -e "   Health check:     ${YELLOW}curl https://${DOMAIN}/health${NC}"
    echo -e "   API health:       ${YELLOW}curl https://${DOMAIN}/api/v1/health${NC}"
    echo ""
else
    echo -e "${YELLOW}⚠️  Skipping deployment (you can run ./scripts/deploy-prod.sh later)${NC}"
    echo ""
    echo -e "${BLUE}Setup complete! To deploy later, run:${NC}"
    echo -e "   ${YELLOW}./scripts/deploy-prod.sh${NC}"
fi

echo ""
echo -e "${GREEN}═══════════════════════════════════════════════${NC}"
echo -e "${GREEN}     Setup process completed successfully!      ${NC}"
echo -e "${GREEN}═══════════════════════════════════════════════${NC}"
