# BSMarker Development Commands

## Production Docker Commands (Primary)

### Service Management
```bash
# Start all services in production mode
sudo docker-compose -f docker-compose.prod.yml up -d

# Stop all services
sudo docker-compose -f docker-compose.prod.yml down

# Restart specific service
sudo docker restart bsmarker_backend_1
sudo docker restart bsmarker_celery-worker_1

# View service status
sudo docker-compose -f docker-compose.prod.yml ps

# View logs
sudo docker-compose -f docker-compose.prod.yml logs -f backend
sudo docker logs bsmarker_celery-worker_1 --tail 50
```

### Backend Development in Docker
```bash
# Run tests
sudo docker exec bsmarker_backend_1 python -m pytest

# Type checking
sudo docker exec bsmarker_backend_1 python -m mypy app/

# Linting and formatting
sudo docker exec bsmarker_backend_1 python -m pylint app/
sudo docker exec bsmarker_backend_1 python -m black app/ --check

# Database operations
sudo docker exec bsmarker_backend_1 python -c "from app.db.database import engine; from app.models import *; from app.db.base import Base; Base.metadata.create_all(bind=engine)"
```

### Frontend Development
```bash
# Rebuild frontend image
sudo docker-compose -f docker-compose.prod.yml build frontend

# Restart frontend containers
sudo docker restart bsmarker_frontend_1 bsmarker_frontend_2
```

### Debugging Commands
```bash
# Check container health
sudo docker ps --format "table {{.Names}}\t{{.Status}}"

# Test services
curl -k https://localhost/health
curl -k https://localhost/api/v1/health

# Database check
sudo docker exec bsmarker_postgres_1 psql -U bsmarker -d bsmarker_db -c "\dt"

# MinIO connectivity test
sudo docker exec bsmarker_backend_1 python -c "from app.services.minio_client import minio_client; print('MinIO connected')"

# Celery worker status
sudo docker exec bsmarker_celery-worker_1 celery -A app.core.celery_app inspect ping
```

## Local Development (Alternative)

### Backend
```bash
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

### Frontend
```bash
cd frontend
npm install
npm start
```

## SSL Certificate Management
```bash
# Renew certificates (monthly cron job)
docker run --rm \
  -v /home/prusek/BSMarker/certbot/conf:/etc/letsencrypt \
  -v /home/prusek/BSMarker/certbot/www:/var/www/certbot \
  certbot/certbot renew --quiet

# Reload nginx after renewal
docker exec bsmarker_nginx_1 nginx -s reload
```
