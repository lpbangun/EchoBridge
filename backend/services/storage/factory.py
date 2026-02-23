"""Factory for creating the appropriate storage backend."""

from services.storage.base import StorageBackend
from services.storage.local import LocalStorage
from services.storage.s3 import S3Storage


def get_storage_backend(settings) -> StorageBackend:
    """Return an S3 backend if cloud is configured, otherwise local no-op."""
    if settings.cloud_storage_enabled and settings.s3_bucket_name:
        return S3Storage(settings)
    return LocalStorage()
