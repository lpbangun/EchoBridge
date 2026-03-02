"""WebSocket stream manager for live transcript broadcasting."""

import asyncio
import logging
import time
import uuid
from collections import deque
from dataclasses import dataclass

from fastapi import WebSocket

logger = logging.getLogger(__name__)


@dataclass
class ConnectionInfo:
    """Metadata for a WebSocket connection."""

    name: str | None = None
    participant_type: str = "human"
    agent_name: str | None = None


class StreamManager:
    """Manages WebSocket connections for rooms and sessions."""

    def __init__(self):
        self.rooms: dict[str, dict[WebSocket, ConnectionInfo]] = {}
        self._buffers: dict[str, deque] = {}
        self._buffer_last_write: dict[str, float] = {}
        self._global_sequence: int = 0
        self._heartbeat_task: asyncio.Task | None = None

    async def subscribe(
        self, room_key: str, ws: WebSocket, info: ConnectionInfo | None = None
    ):
        """Add a WebSocket to a room's broadcast list."""
        if room_key not in self.rooms:
            self.rooms[room_key] = {}
        if room_key not in self._buffers:
            self._buffers[room_key] = deque(maxlen=100)
        self.rooms[room_key][ws] = info or ConnectionInfo()

    async def broadcast(self, room_key: str, message: dict):
        """Send a message to all subscribers of a room."""
        if room_key not in self.rooms:
            return

        # Assign global sequence number (copy to avoid mutating caller's dict)
        self._global_sequence += 1
        stamped = {**message, "_seq": self._global_sequence}

        # Buffer the stamped message
        if room_key not in self._buffers:
            self._buffers[room_key] = deque(maxlen=100)
        self._buffers[room_key].append(stamped)
        self._buffer_last_write[room_key] = time.time()

        dead = set()
        for ws in self.rooms[room_key]:
            try:
                await ws.send_json(stamped)
            except Exception:
                dead.add(ws)
        for ws in dead:
            self.rooms[room_key].pop(ws, None)

    def get_messages_since(self, room_key: str, sequence: int) -> list[dict]:
        """Return buffered messages after the given sequence number."""
        buf = self._buffers.get(room_key)
        if not buf:
            return []
        return [msg for msg in buf if msg.get("_seq", 0) > sequence]

    async def unsubscribe(self, room_key: str, ws: WebSocket):
        """Remove a WebSocket from a room's broadcast list."""
        if room_key in self.rooms:
            self.rooms[room_key].pop(ws, None)
            if not self.rooms[room_key]:
                del self.rooms[room_key]
                # Keep buffer around — don't clean it up with the room,
                # it may be needed for reconnecting clients.

    def get_subscriber_count(self, room_key: str) -> int:
        """Get the number of subscribers for a room."""
        return len(self.rooms.get(room_key, {}))

    def get_connection_info(self, room_key: str, ws: WebSocket) -> ConnectionInfo | None:
        """Get metadata for a specific connection."""
        return self.rooms.get(room_key, {}).get(ws)

    async def kick_agent(self, room_key: str, agent_name: str, db):
        """Kick an agent: persist to DB and close their WebSocket."""
        kick_id = str(uuid.uuid4())
        await db.execute(
            "INSERT OR IGNORE INTO kicked_agents (id, room_key, agent_name) VALUES (?, ?, ?)",
            (kick_id, room_key, agent_name),
        )
        await db.commit()

        ws = self.get_agent_websocket(room_key, agent_name)
        if ws:
            try:
                await ws.close(code=4003, reason="kicked")
            except Exception:
                pass

    async def is_kicked(self, room_key: str, agent_name: str, db) -> bool:
        """Check if an agent has been kicked from a room."""
        cursor = await db.execute(
            "SELECT 1 FROM kicked_agents WHERE room_key = ? AND agent_name = ?",
            (room_key, agent_name),
        )
        row = await cursor.fetchone()
        return row is not None

    def get_agent_websocket(self, room_key: str, agent_name: str) -> WebSocket | None:
        """Find a connected agent's WebSocket by name."""
        if room_key not in self.rooms:
            return None
        for ws, info in self.rooms[room_key].items():
            if info.agent_name == agent_name:
                return ws
        return None

    async def _heartbeat_loop(self):
        """Send ping to all connections every 30 seconds, cleaning up dead ones."""
        while True:
            await asyncio.sleep(30)
            try:
                for room_key in list(self.rooms.keys()):
                    dead = set()
                    for ws in list(self.rooms.get(room_key, {}).keys()):
                        try:
                            await ws.send_json({"type": "ping", "ts": time.time()})
                        except Exception:
                            dead.add(ws)
                    for ws in dead:
                        self.rooms.get(room_key, {}).pop(ws, None)
                    # Clean up empty rooms
                    if room_key in self.rooms and not self.rooms[room_key]:
                        del self.rooms[room_key]

                # Clean up stale buffers for rooms that no longer exist
                stale_threshold = time.time() - 300  # 5 minutes
                stale_keys = [
                    key
                    for key in list(self._buffers.keys())
                    if key not in self.rooms
                    and self._buffer_last_write.get(key, 0) < stale_threshold
                ]
                for key in stale_keys:
                    del self._buffers[key]
                    self._buffer_last_write.pop(key, None)
            except Exception:
                logger.exception("Unexpected error in heartbeat loop")

    def start_heartbeat(self):
        """Start the heartbeat background task."""
        if self._heartbeat_task is None or self._heartbeat_task.done():
            self._heartbeat_task = asyncio.create_task(self._heartbeat_loop())

    def stop_heartbeat(self):
        """Stop the heartbeat background task."""
        if self._heartbeat_task and not self._heartbeat_task.done():
            self._heartbeat_task.cancel()
            self._heartbeat_task = None


# Singleton
stream_manager = StreamManager()
