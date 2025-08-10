from io import BytesIO
from minio import Minio
from minio.error import S3Error
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
            except S3Error as e:
                print(f"Error creating bucket {bucket}: {e}")
    
    def upload_file(self, bucket_name: str, object_name: str, data: bytes, content_type: str = "application/octet-stream"):
        try:
            self.client.put_object(
                bucket_name,
                object_name,
                BytesIO(data),
                length=len(data),
                content_type=content_type
            )
            return True
        except S3Error as e:
            print(f"Error uploading file: {e}")
            return False
    
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