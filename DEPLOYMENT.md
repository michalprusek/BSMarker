# BSMarker Production Deployment Guide

## Prerequisites

- Docker 20.10+ with BuildKit support
- Docker Compose 1.29+
- Root/sudo access on production server
- Domain pointed to server IP (bsmarker.utia.cas.cz)
- Ports 80 and 443 open in firewall

## Quick Start

```bash
# 1. Clone repository
git clone <repo-url>
cd BSMarker

# 2. Configure environment
cp .env.example .env.production
nano .env.production  # Edit with your settings

# 3. Setup SSL certificates (first time only)
sudo ./scripts/setup-ssl.sh

# 4. Build and deploy
./scripts/deploy-prod.sh --build
```

## Optimized Build Process

### Build Performance Improvements

The optimized build process includes:

1. **BuildKit Cache Mounts**: Persistent npm/pip caches across builds
2. **Multi-stage Builds**: Separate deps/build/runtime stages
3. **Parallel Builds**: Frontend, backend, and nginx build simultaneously
4. **Layer Optimization**: Dependency layers cached independently
5. **.dockerignore**: Reduced build context size

### Build Commands

```bash
# Standard optimized build (with cache)
./scripts/build-prod-optimized.sh

# Force rebuild without cache
./scripts/build-prod-optimized.sh --no-cache

# Pull latest base images
./scripts/build-prod-optimized.sh --pull

# Combined
./scripts/build-prod-optimized.sh --no-cache --pull
```

### Expected Build Times

**First build** (no cache):
- Frontend: ~3-5 minutes
- Backend: ~2-3 minutes
- Nginx: ~30 seconds
- **Total: ~5-8 minutes**

**Incremental build** (with cache):
- Frontend: ~30-60 seconds (if only code changed)
- Backend: ~20-40 seconds (if only code changed)
- Nginx: ~10 seconds
- **Total: ~1-2 minutes**

## SSL Certificate Setup

### Initial Setup

```bash
# Run as root/sudo
sudo ./scripts/setup-ssl.sh
```

This will:
1. Create certificate directories
2. Start temporary nginx for ACME challenge
3. Request certificates from Let's Encrypt
4. Setup auto-renewal cron job
5. Clean up temporary containers

### Manual Renewal

```bash
./scripts/renew-ssl.sh
```

### Auto-renewal

Certificates are automatically renewed monthly via cron.
Check renewal logs: `tail -f certbot/logs/renewal.log`

## Deployment

### Full Deployment (Build + Deploy)

```bash
./scripts/deploy-prod.sh --build
```

### Deploy Existing Images

```bash
./scripts/deploy-prod.sh
```

### Restart Services Only

```bash
./scripts/deploy-prod.sh --restart-only
```

## Deployment Process

The deployment script performs:

1. **Environment Check**: Validates .env.production
2. **Build** (if --build flag): Parallel image builds
3. **Health Check**: Ensures existing services are healthy
4. **Rolling Update**: Zero-downtime deployment
5. **Verification**: Tests all services after deployment

## Environment Configuration

### Required Variables (.env.production)

```bash
# Database
DB_USER=bsmarker
DB_PASSWORD=<strong-password>
DB_NAME=bsmarker

# MinIO
MINIO_ACCESS_KEY=<access-key>
MINIO_SECRET_KEY=<secret-key>

# Backend
SECRET_KEY=<random-secret-key>
CORS_ORIGINS=["https://bsmarker.utia.cas.cz"]

# Deployment
VERSION=latest  # Or specific version tag
```

### Generate Secrets

```bash
# Secret key
openssl rand -hex 32

# MinIO keys
openssl rand -base64 20
```

## Monitoring & Maintenance

### View Logs

```bash
# All services
docker-compose -f docker-compose.prod.yml logs -f

# Specific service
docker-compose -f docker-compose.prod.yml logs -f backend

# Last 100 lines
docker-compose -f docker-compose.prod.yml logs --tail=100
```

### Service Status

```bash
# Running services
docker-compose -f docker-compose.prod.yml ps

# Resource usage
docker stats --no-stream
```

### Health Checks

```bash
# Overall health
curl https://bsmarker.utia.cas.cz/health

# Backend API
curl https://bsmarker.utia.cas.cz/api/v1/health

# Check specific service
docker-compose -f docker-compose.prod.yml exec backend python -c "import urllib.request; print(urllib.request.urlopen('http://localhost:8000/health').read())"
```

## Troubleshooting

### Connection Refused Error

**Symptoms**: `ERR_CONNECTION_REFUSED` when accessing https://bsmarker.utia.cas.cz

**Possible Causes & Solutions**:

1. **SSL Certificates Missing**
   ```bash
   # Check if certificates exist
   ls -la certbot/conf/live/bsmarker.utia.cas.cz/

   # If missing, generate them
   sudo ./scripts/setup-ssl.sh
   ```

