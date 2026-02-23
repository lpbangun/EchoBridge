"""Storage router — cloud storage connection test and sync status."""

from fastapi import APIRouter

from config import settings
from services.storage.s3 import S3Storage
from services.sync_service import get_sync_service

router = APIRouter(prefix="/api/storage", tags=["storage"])


@router.post("/test")
async def test_connection():
    """Test S3 connection with the currently saved credentials."""
    if not settings.cloud_storage_enabled:
        return {"ok": False, "message": "Cloud storage is not enabled"}
    if not settings.s3_bucket_name:
        return {"ok": False, "message": "No bucket name configured"}
    if not settings.s3_access_key_id or not settings.s3_secret_access_key:
        return {"ok": False, "message": "Missing S3 credentials"}

    backend = S3Storage(settings)
    return await backend.test_connection()


@router.get("/status")
async def get_status():
    """Return the current sync queue status."""
    sync = get_sync_service()
    if sync is None:
        return {
            "pending": 0,
            "completed": 0,
            "failed": 0,
            "last_error": None,
            "last_success_at": None,
        }
    return sync.status
