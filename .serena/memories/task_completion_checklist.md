# BSMarker Task Completion Checklist

## When a Development Task is Completed

### Code Quality Checks
- [ ] **Backend Linting**: `sudo docker exec bsmarker_backend_1 python -m pylint app/`
- [ ] **Backend Formatting**: `sudo docker exec bsmarker_backend_1 python -m black app/ --check`
- [ ] **Type Checking**: `sudo docker exec bsmarker_backend_1 python -m mypy app/`
- [ ] **Backend Tests**: `sudo docker exec bsmarker_backend_1 python -m pytest`

### Frontend Quality Checks
- [ ] **Frontend Build**: `sudo docker-compose -f docker-compose.prod.yml build frontend`
- [ ] **TypeScript Compilation**: Check for TS errors in build output
- [ ] **ESLint**: Run linting in development environment

### Integration Testing
- [ ] **Service Health**: `sudo docker ps --format "table {{.Names}}\t{{.Status}}"`
- [ ] **API Health**: `curl -k https://localhost/api/v1/health`
- [ ] **Database Connection**: Test with sample query
- [ ] **MinIO Connectivity**: Verify file upload/download works
- [ ] **Celery Workers**: `sudo docker exec bsmarker_celery-worker_1 celery -A app.core.celery_app inspect ping`

### Security Checks
- [ ] **No Hardcoded Secrets**: Verify environment variables are used
- [ ] **Input Validation**: Check Pydantic schemas and frontend validation
- [ ] **SQL Injection Prevention**: Verify SQLAlchemy ORM usage
- [ ] **CORS Configuration**: Ensure proper origin restrictions
- [ ] **Authentication**: Test protected endpoints

### Performance Verification
- [ ] **Memory Usage**: Monitor Docker container resource usage
- [ ] **Response Times**: Check API endpoint performance
- [ ] **Spectrogram Generation**: Test with various audio file sizes
- [ ] **Database Queries**: Check for N+1 queries or missing indexes

### Documentation Updates
- [ ] **API Documentation**: Update if endpoints changed
- [ ] **Code Comments**: Add docstrings for new functions/classes
- [ ] **Memory Files**: Update project memories if architecture changes
- [ ] **Error Handling**: Document new error scenarios

### Deployment Verification
- [ ] **Docker Compose**: Ensure prod configuration is updated
- [ ] **Environment Variables**: Verify all required settings are documented
- [ ] **SSL Certificates**: Check if nginx config needs updates
- [ ] **Backup Strategy**: Ensure new data is included in backups

### Final Steps
- [ ] **Git Commit**: Use conventional commit messages
- [ ] **Pull Request**: Create PR with proper description
- [ ] **Code Review**: Address reviewer feedback
- [ ] **Production Deployment**: Deploy to production environment
- [ ] **Smoke Testing**: Basic functionality test in production

## Emergency Rollback Plan
1. **Immediate**: `sudo docker-compose -f docker-compose.prod.yml down`
2. **Restore**: Checkout previous working commit
3. **Rebuild**: `sudo docker-compose -f docker-compose.prod.yml up --build -d`
4. **Verify**: Check all services are healthy
5. **Investigate**: Analyze logs to identify the issue
