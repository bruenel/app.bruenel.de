import os
import hmac
import hashlib
import time
from typing import Optional, Dict, Any

# Unified Storage Configuration (Supports Local S3 Emulation + Cloudflare R2 / AWS S3 / MinIO)
STORAGE_PROVIDER = os.environ.get("STORAGE_PROVIDER", "local_s3")  # local_s3 | s3 | r2 | minio
S3_BUCKET = os.environ.get("S3_BUCKET", "bruenel-erp-media")
S3_REGION = os.environ.get("S3_REGION", "eu-central-1")
S3_ENDPOINT_URL = os.environ.get("S3_ENDPOINT_URL", "")  # e.g. https://<account>.r2.cloudflarestorage.com or http://localhost:9000
S3_ACCESS_KEY = os.environ.get("S3_ACCESS_KEY", "")
S3_SECRET_KEY = os.environ.get("S3_SECRET_KEY", "")
SIGNING_SECRET = os.environ.get("JWT_SECRET_KEY", "super_secret_bruenel_os_key_change_me")

if os.environ.get("VERCEL"):
    LOCAL_STORAGE_ROOT = "/tmp/bruenel_s3_storage"
else:
    LOCAL_STORAGE_ROOT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "secure_vault", "s3_buckets")

os.makedirs(LOCAL_STORAGE_ROOT, exist_ok=True)


def get_local_file_path(storage_key: str) -> str:
    safe_key = storage_key.lstrip("/").replace("..", "")
    full_path = os.path.join(LOCAL_STORAGE_ROOT, safe_key)
    os.makedirs(os.path.dirname(full_path), exist_ok=True)
    return full_path


def generate_presigned_token(storage_key: str, expires_in: int = 3600) -> str:
    exp = int(time.time()) + expires_in
    msg = f"{storage_key}:{exp}".encode("utf-8")
    sig = hmac.new(SIGNING_SECRET.encode("utf-8"), msg, hashlib.sha256).hexdigest()
    return f"{exp}.{sig}"


def verify_presigned_token(storage_key: str, token: str) -> bool:
    try:
        exp_str, sig = token.split(".", 1)
        if int(exp_str) < int(time.time()):
            return False
        msg = f"{storage_key}:{exp_str}".encode("utf-8")
        expected = hmac.new(SIGNING_SECRET.encode("utf-8"), msg, hashlib.sha256).hexdigest()
        return hmac.compare_digest(sig, expected)
    except Exception:
        return False


def create_presigned_upload(storage_key: str, mime_type: str, expires_in: int = 3600) -> Dict[str, Any]:
    """
    Generate a Pre-Signed PUT URL for direct file/video upload.
    If AWS S3 / Cloudflare R2 / MinIO credentials and boto3 are configured, returns a native S3 presigned URL.
    Otherwise, returns a local S3-compatible presigned endpoint URL so offline localhost works out-of-the-box.
    """
    if STORAGE_PROVIDER in ("s3", "r2", "minio") and S3_ACCESS_KEY and S3_SECRET_KEY:
        try:
            import boto3
            from botocore.config import Config
            s3_client = boto3.client(
                "s3",
                region_name=S3_REGION,
                endpoint_url=S3_ENDPOINT_URL or None,
                aws_access_key_id=S3_ACCESS_KEY,
                aws_secret_access_key=S3_SECRET_KEY,
                config=Config(signature_version="s3v4"),
            )
            upload_url = s3_client.generate_presigned_url(
                ClientMethod="put_object",
                Params={"Bucket": S3_BUCKET, "Key": storage_key, "ContentType": mime_type},
                ExpiresIn=expires_in,
            )
            return {
                "provider": STORAGE_PROVIDER,
                "upload_url": upload_url,
                "method": "PUT",
                "storage_key": storage_key,
            }
        except Exception as e:
            print(f"S3 presign fallback to local_s3: {e}")

    token = generate_presigned_token(storage_key, expires_in)
    return {
        "provider": "local_s3",
        "upload_url": f"/api/v1/media/upload-stream/{storage_key}?token={token}",
        "method": "PUT",
        "storage_key": storage_key,
    }


def create_presigned_download(storage_key: str, expires_in: int = 7200) -> str:
    if STORAGE_PROVIDER in ("s3", "r2", "minio") and S3_ACCESS_KEY and S3_SECRET_KEY:
        try:
            import boto3
            from botocore.config import Config
            s3_client = boto3.client(
                "s3",
                region_name=S3_REGION,
                endpoint_url=S3_ENDPOINT_URL or None,
                aws_access_key_id=S3_ACCESS_KEY,
                aws_secret_access_key=S3_SECRET_KEY,
                config=Config(signature_version="s3v4"),
            )
            return s3_client.generate_presigned_url(
                ClientMethod="get_object",
                Params={"Bucket": S3_BUCKET, "Key": storage_key},
                ExpiresIn=expires_in,
            )
        except Exception:
            pass

    token = generate_presigned_token(storage_key, expires_in)
    return f"/api/v1/media/stream/{storage_key}?token={token}"
