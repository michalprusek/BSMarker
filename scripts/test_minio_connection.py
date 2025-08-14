#!/usr/bin/env python3
"""Test MinIO connection from backend environment"""
import os
import sys
from minio import Minio
from minio.error import S3Error

def test_minio_connection():
    """Test MinIO connectivity and bucket operations"""
    
    # Get configuration from environment
    endpoint = os.getenv("MINIO_ENDPOINT", "minio:9000")
    access_key = os.getenv("MINIO_ACCESS_KEY", "minioadmin")
    secret_key = os.getenv("MINIO_SECRET_KEY", "minioadmin")
    secure = os.getenv("MINIO_SECURE", "false").lower() == "true"
    
    print(f"Testing MinIO connection...")
    print(f"Endpoint: {endpoint}")
    print(f"Access Key: {access_key[:4]}..." if len(access_key) > 4 else access_key)
    print(f"Secure: {secure}")
    print("-" * 50)
    
    try:
        # Create MinIO client
        client = Minio(
            endpoint,
            access_key=access_key,
            secret_key=secret_key,
            secure=secure
        )
        
        # Test 1: List buckets
        print("Test 1: Listing buckets...")
        buckets = client.list_buckets()
        for bucket in buckets:
            print(f"  - {bucket.name} (created: {bucket.creation_date})")
        
        # Test 2: Check specific buckets
        print("\nTest 2: Checking required buckets...")
        required_buckets = ["recordings", "spectrograms"]
        for bucket_name in required_buckets:
            exists = client.bucket_exists(bucket_name)
            print(f"  - {bucket_name}: {'EXISTS' if exists else 'MISSING'}")
            if not exists:
                print(f"    Creating bucket {bucket_name}...")
                client.make_bucket(bucket_name)
                print(f"    Bucket {bucket_name} created successfully")
        
        # Test 3: Test upload
        print("\nTest 3: Testing file upload...")
        test_data = b"Test data for MinIO connection verification"
        test_object = "test/connection_test.txt"
        
        from io import BytesIO
        client.put_object(
            "recordings",
            test_object,
            BytesIO(test_data),
            length=len(test_data),
            content_type="text/plain"
        )
        print(f"  - Successfully uploaded test object: {test_object}")
        
        # Test 4: Test download
        print("\nTest 4: Testing file download...")
        response = client.get_object("recordings", test_object)
        downloaded_data = response.read()
        response.close()
        response.release_conn()
        
        if downloaded_data == test_data:
            print("  - Successfully downloaded and verified test object")
        else:
            print("  - ERROR: Downloaded data doesn't match uploaded data")
        
        # Test 5: Cleanup
        print("\nTest 5: Cleaning up test object...")
        client.remove_object("recordings", test_object)
        print("  - Successfully removed test object")
        
        print("\n" + "=" * 50)
        print("✅ All MinIO tests passed successfully!")
        print("=" * 50)
        return True
        
    except S3Error as e:
        print(f"\n❌ S3 Error: {e}")
        print(f"Error code: {e.code}")
        print(f"Error message: {e.message}")
        return False
    except Exception as e:
        print(f"\n❌ Unexpected error: {e}")
        print(f"Error type: {type(e).__name__}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    success = test_minio_connection()
    sys.exit(0 if success else 1)