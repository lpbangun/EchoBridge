"""S3-compatible storage backend using boto3."""

import asyncio
import os
from concurrent.futures import ThreadPoolExecutor
from functools import partial

import boto3
from botocore.exceptions import ClientError, NoCredentialsError, EndpointConnectionError


_executor = ThreadPoolExecutor(max_workers=2)


class S3Storage:
    """S3-compatible storage backend. Supports AWS S3, Cloudflare R2, Backblaze B2, MinIO."""

    def __init__(self, settings) -> None:
        kwargs: dict = {
            "aws_access_key_id": settings.s3_access_key_id,
            "aws_secret_access_key": settings.s3_secret_access_key,
            "region_name": settings.s3_region if settings.s3_region != "auto" else None,
        }
        if settings.s3_endpoint_url:
            kwargs["endpoint_url"] = settings.s3_endpoint_url
        self._client = boto3.client("s3", **kwargs)
        self._bucket = settings.s3_bucket_name
        self._prefix = settings.s3_prefix.rstrip("/") + "/" if settings.s3_prefix else ""

    def _key(self, remote_key: str) -> str:
        """Prepend the configured prefix to the remote key."""
        return f"{self._prefix}{remote_key}"

    async def _run(self, fn, *args, **kwargs):
        """Run a blocking boto3 call in an executor."""
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(_executor, partial(fn, *args, **kwargs))

    async def upload_file(self, local_path: str, remote_key: str) -> bool:
        """Upload a local file to S3."""
        try:
            await self._run(
                self._client.upload_file,
                local_path,
                self._bucket,
                self._key(remote_key),
            )
            return True
        except (ClientError, FileNotFoundError, OSError):
            return False

    async def download_file(self, remote_key: str, local_path: str) -> bool:
        """Download a file from S3 to a local path."""
        try:
            os.makedirs(os.path.dirname(local_path), exist_ok=True)
            await self._run(
                self._client.download_file,
                self._bucket,
                self._key(remote_key),
                local_path,
            )
            return True
        except (ClientError, OSError):
            return False

    async def delete_file(self, remote_key: str) -> bool:
        """Delete a file from S3."""
        try:
            await self._run(
                self._client.delete_object,
                Bucket=self._bucket,
                Key=self._key(remote_key),
            )
            return True
        except ClientError:
            return False

    async def file_exists(self, remote_key: str) -> bool:
        """Check if a file exists in S3."""
        try:
            await self._run(
                self._client.head_object,
                Bucket=self._bucket,
                Key=self._key(remote_key),
            )
            return True
        except ClientError:
            return False

    async def test_connection(self) -> dict:
        """Test the S3 connection by listing up to 1 key."""
        try:
            await self._run(
                self._client.list_objects_v2,
                Bucket=self._bucket,
                MaxKeys=1,
            )
            return {"ok": True, "message": f"Connected to bucket '{self._bucket}'"}
        except NoCredentialsError:
            return {"ok": False, "message": "Missing or invalid credentials"}
        except EndpointConnectionError as e:
            return {"ok": False, "message": f"Cannot reach endpoint: {e}"}
        except ClientError as e:
            code = e.response.get("Error", {}).get("Code", "Unknown")
            msg = e.response.get("Error", {}).get("Message", str(e))
            return {"ok": False, "message": f"S3 error ({code}): {msg}"}
        except Exception as e:
            return {"ok": False, "message": f"Connection failed: {e}"}
