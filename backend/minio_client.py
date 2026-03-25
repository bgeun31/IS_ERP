import io
from typing import Optional

from minio import Minio
from minio.error import S3Error

from config import settings

_client = Minio(
    f"{settings.MINIO_HOST}:{settings.MINIO_PORT}",
    access_key=settings.MINIO_ACCESS_KEY,
    secret_key=settings.MINIO_SECRET_KEY,
    secure=settings.MINIO_SECURE,
)


def ensure_bucket() -> None:
    try:
        if not _client.bucket_exists(settings.MINIO_BUCKET):
            _client.make_bucket(settings.MINIO_BUCKET)
            print(f"[MinIO] 버킷 생성: {settings.MINIO_BUCKET}")
        else:
            print(f"[MinIO] 버킷 확인: {settings.MINIO_BUCKET}")
    except S3Error as e:
        print(f"[MinIO] 버킷 오류: {e}")


def upload_file(object_key: str, data: bytes, content_type: str = "text/plain") -> bool:
    try:
        _client.put_object(
            settings.MINIO_BUCKET,
            object_key,
            io.BytesIO(data),
            length=len(data),
            content_type=content_type,
        )
        return True
    except S3Error as e:
        print(f"[MinIO] 업로드 오류: {e}")
        return False


def download_file(object_key: str) -> Optional[bytes]:
    try:
        response = _client.get_object(settings.MINIO_BUCKET, object_key)
        data = response.read()
        response.close()
        response.release_conn()
        return data
    except S3Error:
        return None


def delete_file(object_key: str) -> bool:
    try:
        _client.remove_object(settings.MINIO_BUCKET, object_key)
        return True
    except S3Error as e:
        print(f"[MinIO] 삭제 오류: {e}")
        return False
