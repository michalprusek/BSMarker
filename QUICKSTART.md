# BSMarker Production - Quick Start Guide

## 🚀 One-Command Setup

```bash
./scripts/complete-setup.sh
```

This interactive script will:
1. ✅ Run pre-deployment checks
2. ✅ Configure environment variables
3. ✅ Setup SSL certificates
4. ✅ Build optimized Docker images
5. ✅ Deploy to production

---

## 📋 Manual Setup (Step by Step)

### Prerequisites

- Docker 20.10+
- Docker Compose 1.29+
- Root/sudo access
- Domain: your-domain.example.com

### Step 1: Pre-Deployment Check

```bash
./scripts/pre-deployment-check.sh
```

This verifies:
- Docker versions
- Disk space
- Memory
- Ports availability
- Required files

### Step 2: Generate Secrets

```bash
./scripts/generate-secrets.sh > secrets.txt
cat secrets.txt
```

Save these values - you'll need them in the next step!

### Step 3: Configure Environment

```bash
# Create production environment
cp .env.production.template .env.production

# Edit with your secrets
nano .env.production
```

Required values:
- `DB_PASSWORD` - Database password
- `SECRET_KEY` - Backend secret key (64 chars)
- `MINIO_ACCESS_KEY` - MinIO access key
- `MINIO_SECRET_KEY` - MinIO secret key

### Step 4: Setup SSL (First Time Only)

```bash
sudo ./scripts/setup-ssl.sh
```

This will:
- Request Let's Encrypt certificate
- Setup auto-renewal cron job
- Verify certificate validity

### Step 5: Build Images

```bash
./scripts/build-prod-optimized.sh
```

**Expected build times:**
- First build: ~5-8 minutes
- Incremental: ~1-2 minutes (83-90% faster!)
- Code-only changes: ~30-60 seconds

### Step 6: Deploy

```bash
./scripts/deploy-prod.sh --build
```

Or deploy without rebuilding:
```bash
./scripts/deploy-prod.sh
```

### Step 7: Verify

```bash
# Check all services are running
docker-compose -f docker-compose.prod.yml ps

# Test health endpoint
curl https://your-domain.example.com/health

# Test API
curl https://your-domain.example.com/api/v1/health

# View logs
docker-compose -f docker-compose.prod.yml logs -f
```

---

## 🔧 Common Operations

### View Logs
```bash
# All services
docker-compose -f docker-compose.prod.yml logs -f

# Specific service
docker-compose -f docker-compose.prod.yml logs -f backend

# Last 100 lines
docker-compose -f docker-compose.prod.yml logs --tail=100 backend
```

### Restart Service
```bash
docker-compose -f docker-compose.prod.yml restart backend
```

### Update Application
```bash
# Pull latest code
git pull origin main

# Rebuild and deploy
./scripts/deploy-prod.sh --build
```

### Renew SSL Certificate
```bash
./scripts/renew-ssl.sh
```

### Check Resource Usage
```bash
docker stats --no-stream
```

---

## 🆘 Troubleshooting

### Connection Refused

**Problem:** Can't access https://your-domain.example.com

**Solutions:**

1. **Check SSL certificates exist:**
   ```bash
   ls -la certbot/conf/live/your-domain.example.com/
   ```
   If missing, run: `sudo ./scripts/setup-ssl.sh`

2. **Check nginx is running:**
   ```bash
   docker-compose -f docker-compose.prod.yml ps nginx
   docker-compose -f docker-compose.prod.yml logs nginx
   ```

3. **Check firewall:**
   ```bash
   sudo ufw allow 80/tcp
   sudo ufw allow 443/tcp
   sudo ufw status
   ```

4. **Check ports are listening:**
   ```bash
   netstat -tlnp | grep ':443'
   ```

### Slow Build Times

**Problem:** Build takes 10+ minutes

**Solutions:**

1. **Use optimized build script:**
   ```bash
   ./scripts/build-prod-optimized.sh
   ```

2. **Clean old cache:**
   ```bash
   docker system prune -a
   ```

3. **Check disk space:**
   ```bash
   df -h
   ```

### Container Won't Start

**Problem:** Container exits immediately

**Solutions:**

1. **Check logs:**
   ```bash
   docker-compose -f docker-compose.prod.yml logs backend
   ```

2. **Check environment:**
   ```bash
   docker-compose -f docker-compose.prod.yml exec backend env
   ```

3. **Verify database connection:**
   ```bash
   docker-compose -f docker-compose.prod.yml exec postgres pg_isready
   ```

---

## 📊 Performance Benchmarks

### Build Time Improvements

| Scenario | Before | After | Improvement |
|----------|--------|-------|-------------|
| First build | 10-15 min | 5-8 min | 40-47% |
| Incremental | 10-15 min | 1-2 min | **83-90%** |
| Code changes | 8-12 min | 30-60 sec | **92-95%** |

### Image Size Reductions

| Image | Before | After | Reduction |
|-------|--------|-------|-----------|
| Frontend | ~200MB | ~50MB | 75% |
| Backend | ~600MB | ~400MB | 33% |

---

## 📚 Additional Resources

- **Full Deployment Guide:** [DEPLOYMENT.md](DEPLOYMENT.md)
- **Build Optimization Details:** [BUILD_OPTIMIZATION_SUMMARY.md](BUILD_OPTIMIZATION_SUMMARY.md)
- **Architecture Documentation:** [CLAUDE.md](CLAUDE.md)

---

## 🎯 Next Steps After Deployment

1. **Monitor logs for 24 hours**
   ```bash
   docker-compose -f docker-compose.prod.yml logs -f
   ```

2. **Set up monitoring** (optional)
   - Prometheus + Grafana
   - Application performance monitoring
   - Error tracking (Sentry)

3. **Configure backups**
   - Database backups (automated daily)
   - Volume backups
   - Configuration backups

4. **Setup CI/CD** (optional)
   - GitHub Actions
   - GitLab CI
   - Jenkins

---

## 🔒 Security Checklist

- [ ] `.env.production` not committed to git
- [ ] Strong passwords for all services
- [ ] SSL certificates installed and valid
- [ ] Firewall configured (only ports 80, 443 open)
- [ ] Regular updates scheduled
- [ ] Backup strategy in place
- [ ] Monitoring configured
- [ ] Log rotation configured

---

**Last Updated:** 2025-10-08
**Version:** 1.0.0

Need help? Check the full documentation in [DEPLOYMENT.md](DEPLOYMENT.md)
