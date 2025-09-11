#!/bin/bash

echo "BSMarker Production Debugging Script"
echo "====================================="
echo ""

# Check if running with docker-compose
if [ -f "docker-compose.prod.yml" ]; then
    echo "1. Checking container status:"
    docker-compose -f docker-compose.prod.yml ps
    echo ""

    echo "2. Backend container logs (last 50 lines):"
    docker-compose -f docker-compose.prod.yml logs --tail=50 backend
    echo ""

    echo "3. Testing MinIO connection from backend container:"
    docker-compose -f docker-compose.prod.yml exec backend python3 -c "
import os
from minio import Minio
from minio.error import S3Error

endpoint = os.getenv('MINIO_ENDPOINT', 'minio:9000')
access_key = os.getenv('MINIO_ACCESS_KEY')
secret_key = os.getenv('MINIO_SECRET_KEY')

print(f'Endpoint: {endpoint}')
print(f'Access key present: {bool(access_key)}')
print(f'Secret key present: {bool(secret_key)}')

try:
    client = Minio(endpoint, access_key=access_key, secret_key=secret_key, secure=False)
    buckets = list(client.list_buckets())
    print(f'Successfully connected! Found {len(buckets)} buckets')
    for b in buckets:
        print(f'  - {b.name}')
except Exception as e:
    print(f'Connection failed: {e}')
"
    echo ""

    echo "4. Checking backend environment variables:"
    docker-compose -f docker-compose.prod.yml exec backend env | grep -E "(MINIO|DATABASE|REDIS)" | sed 's/=.*PASSWORD.*/=***HIDDEN***/'
    echo ""

    echo "5. Testing backend API health:"
    curl -s http://localhost/api/v1/health || echo "Health check failed"
    echo ""

    echo "6. Checking disk space:"
    df -h | grep -E "(Filesystem|docker|/var|/home)"
    echo ""

    echo "7. Memory usage:"
    free -h
    echo ""

    echo "8. MinIO container logs (last 30 lines):"
    docker-compose -f docker-compose.prod.yml logs --tail=30 minio
else
    echo "Error: docker-compose.prod.yml not found. Please run this script from the BSMarker root directory."
    exit 1
fi
