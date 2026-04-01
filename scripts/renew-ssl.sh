#!/bin/bash
# SSL Certificate Renewal Script
# Runs via cron twice daily to ensure timely renewal
# Only restarts nginx when a certificate is actually renewed

set -e

PROJECT_DIR="/home/prusek/BSMarker"
DOMAIN="bsmarker.utia.cas.cz"

echo "[$(date)] Starting SSL certificate renewal check for $DOMAIN"

# Renew certificate using absolute paths
# Remove --quiet so we can inspect the output for renewal status
RENEWAL_OUTPUT=$(docker run --rm \
    -v "${PROJECT_DIR}/certbot/conf:/etc/letsencrypt" \
    -v "${PROJECT_DIR}/certbot/www:/var/www/certbot" \
    -v "${PROJECT_DIR}/certbot/logs:/var/log/letsencrypt" \
    certbot/certbot renew \
    --webroot \
    --webroot-path=/var/www/certbot \
    2>&1) || true

echo "$RENEWAL_OUTPUT"

# Only reload nginx if certbot actually renewed a certificate
if echo "$RENEWAL_OUTPUT" | grep -qiE "congratulations|renewed|new certificate|renewal successful"; then
    if docker ps | grep -q bsmarker.*nginx; then
        echo "[$(date)] Certificate was renewed, reloading nginx to apply new certificates"
        docker exec bsmarker_nginx_1 nginx -s reload 2>/dev/null \
            || docker restart bsmarker_nginx_1
        echo "[$(date)] Nginx reloaded successfully"
    else
        echo "[$(date)] Certificate renewed but nginx container is not running"
    fi
else
    echo "[$(date)] No certificate renewal needed, skipping nginx reload"
fi