2. **Nginx Not Running**
   ```bash
   # Check nginx status
   docker-compose -f docker-compose.prod.yml ps nginx

   # View nginx logs
   docker-compose -f docker-compose.prod.yml logs nginx

   # Restart nginx
   docker-compose -f docker-compose.prod.yml restart nginx
   ```

3. **Port 443 Not Open**
   ```bash
   # Check if port is listening
   netstat -tlnp | grep :443

   # Check firewall (Ubuntu/Debian)
   sudo ufw status
   sudo ufw allow 443/tcp

   # Check firewall (CentOS/RHEL)
   sudo firewall-cmd --list-all
   sudo firewall-cmd --permanent --add-port=443/tcp
   sudo firewall-cmd --reload
   ```

4. **Docker Network Issues**
   ```bash
   # Recreate networks
   docker-compose -f docker-compose.prod.yml down
   docker network prune -f
   docker-compose -f docker-compose.prod.yml up -d
   ```

### Slow Build Times

**Solutions**:

1. **Enable BuildKit** (should be automatic)
   ```bash
   export DOCKER_BUILDKIT=1
   export COMPOSE_DOCKER_CLI_BUILD=1
   ```

2. **Clean Old Build Cache**
   ```bash
   docker builder prune -a -f
   ```

3. **Use Optimized Build Script**
   ```bash
   ./scripts/build-prod-optimized.sh
   ```

### Container Exits Unexpectedly

```bash
# Check container logs
docker-compose -f docker-compose.prod.yml logs <service-name>

# Check container status
docker inspect <container-name>

# Restart specific service
docker-compose -f docker-compose.prod.yml restart <service-name>
```

### Database Connection Issues

```bash
# Check database is healthy
docker-compose -f docker-compose.prod.yml exec postgres pg_isready -U bsmarker

# Check database logs
docker-compose -f docker-compose.prod.yml logs postgres

# Connect to database
docker-compose -f docker-compose.prod.yml exec postgres psql -U bsmarker -d bsmarker
```

## Performance Optimization

### Docker Resource Limits

Edit `docker-compose.prod.yml` to adjust resource limits:

```yaml
deploy:
  resources:
    limits:
      cpus: '2'
      memory: 2G
```

### Build Cache Management

```bash
# View build cache
docker system df

# Prune old cache (keep last 7 days)
docker builder prune -a --filter "until=168h" -f

# Prune all cache
docker builder prune -a -f
```

### Image Size Optimization

Current optimized sizes:
- Frontend: ~50MB (nginx + static files)
- Backend: ~400MB (Python + dependencies)
- Nginx: ~25MB

## Backup & Recovery

### Database Backup

Automatic daily backups via backup service in docker-compose.prod.yml

```bash
# Manual backup
docker-compose -f docker-compose.prod.yml exec postgres pg_dump -U bsmarker bsmarker > backup-$(date +%Y%m%d).sql

# Restore from backup
docker-compose -f docker-compose.prod.yml exec -T postgres psql -U bsmarker bsmarker < backup.sql
```

### Volume Backup

```bash
# Backup all volumes
docker run --rm \
  -v bsmarker_postgres_data:/data \
  -v $(pwd)/backups:/backup \
  alpine tar czf /backup/postgres-$(date +%Y%m%d).tar.gz /data
```

## Security Best Practices

1. **Keep secrets secure**: Never commit .env.production
2. **Update regularly**: `docker-compose pull` before deploying
3. **Monitor logs**: Check for suspicious activity
4. **SSL renewal**: Automated, but verify monthly
5. **Firewall rules**: Only expose necessary ports
6. **Resource limits**: Prevent DoS via resource exhaustion

## Continuous Deployment

### CI/CD Pipeline Example

```yaml
# .github/workflows/deploy.yml
name: Deploy to Production

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Deploy to production
        run: |
          ssh user@bsmarker.utia.cas.cz "cd /path/to/BSMarker && \
            git pull && \
            ./scripts/deploy-prod.sh --build"
```

## Monitoring Checklist

- [ ] All containers running and healthy
- [ ] No error logs in last 24 hours
- [ ] SSL certificate valid and not expiring soon
- [ ] Database backups working
- [ ] Disk space > 20% free
- [ ] Memory usage < 80%
- [ ] CPU usage reasonable
- [ ] Response times < 500ms

## Support & Resources

- **Documentation**: See CLAUDE.md for architecture details
- **Logs**: Check docker-compose logs for issues
- **Health endpoint**: https://bsmarker.utia.cas.cz/health
- **API docs**: https://bsmarker.utia.cas.cz/api/docs

## Version History

- **v1.0.0** (2025-01-08): Initial optimized deployment system
  - Multi-stage Docker builds with BuildKit
  - Parallel build process
  - SSL automation
  - Zero-downtime deployment
