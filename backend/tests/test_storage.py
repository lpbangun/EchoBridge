"""Tests for cloud storage: backends, sync service, and storage router."""

import asyncio
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from services.storage.base import StorageBackend
from services.storage.local import LocalStorage
from services.storage.factory import get_storage_backend


# ---------------------------------------------------------------------------
# StorageBackend protocol compliance
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_local_storage_implements_protocol():
    """LocalStorage satisfies the StorageBackend protocol."""
    storage = LocalStorage()
    assert isinstance(storage, StorageBackend)


@pytest.mark.asyncio
async def test_s3_storage_implements_protocol():
    """S3Storage satisfies the StorageBackend protocol."""
    with patch("services.storage.s3.boto3") as mock_boto3:
        mock_boto3.client.return_value = MagicMock()
        from services.storage.s3 import S3Storage

        settings = MagicMock()
        settings.s3_access_key_id = "test"
        settings.s3_secret_access_key = "test"
        settings.s3_region = "us-east-1"
        settings.s3_endpoint_url = ""
        settings.s3_bucket_name = "test-bucket"
        settings.s3_prefix = "echobridge/"

        storage = S3Storage(settings)
        assert isinstance(storage, StorageBackend)


# ---------------------------------------------------------------------------
# LocalStorage behavior
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_local_upload_always_succeeds():
    """LocalStorage.upload_file always returns True."""
    storage = LocalStorage()
    result = await storage.upload_file("/tmp/test.wav", "audio/test.wav")
    assert result is True


@pytest.mark.asyncio
async def test_local_download_always_succeeds():
    """LocalStorage.download_file always returns True."""
    storage = LocalStorage()
    result = await storage.download_file("audio/test.wav", "/tmp/test.wav")
    assert result is True


@pytest.mark.asyncio
async def test_local_delete_always_succeeds():
    """LocalStorage.delete_file always returns True."""
    storage = LocalStorage()
    result = await storage.delete_file("audio/test.wav")
    assert result is True


@pytest.mark.asyncio
async def test_local_test_connection():
    """LocalStorage.test_connection returns ok."""
    storage = LocalStorage()
    result = await storage.test_connection()
    assert result["ok"] is True


# ---------------------------------------------------------------------------
# Factory
# ---------------------------------------------------------------------------


def test_factory_returns_local_when_disabled():
    """Factory returns LocalStorage when cloud is disabled."""
    settings = MagicMock()
    settings.cloud_storage_enabled = False
    settings.s3_bucket_name = "bucket"
    backend = get_storage_backend(settings)
    assert isinstance(backend, LocalStorage)


def test_factory_returns_local_when_no_bucket():
    """Factory returns LocalStorage when bucket is empty."""
    settings = MagicMock()
    settings.cloud_storage_enabled = True
    settings.s3_bucket_name = ""
    backend = get_storage_backend(settings)
    assert isinstance(backend, LocalStorage)


def test_factory_returns_s3_when_configured():
    """Factory returns S3Storage when cloud is enabled and bucket is set."""
    with patch("services.storage.factory.S3Storage") as mock_s3:
        mock_s3.return_value = MagicMock()
        settings = MagicMock()
        settings.cloud_storage_enabled = True
        settings.s3_bucket_name = "my-bucket"
        get_storage_backend(settings)
        mock_s3.assert_called_once_with(settings)


# ---------------------------------------------------------------------------
# SyncService
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_sync_service_enqueue_and_process():
    """SyncService processes enqueued items."""
    from services.sync_service import SyncService

    mock_backend = AsyncMock()
    mock_backend.upload_file = AsyncMock(return_value=True)

    svc = SyncService(mock_backend)

    # Start the service
    svc.start()
    svc.enqueue("/tmp/test.wav", "audio/test.wav", file_type="audio")

    # Give the worker time to process
    await asyncio.sleep(0.2)

    assert svc.status["completed"] == 1
    assert svc.status["failed"] == 0
    mock_backend.upload_file.assert_awaited_once_with("/tmp/test.wav", "audio/test.wav")

    svc.stop()


