"""Local storage backend — no-op pass-through for when cloud is disabled."""

import os


class LocalStorage:
    """No-op storage that always succeeds. Used when cloud sync is off."""

    async def upload_file(self, local_path: str, remote_key: str) -> bool:
        return True

    async def download_file(self, remote_key: str, local_path: str) -> bool:
        return True

    async def delete_file(self, remote_key: str) -> bool:
        return True

    async def file_exists(self, remote_key: str) -> bool:
        return os.path.exists(remote_key)

    async def test_connection(self) -> dict:
        return {"ok": True, "message": "Local storage (no cloud configured)"}
