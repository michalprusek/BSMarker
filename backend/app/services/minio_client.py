from io import BytesIO
import time
from minio import Minio
from minio.error import S3Error
from urllib3.exceptions import MaxRetryError, ResponseError
from app.core.config import settings

class MinioClient:
    def __init__(self):
        self.client = Minio(
            settings.MINIO_ENDPOINT,
            access_key=settings.MINIO_ACCESS_KEY,
            secret_key=settings.MINIO_SECRET_KEY,
            secure=settings.MINIO_SECURE
        )
        self._ensure_buckets()
    
    def _ensure_buckets(self):
        buckets = [settings.MINIO_BUCKET_RECORDINGS, settings.MINIO_BUCKET_SPECTROGRAMS]
        for bucket in buckets:
            try:
                if not self.client.bucket_exists(bucket):
                    self.client.make_bucket(bucket)
                    print(f"Created bucket: {bucket}")
                else:
                    print(f"Bucket already exists: {bucket}")
            except S3Error as e:
                print(f"Error creating bucket {bucket}: {e}")
            except Exception as e:
                print(f"Unexpected error with bucket {bucket}: {e}")
    
    def upload_file(self, bucket_name: str, object_name: str, data: bytes, content_type: str = "application/octet-stream", max_retries: int = 3):
        for attempt in range(max_retries):
            try:
                # Ensure bucket exists before uploading
                if not self.client.bucket_exists(bucket_name):
                    self.client.make_bucket(bucket_name)
                    print(f"Created missing bucket during upload: {bucket_name}")
                
                self.client.put_object(
                    bucket_name,
                    object_name,
                    BytesIO(data),
                    length=len(data),
                    content_type=content_type
                )
                print(f"Successfully uploaded {object_name} to {bucket_name}")
                return True
            except (MaxRetryError, ResponseError) as e:
                print(f"Connection error on attempt {attempt + 1}/{max_retries} for {object_name}: {e}")
                if attempt < max_retries - 1:
                    time.sleep(2 ** attempt)  # Exponential backoff
                    # Try to recreate the client connection
                    try:
                        self.client = Minio(
                            settings.MINIO_ENDPOINT,
                            access_key=settings.MINIO_ACCESS_KEY,
                            secret_key=settings.MINIO_SECRET_KEY,
                            secure=settings.MINIO_SECURE
                        )
                        print(f"Recreated MinIO client for retry {attempt + 2}")
                    except Exception as reconnect_error:
                        print(f"Failed to recreate MinIO client: {reconnect_error}")
                else:
                    raise
            except S3Error as e:
                print(f"S3 Error uploading file {object_name}: {e}")
                raise
            except Exception as e:
                print(f"Unexpected error uploading file {object_name}: {e}")
                raise
    
    def download_file(self, bucket_name: str, object_name: str) -> bytes:
        try:
            response = self.client.get_object(bucket_name, object_name)
            data = response.read()
            response.close()
            response.release_conn()
            return data
        except S3Error as e:
            print(f"Error downloading file: {e}")
            return None
    
    def delete_file(self, bucket_name: str, object_name: str):
        try:
            self.client.remove_object(bucket_name, object_name)
            return True
        except S3Error as e:
            print(f"Error deleting file: {e}")
            return False
    
    def get_file(self, bucket_name: str, object_name: str):
        """Get file as a stream for use with StreamingResponse."""
        try:
            response = self.client.get_object(bucket_name, object_name)
            return BytesIO(response.read())
        except S3Error as e:
            print(f"Error getting file: {e}")
            raise
    
    def get_presigned_url(self, bucket_name: str, object_name: str, expiry: int = 3600):
        try:
            return self.client.presigned_get_object(bucket_name, object_name, expires=expiry)
        except S3Error as e:
            print(f"Error generating presigned URL: {e}")
            return None

minio_client = MinioClient()