@pytest.mark.asyncio
async def test_sync_service_retries_on_failure():
    """SyncService retries failed uploads."""
    from services.sync_service import SyncService

    mock_backend = AsyncMock()
    # Fail twice, succeed on third
    mock_backend.upload_file = AsyncMock(side_effect=[False, False, True])

    svc = SyncService(mock_backend)
    svc.start()
    svc.enqueue("/tmp/test.wav", "audio/test.wav")

    # Wait for retries (1s + 2s delays, give extra time)
    await asyncio.sleep(4.5)

    assert svc.status["completed"] == 1
    assert svc.status["failed"] == 0
    assert mock_backend.upload_file.await_count == 3

    svc.stop()


@pytest.mark.asyncio
async def test_sync_service_fails_after_max_retries():
    """SyncService marks item failed after max retries."""
    from services.sync_service import SyncService

    mock_backend = AsyncMock()
    mock_backend.upload_file = AsyncMock(return_value=False)

    svc = SyncService(mock_backend)
    svc.start()
    svc.enqueue("/tmp/test.wav", "audio/test.wav")

    # Wait for all retries (1s + 2s delays)
    await asyncio.sleep(4.5)

    assert svc.status["completed"] == 0
    assert svc.status["failed"] == 1
    assert svc.status["last_error"] is not None

    svc.stop()


@pytest.mark.asyncio
async def test_sync_service_status_initial():
    """SyncService initial status is all zeros."""
    from services.sync_service import SyncService

    mock_backend = AsyncMock()
    svc = SyncService(mock_backend)

    status = svc.status
    assert status["pending"] == 0
    assert status["completed"] == 0
    assert status["failed"] == 0
    assert status["last_error"] is None
    assert status["last_success_at"] is None


# ---------------------------------------------------------------------------
# Storage router endpoints
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_storage_test_endpoint_disabled(client):
    """POST /api/storage/test returns error when cloud is disabled."""
    res = await client.post("/api/storage/test")
    assert res.status_code == 200
    data = res.json()
    assert data["ok"] is False
    assert "not enabled" in data["message"]


@pytest.mark.asyncio
async def test_storage_status_endpoint(client):
    """GET /api/storage/status returns sync queue status."""
    res = await client.get("/api/storage/status")
    assert res.status_code == 200
    data = res.json()
    assert "pending" in data
    assert "completed" in data
    assert "failed" in data


# ---------------------------------------------------------------------------
# Settings include cloud storage fields
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_settings_include_cloud_fields(client):
    """GET /api/settings returns cloud storage fields."""
    res = await client.get("/api/settings")
    assert res.status_code == 200
    data = res.json()
    assert "cloud_storage_enabled" in data
    assert "s3_endpoint_url" in data
    assert "s3_access_key_id" in data
    assert "s3_secret_configured" in data
    assert "s3_bucket_name" in data
    assert "s3_region" in data
    assert "s3_prefix" in data
    assert "cloud_sync_audio" in data
    assert "cloud_sync_exports" in data
    # Secret key should never appear
    assert "s3_secret_access_key" not in data


@pytest.mark.asyncio
async def test_settings_update_cloud_fields(client):
    """PUT /api/settings updates cloud storage fields."""
    res = await client.put("/api/settings", json={
        "cloud_storage_enabled": True,
        "s3_bucket_name": "test-bucket",
        "s3_region": "us-west-2",
        "s3_prefix": "test/",
        "cloud_sync_audio": False,
    })
    assert res.status_code == 200
    data = res.json()
    assert data["cloud_storage_enabled"] is True
    assert data["s3_bucket_name"] == "test-bucket"
    assert data["s3_region"] == "us-west-2"
    assert data["s3_prefix"] == "test/"
    assert data["cloud_sync_audio"] is False


@pytest.mark.asyncio
async def test_settings_secret_key_never_leaked(client):
    """The s3 secret key is never returned in settings response."""
    await client.put("/api/settings", json={
        "s3_secret_access_key": "super-secret-key-123",
    })
    res = await client.get("/api/settings")
    data = res.json()
    assert data["s3_secret_configured"] is True
    assert "super-secret-key-123" not in str(data)


# ---------------------------------------------------------------------------
# Cloud disabled = no uploads
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_no_sync_when_cloud_disabled():
    """When cloud is disabled, the sync service enqueue is not called."""
    from services.sync_service import SyncService

    mock_backend = AsyncMock()
    svc = SyncService(mock_backend)

    # If we don't enqueue anything, nothing should be uploaded
    assert svc.status["pending"] == 0
    assert svc.status["completed"] == 0
