#!/bin/bash
# SSL Certificate Renewal Script
# Runs via cron twice daily to ensure timely renewal

set -e

PROJECT_DIR="/home/prusek/BSMarker"
DOMAIN="${DOMAIN:-your-domain.example.com}"

echo "[$(date)] Starting SSL certificate renewal check for $DOMAIN"

# Renew certificate using absolute paths
docker run --rm \
    -v "${PROJECT_DIR}/certbot/conf:/etc/letsencrypt" \
    -v "${PROJECT_DIR}/certbot/www:/var/www/certbot" \
    -v "${PROJECT_DIR}/certbot/logs:/var/log/letsencrypt" \
    certbot/certbot renew \
    --webroot \
    --webroot-path=/var/www/certbot \
    --quiet

# Reload nginx if certificates were renewed
if docker ps | grep -q bsmarker.*nginx; then
    echo "[$(date)] Reloading nginx to apply new certificates"
    docker restart bsmarker_nginx_1
    echo "[$(date)] Certificate renewal completed and nginx restarted"
else
    echo "[$(date)] Certificate renewal completed (no nginx reload needed)"
fi
