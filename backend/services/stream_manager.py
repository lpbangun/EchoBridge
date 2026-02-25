"""WebSocket stream manager for live transcript broadcasting."""

from dataclasses import dataclass
from fastapi import WebSocket


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
        self.kicked_agents: dict[str, set[str]] = {}

    async def subscribe(
        self, room_key: str, ws: WebSocket, info: ConnectionInfo | None = None
    ):
        """Add a WebSocket to a room's broadcast list."""
        if room_key not in self.rooms:
            self.rooms[room_key] = {}
        self.rooms[room_key][ws] = info or ConnectionInfo()

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
        for ws in dead:
            self.rooms[room_key].pop(ws, None)

    async def unsubscribe(self, room_key: str, ws: WebSocket):
        """Remove a WebSocket from a room's broadcast list."""
        if room_key in self.rooms:
            self.rooms[room_key].pop(ws, None)
            if not self.rooms[room_key]:
                del self.rooms[room_key]
                self.kicked_agents.pop(room_key, None)

    def get_subscriber_count(self, room_key: str) -> int:
        """Get the number of subscribers for a room."""
        return len(self.rooms.get(room_key, {}))

    def get_connection_info(self, room_key: str, ws: WebSocket) -> ConnectionInfo | None:
        """Get metadata for a specific connection."""
        return self.rooms.get(room_key, {}).get(ws)

    async def kick_agent(self, room_key: str, agent_name: str):
        """Kick an agent: add to kicked set and close their WebSocket."""
        if room_key not in self.kicked_agents:
            self.kicked_agents[room_key] = set()
        self.kicked_agents[room_key].add(agent_name)

        ws = self.get_agent_websocket(room_key, agent_name)
        if ws:
            try:
                await ws.close(code=4003, reason="kicked")
            except Exception:
                pass

    def is_kicked(self, room_key: str, agent_name: str) -> bool:
        """Check if an agent has been kicked from a room."""
        return agent_name in self.kicked_agents.get(room_key, set())

    def get_agent_websocket(self, room_key: str, agent_name: str) -> WebSocket | None:
        """Find a connected agent's WebSocket by name."""
        if room_key not in self.rooms:
            return None
        for ws, info in self.rooms[room_key].items():
            if info.agent_name == agent_name:
                return ws
        return None


# Singleton
stream_manager = StreamManager()
