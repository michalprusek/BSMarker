FROM nginx:alpine

# Install certbot for SSL certificates and curl for health checks
RUN apk add --no-cache certbot certbot-nginx curl

# Remove default config
RUN rm /etc/nginx/conf.d/default.conf

# Copy configuration files
COPY nginx.conf /etc/nginx/conf.d/
COPY proxy_params.conf /etc/nginx/

# Create directories for SSL certificates
RUN mkdir -p /etc/letsencrypt /var/www/certbot

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost/health || exit 1

EXPOSE 80 443

CMD ["nginx", "-g", "daemon off;"]