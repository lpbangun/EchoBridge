"""WebSocket stream manager for live transcript broadcasting."""

from fastapi import WebSocket


class StreamManager:
    """Manages WebSocket connections for rooms and sessions."""

    def __init__(self):
        self.rooms: dict[str, set[WebSocket]] = {}

    async def subscribe(self, room_key: str, ws: WebSocket):
        """Add a WebSocket to a room's broadcast list."""
        if room_key not in self.rooms:
            self.rooms[room_key] = set()
        self.rooms[room_key].add(ws)

    async def broadcast(self, room_key: str, message: dict):
        """Send a message to all subscribers of a room."""
        if room_key not in self.rooms:
            return
        dead = set()
        for ws in self.rooms[room_key]:
            try:
                await ws.send_json(message)
            except Exception:
                dead.add(ws)
        self.rooms[room_key] -= dead

    async def unsubscribe(self, room_key: str, ws: WebSocket):
        """Remove a WebSocket from a room's broadcast list."""
        if room_key in self.rooms:
            self.rooms[room_key].discard(ws)
            if not self.rooms[room_key]:
                del self.rooms[room_key]

    def get_subscriber_count(self, room_key: str) -> int:
        """Get the number of subscribers for a room."""
        return len(self.rooms.get(room_key, set()))


# Singleton
stream_manager = StreamManager()
