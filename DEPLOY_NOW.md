# 🚀 Deploy BSMarker to Production NOW

This is your step-by-step guide to deploy the optimized BSMarker to production.

---

## ⚡ FASTEST WAY (One Command)

SSH to your production server and run:

```bash
cd /path/to/BSMarker
git pull origin dev
./scripts/complete-setup.sh
```

This interactive script will:
1. Check prerequisites
2. Generate secrets
3. Setup SSL certificates
4. Build optimized images (1-2 min with cache!)
5. Deploy with zero downtime

**Done!** Your site will be live at https://bsmarker.utia.cas.cz

---

## 📋 MANUAL DEPLOYMENT (If you prefer step-by-step)

### Step 1: Connect to Production Server

```bash
ssh cvat@bsmarker.utia.cas.cz
```

### Step 2: Pull Latest Code

```bash
cd /path/to/BSMarker
git pull origin dev
```

You should see:
```
✓ 16 files changed
✓ New deployment scripts
✓ Optimized Dockerfiles
```

### Step 3: Run Pre-Deployment Check

```bash
./scripts/pre-deployment-check.sh
```

This will verify:
- ✅ Docker versions
- ✅ Disk space
- ✅ Ports availability
- ✅ SSL certificates
- ✅ Environment files

**Fix any errors before continuing!**

### Step 4: Setup Environment (If not exists)

```bash
# Generate secure secrets
./scripts/generate-secrets.sh

# Copy template
cp .env.production.template .env.production

# Edit with generated secrets
nano .env.production
```

**Important:** Update these values:
- `DB_PASSWORD` - Use generated value
- `SECRET_KEY` - Use generated value
- `MINIO_ACCESS_KEY` - Use generated value
- `MINIO_SECRET_KEY` - Use generated value

### Step 5: Setup SSL Certificates (First time only)

```bash
sudo ./scripts/setup-ssl.sh
```

This will:
1. Start temporary nginx
2. Request Let's Encrypt certificate
3. Setup auto-renewal cron job
4. Verify certificate

**Takes ~1-2 minutes**

### Step 6: Build Optimized Images

```bash
./scripts/build-prod-optimized.sh
```

**Expected time:**
- First build: ~5-8 minutes
- Incremental: ~1-2 minutes (if you rebuild)

You'll see:
```
🚀 Starting parallel build process...
Building backend... ████████░░
Building frontend... ████████░░
Building nginx... ████████░░
✓ Build completed successfully!
```

### Step 7: Deploy to Production

```bash
./scripts/deploy-prod.sh
```

This will:
1. Stop old containers gracefully
2. Start new containers
3. Wait for health checks
4. Verify all services are running

**Takes ~2-3 minutes**

### Step 8: Verify Deployment

```bash
# Check all services are running
docker-compose -f docker-compose.prod.yml ps

# Test health endpoint
curl https://bsmarker.utia.cas.cz/health

# Test API
curl https://bsmarker.utia.cas.cz/api/v1/health

# View logs
docker-compose -f docker-compose.prod.yml logs -f
```

**Expected response:**
```json
{"status": "healthy"}
```

---

## 🔍 TROUBLESHOOTING

### Problem: "Connection Refused"

**Symptoms:**
```
curl: (7) Failed to connect to bsmarker.utia.cas.cz port 443
```

**Solutions:**

1. **Check SSL certificates:**
   ```bash
   ls -la certbot/conf/live/bsmarker.utia.cas.cz/
   ```
   If missing: `sudo ./scripts/setup-ssl.sh`

2. **Check nginx is running:**
   ```bash
   docker-compose -f docker-compose.prod.yml ps nginx
   docker-compose -f docker-compose.prod.yml logs nginx
   ```

3. **Check firewall:**
   ```bash
   sudo ufw status
   sudo ufw allow 80/tcp
   sudo ufw allow 443/tcp
   ```

4. **Restart nginx:**
   ```bash
   docker-compose -f docker-compose.prod.yml restart nginx
   ```

### Problem: "Build Too Slow"

**Symptoms:**
Build takes 10+ minutes

**Solutions:**

1. **Use optimized script:**
   ```bash
   ./scripts/build-prod-optimized.sh
   ```

2. **Clean old cache:**
   ```bash
   docker system prune -a
   docker builder prune -a
   ```

3. **Check disk space:**
   ```bash
   df -h
   ```

### Problem: "Container Won't Start"

**Symptoms:**
Container exits immediately after starting

**Solutions:**

1. **Check logs:**
   ```bash
   docker-compose -f docker-compose.prod.yml logs [service-name]
   ```

2. **Check environment:**
   ```bash
   cat .env.production | grep -v "PASSWORD\|SECRET\|KEY"
   ```

