#!/bin/bash
# SSL Certificate Setup for BSMarker Production
# This script sets up Let's Encrypt SSL certificates using certbot

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}════════════════════════════════════════════════${NC}"
echo -e "${BLUE}  BSMarker SSL Certificate Setup${NC}"
echo -e "${BLUE}════════════════════════════════════════════════${NC}"
echo ""

# Check if running as root or with sudo
if [ "$EUID" -ne 0 ]; then
    echo -e "${YELLOW}⚠️  This script requires sudo privileges${NC}"
    echo "Please run with: sudo ./scripts/setup-ssl.sh"
    exit 1
fi

# Domain configuration
DOMAIN="${DOMAIN:-your-domain.example.com}"
EMAIL="${SSL_EMAIL:-admin@your-domain.example.com}"  # Set via SSL_EMAIL env var

echo -e "${BLUE}📋 Configuration:${NC}"
echo -e "   Domain: $DOMAIN"
echo -e "   Email: $EMAIL"
echo ""

# Create directories
echo -e "${BLUE}📁 Creating certificate directories...${NC}"
mkdir -p ./certbot/conf
mkdir -p ./certbot/www
mkdir -p ./certbot/logs

# Check if certificates already exist
if [ -d "./certbot/conf/live/$DOMAIN" ]; then
    echo -e "${YELLOW}⚠️  Certificates already exist for $DOMAIN${NC}"
    read -p "Do you want to renew them? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo -e "${GREEN}✓ Using existing certificates${NC}"
        exit 0
    fi
    RENEW="--force-renewal"
else
    RENEW=""
fi

# Start nginx temporarily for certificate generation
echo -e "${BLUE}🚀 Starting temporary nginx for ACME challenge...${NC}"

# Create temporary nginx config for HTTP-only
cat > ./nginx/nginx-letsencrypt.conf <<EOF
server {
    listen 80;
    server_name ${DOMAIN};

    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    location / {
        return 200 "Certificate generation in progress...\n";
        add_header Content-Type text/plain;
    }
}
EOF

# Start nginx with temporary config
docker run -d --name bsmarker-nginx-temp \
    -p 80:80 \
    -v $(pwd)/certbot/www:/var/www/certbot:ro \
    -v $(pwd)/nginx/nginx-letsencrypt.conf:/etc/nginx/conf.d/default.conf:ro \
    nginx:alpine

sleep 3

# Request certificate
echo -e "${BLUE}🔐 Requesting SSL certificate from Let's Encrypt...${NC}"
echo -e "${YELLOW}   This may take a minute...${NC}"
echo ""

docker run --rm \
    -v $(pwd)/certbot/conf:/etc/letsencrypt \
    -v $(pwd)/certbot/www:/var/www/certbot \
    -v $(pwd)/certbot/logs:/var/log/letsencrypt \
    certbot/certbot certonly \
    --webroot \
    --webroot-path=/var/www/certbot \
    --email $EMAIL \
    --agree-tos \
    --no-eff-email \
    $RENEW \
    -d $DOMAIN

# Stop temporary nginx
echo ""
echo -e "${BLUE}🧹 Cleaning up temporary nginx...${NC}"
docker stop bsmarker-nginx-temp
docker rm bsmarker-nginx-temp

# Verify certificates
if [ -f "./certbot/conf/live/$DOMAIN/fullchain.pem" ]; then
    echo ""
    echo -e "${GREEN}════════════════════════════════════════════════${NC}"
    echo -e "${GREEN}✓ SSL certificates generated successfully!${NC}"
    echo -e "${GREEN}════════════════════════════════════════════════${NC}"
    echo ""

    echo -e "${BLUE}📄 Certificate Information:${NC}"
    openssl x509 -in ./certbot/conf/live/$DOMAIN/fullchain.pem -noout -dates
    echo ""

    echo -e "${YELLOW}💡 Next steps:${NC}"
    echo -e "   1. Certificates are ready in ./certbot/conf/"
    echo -e "   2. Deploy with: ./scripts/deploy-prod.sh --build"
    echo ""

    # Set up auto-renewal cron job
    echo -e "${BLUE}⏰ Setting up auto-renewal cron job...${NC}"
    CRON_CMD="0 0 1 * * cd $(pwd) && ./scripts/renew-ssl.sh >> ./certbot/logs/renewal.log 2>&1"
    (crontab -l 2>/dev/null | grep -v "renew-ssl.sh"; echo "$CRON_CMD") | crontab -
    echo -e "${GREEN}✓ Auto-renewal scheduled (monthly)${NC}"
else
    echo ""
    echo -e "${RED}✗ Certificate generation failed!${NC}"
    echo -e "${RED}   Check logs in ./certbot/logs/${NC}"
    exit 1
fi
