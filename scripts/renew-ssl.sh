#!/bin/bash
# SSL Certificate Renewal Script
# This script should be run via cron monthly

set -e

DOMAIN="your-domain.example.com"

echo "[$(date)] Starting SSL certificate renewal for $DOMAIN"

# Renew certificate
docker run --rm \
    -v $(pwd)/certbot/conf:/etc/letsencrypt \
    -v $(pwd)/certbot/www:/var/www/certbot \
    -v $(pwd)/certbot/logs:/var/log/letsencrypt \
    certbot/certbot renew \
    --webroot \
    --webroot-path=/var/www/certbot \
    --quiet

# Reload nginx if certificates were renewed
if docker ps | grep -q bsmarker.*nginx; then
    echo "[$(date)] Reloading nginx to apply new certificates"
    docker-compose -f docker-compose.prod.yml exec nginx nginx -s reload
    echo "[$(date)] Certificate renewal completed and nginx reloaded"
else
    echo "[$(date)] Certificate renewal completed (no nginx reload needed)"
fi
