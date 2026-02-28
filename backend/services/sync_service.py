"""Background sync service — queues local files for async cloud upload."""

import asyncio
import logging
from dataclasses import dataclass
from datetime import datetime, timezone

from services.storage.base import StorageBackend

logger = logging.getLogger(__name__)

MAX_RETRIES = 3
RETRY_DELAYS = [1, 2, 4]  # seconds


@dataclass
class SyncItem:
    local_path: str
    remote_key: str
    file_type: str  # "audio" | "export"
    retries: int = 0


@dataclass
class SyncStatus:
    pending: int = 0
    completed: int = 0
    failed: int = 0
    last_error: str | None = None
    last_success_at: str | None = None


class SyncService:
    """Processes an upload queue with retry and exponential backoff."""

    def __init__(self, backend: StorageBackend) -> None:
        self._backend = backend
        self._queue: asyncio.Queue[SyncItem] = asyncio.Queue()
        self._task: asyncio.Task | None = None
        self._status = SyncStatus()

    @property
    def status(self) -> dict:
        return {
            "pending": self._queue.qsize(),
            "completed": self._status.completed,
            "failed": self._status.failed,
            "last_error": self._status.last_error,
            "last_success_at": self._status.last_success_at,
        }

    def enqueue(self, local_path: str, remote_key: str, file_type: str = "export") -> None:
        """Add a file to the upload queue."""
        self._queue.put_nowait(SyncItem(
            local_path=local_path,
            remote_key=remote_key,
            file_type=file_type,
        ))

    async def _process_queue(self) -> None:
        """Worker loop: pull items from queue and upload with retries."""
        while True:
            item = await self._queue.get()
            success = False

            for attempt in range(MAX_RETRIES):
                try:
                    result = await self._backend.upload_file(item.local_path, item.remote_key)
                    if result:
                        self._status.completed += 1
                        self._status.last_success_at = datetime.now(timezone.utc).isoformat()
                        logger.info("Uploaded %s -> %s", item.local_path, item.remote_key)
                        success = True
                        break
                    else:
                        raise RuntimeError("upload_file returned False")
                except Exception as e:
                    delay = RETRY_DELAYS[attempt] if attempt < len(RETRY_DELAYS) else RETRY_DELAYS[-1]
                    logger.warning(
                        "Upload attempt %d/%d failed for %s: %s (retry in %ds)",
                        attempt + 1, MAX_RETRIES, item.remote_key, e, delay,
                    )
                    if attempt < MAX_RETRIES - 1:
                        await asyncio.sleep(delay)

            if not success:
                self._status.failed += 1
                self._status.last_error = f"Failed to upload {item.remote_key} after {MAX_RETRIES} retries"
                logger.error(self._status.last_error)

            self._queue.task_done()

    def start(self) -> None:
        """Start the background worker."""
        if self._task is None or self._task.done():
            self._task = asyncio.create_task(self._process_queue())
            logger.info("Sync service started")

    def stop(self) -> None:
        """Stop the background worker."""
        if self._task and not self._task.done():
            self._task.cancel()
            logger.info("Sync service stopped")


# Module-level singleton — initialized during app lifespan
_instance: SyncService | None = None


def get_sync_service() -> SyncService | None:
    return _instance


def init_sync_service(backend: StorageBackend) -> SyncService:
    global _instance
    _instance = SyncService(backend)
    return _instance
