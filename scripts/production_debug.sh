#!/bin/bash
# Production debugging script for BSMarker upload issues
# Run this on the production server

set -e

echo "=================================="
echo "BSMarker Production Debug Script"
echo "=================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if we're in the right directory
if [ ! -f "docker-compose.prod.yml" ]; then
    echo -e "${RED}Error: docker-compose.prod.yml not found${NC}"
    echo "Please run this script from the BSMarker root directory on the production server"
    exit 1
fi

echo -e "${YELLOW}Step 1: Checking container status...${NC}"
docker-compose -f docker-compose.prod.yml ps

echo ""
echo -e "${YELLOW}Step 2: Getting backend logs (last 100 lines with errors)...${NC}"
docker-compose -f docker-compose.prod.yml logs --tail=100 backend 2>&1 | grep -A2 -B2 -E "(ERROR|Exception|Failed|500|MinIO)" || echo "No errors found in recent logs"

echo ""
echo -e "${YELLOW}Step 3: Testing MinIO connectivity from backend...${NC}"
docker-compose -f docker-compose.prod.yml exec -T backend python3 << 'EOF'
import os
import sys
from minio import Minio
from io import BytesIO

print("Testing MinIO connection...")
print(f"MINIO_ENDPOINT: {os.getenv('MINIO_ENDPOINT', 'Not set')}")
print(f"MINIO_ACCESS_KEY: {os.getenv('MINIO_ACCESS_KEY', 'Not set')[:4]}...")
print(f"MINIO_BUCKET_RECORDINGS: {os.getenv('MINIO_BUCKET_RECORDINGS', 'recordings')}")

try:
    endpoint = os.getenv('MINIO_ENDPOINT', 'minio:9000')
    access_key = os.getenv('MINIO_ACCESS_KEY', 'minioadmin')
    secret_key = os.getenv('MINIO_SECRET_KEY', 'minioadmin')
    
    client = Minio(
        endpoint,
        access_key=access_key,
        secret_key=secret_key,
        secure=False
    )
    
    # List buckets
    buckets = list(client.list_buckets())
    print(f"✅ Connected! Found {len(buckets)} buckets:")
    for bucket in buckets:
        print(f"  - {bucket.name}")
    
    # Check/create required buckets
    for bucket_name in ['recordings', 'spectrograms']:
        if not client.bucket_exists(bucket_name):
            client.make_bucket(bucket_name)
            print(f"✅ Created bucket: {bucket_name}")
        else:
            print(f"✅ Bucket exists: {bucket_name}")
    
    # Test upload
    test_data = b"Test from production debug script"
    test_file = "test/debug_test.txt"
    client.put_object(
        'recordings',
        test_file,
        BytesIO(test_data),
        len(test_data),
        content_type='text/plain'
    )
    print(f"✅ Test upload successful: {test_file}")
    
    # Cleanup
    client.remove_object('recordings', test_file)
    print("✅ Test cleanup successful")
    
except Exception as e:
    print(f"❌ MinIO test failed: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)
EOF

if [ $? -ne 0 ]; then
    echo -e "${RED}MinIO connection test failed!${NC}"
    
    echo ""
    echo -e "${YELLOW}Step 3b: Checking MinIO container directly...${NC}"
    docker-compose -f docker-compose.prod.yml exec -T minio sh -c "ls -la /data/"
    
    echo ""
    echo -e "${YELLOW}Step 3c: MinIO logs...${NC}"
    docker-compose -f docker-compose.prod.yml logs --tail=20 minio
else
    echo -e "${GREEN}MinIO connection test passed!${NC}"
fi

echo ""
echo -e "${YELLOW}Step 4: Checking environment variables...${NC}"
docker-compose -f docker-compose.prod.yml exec -T backend sh -c 'env | grep -E "(MINIO|DATABASE|REDIS|CORS)" | sed -E "s/(PASSWORD|SECRET|KEY|TOKEN)=.*/\1=***/g"'

echo ""
echo -e "${YELLOW}Step 5: Testing API endpoint directly...${NC}"
# Get a test token (you may need to adjust credentials)
TOKEN=$(docker-compose -f docker-compose.prod.yml exec -T backend python3 << 'EOF' 2>/dev/null
from app.core.security import create_access_token
print(create_access_token({"sub": "admin@bsmarker.com"}))
EOF
)

if [ ! -z "$TOKEN" ]; then
    echo "Testing /api/v1/health endpoint..."
    docker-compose -f docker-compose.prod.yml exec -T backend curl -s -H "Authorization: Bearer $TOKEN" http://localhost:8000/api/v1/health || echo "Health check failed"
else
    echo "Could not generate test token"
fi

echo ""
echo -e "${YELLOW}Step 6: Checking disk space...${NC}"
df -h | grep -E "(Filesystem|/var/lib/docker|minio_data)"

echo ""
echo -e "${YELLOW}Step 7: Quick fix attempt...${NC}"
echo "Restarting backend with fresh connection..."
docker-compose -f docker-compose.prod.yml restart backend

echo ""
echo -e "${GREEN}Debug complete!${NC}"
echo ""
echo "Next steps:"
echo "1. If MinIO test failed, check .env.production file"
echo "2. If disk space is low, clean up old data"
echo "3. Monitor logs: docker-compose -f docker-compose.prod.yml logs -f backend"
echo "4. Try uploading a file again after backend restart"