3. **Verify database:**
   ```bash
   docker-compose -f docker-compose.prod.yml exec postgres pg_isready
   ```

---

## 📊 MONITORING AFTER DEPLOYMENT

### Check Service Status
```bash
docker-compose -f docker-compose.prod.yml ps
```

Expected output:
```
NAME                  STATUS                 PORTS
bsmarker_nginx_1      Up (healthy)          0.0.0.0:80->80/tcp, 0.0.0.0:443->443/tcp
bsmarker_backend_1    Up (healthy)
bsmarker_frontend_1   Up (healthy)
bsmarker_postgres_1   Up (healthy)
bsmarker_redis_1      Up (healthy)
bsmarker_minio_1      Up (healthy)
```

### View Real-time Logs
```bash
# All services
docker-compose -f docker-compose.prod.yml logs -f

# Specific service
docker-compose -f docker-compose.prod.yml logs -f backend

# Last 100 lines
docker-compose -f docker-compose.prod.yml logs --tail=100
```

### Check Resource Usage
```bash
docker stats --no-stream
```

Expected:
```
NAME                CPU %    MEM USAGE / LIMIT    MEM %
bsmarker_backend    5-10%    500MB / 2GB          25%
bsmarker_frontend   1-2%     50MB / 512MB         10%
bsmarker_nginx      1-2%     20MB / 512MB         4%
```

### Test Endpoints
```bash
# Health check
curl https://bsmarker.utia.cas.cz/health

# API health
curl https://bsmarker.utia.cas.cz/api/v1/health

# Frontend
curl -I https://bsmarker.utia.cas.cz

# API docs
curl https://bsmarker.utia.cas.cz/api/docs
```

---

## 🎯 QUICK COMMANDS REFERENCE

```bash
# Restart service
docker-compose -f docker-compose.prod.yml restart [service]

# Stop all services
docker-compose -f docker-compose.prod.yml down

# Start all services
docker-compose -f docker-compose.prod.yml up -d

# Rebuild and redeploy
./scripts/deploy-prod.sh --build

# Restart only (no rebuild)
./scripts/deploy-prod.sh --restart-only

# View specific service logs
docker-compose -f docker-compose.prod.yml logs -f backend

# Execute command in container
docker-compose -f docker-compose.prod.yml exec backend [command]

# Check database
docker-compose -f docker-compose.prod.yml exec postgres psql -U bsmarker

# Renew SSL certificate
./scripts/renew-ssl.sh
```

---

## ✅ POST-DEPLOYMENT CHECKLIST

- [ ] All services show "Up (healthy)" status
- [ ] Health endpoint returns 200 OK
- [ ] Can access https://bsmarker.utia.cas.cz
- [ ] Can login to application
- [ ] Can upload audio file
- [ ] Can view spectrograms
- [ ] SSL certificate is valid (green padlock)
- [ ] No errors in logs
- [ ] Resource usage is reasonable

---

## 🚨 IF SOMETHING GOES WRONG

### Rollback to Previous Version

```bash
# Stop current deployment
docker-compose -f docker-compose.prod.yml down

# Checkout previous version
git log --oneline -5  # Find previous commit
git checkout [previous-commit-hash]

# Rebuild and deploy old version
./scripts/deploy-prod.sh --build
```

### Get Help

1. **Check logs:**
   ```bash
   docker-compose -f docker-compose.prod.yml logs --tail=100
   ```

2. **Check container status:**
   ```bash
   docker-compose -f docker-compose.prod.yml ps
   docker inspect [container-name]
   ```

3. **Check disk space:**
   ```bash
   df -h
   docker system df
   ```

4. **Check network:**
   ```bash
   docker network ls
   docker network inspect bsmarker_internal
   ```

---

## 📚 ADDITIONAL RESOURCES

- **Quick Start Guide:** [QUICKSTART.md](QUICKSTART.md)
- **Full Deployment Guide:** [DEPLOYMENT.md](DEPLOYMENT.md)
- **Build Optimization Details:** [BUILD_OPTIMIZATION_SUMMARY.md](BUILD_OPTIMIZATION_SUMMARY.md)
- **Architecture Info:** [CLAUDE.md](CLAUDE.md)

---

## 🎉 SUCCESS!

If all checks pass, your optimized BSMarker is now live!

**🌐 Your application:** https://bsmarker.utia.cas.cz

**⚡ Build times:** 83-90% faster (1-2 min vs 10-15 min)

**🔒 SSL:** Automated with Let's Encrypt

**📊 Zero downtime:** Rolling updates enabled

**🚀 Deployment:** Fully automated

---

**Questions?** Check [DEPLOYMENT.md](DEPLOYMENT.md) for detailed troubleshooting.

**Last Updated:** 2025-10-08
