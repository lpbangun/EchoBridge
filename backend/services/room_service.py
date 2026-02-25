"""Room service — create, join, manage meeting rooms."""

import json
import uuid
from datetime import datetime, timezone


def generate_room_code(title: str | None) -> str:
    """Generate room code: {PREFIX}-{MMDD}."""
    date = datetime.now(timezone.utc).strftime("%m%d")
    if title and len(title) >= 4:
        prefix = title[:4].upper().replace(" ", "X")
    else:
        prefix = uuid.uuid4().hex[:4].upper()
    return f"{prefix}-{date}"


async def create_room(
    db,
    context: str,
    host_name: str,
    title: str | None = None,
    context_metadata: dict | None = None,
) -> dict:
    """Create a room and its associated session."""
    room_id = str(uuid.uuid4())
    session_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    metadata_json = json.dumps(context_metadata or {})

    # Generate unique room code
    code = generate_room_code(title)
    # Check for collision
    cursor = await db.execute("SELECT id FROM rooms WHERE code = ?", (code,))
    if await cursor.fetchone():
        code = f"{code}{uuid.uuid4().hex[:1].upper()}"

    # Create room first without session_id (circular FK)
    await db.execute(
        """INSERT INTO rooms (id, code, session_id, host_name, created_at)
        VALUES (?, ?, NULL, ?, ?)""",
        (room_id, code, host_name, now),
    )

    # Create session referencing room
    await db.execute(
        """INSERT INTO sessions (id, title, context, context_metadata, room_id, host_name, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)""",
        (session_id, title, context, metadata_json, room_id, host_name, now),
    )

    # Now update room with session_id
    await db.execute(
        "UPDATE rooms SET session_id = ? WHERE id = ?",
        (session_id, room_id),
    )

    # Add host as participant
    participant_id = str(uuid.uuid4())
    await db.execute(
        """INSERT INTO room_participants (id, room_id, name, participant_type, connected_at)
        VALUES (?, ?, ?, 'human', ?)""",
        (participant_id, room_id, host_name, now),
    )

    await db.commit()

    return {
        "room_id": room_id,
        "code": code,
        "session_id": session_id,
        "status": "waiting",
        "host_name": host_name,
        "created_at": now,
        "participants": [{"name": host_name, "type": "human"}],
    }


async def join_room(db, code: str, name: str, participant_type: str = "human") -> dict:
    """Join an existing room."""
    cursor = await db.execute("SELECT * FROM rooms WHERE code = ?", (code,))
    room = await cursor.fetchone()
    if not room:
        raise ValueError("Room not found")

    room = dict(room)
    if room["status"] == "closed":
        raise ValueError("Room is closed")

    # Add participant
    participant_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    agent_name = name if participant_type == "agent" else None

    await db.execute(
        """INSERT INTO room_participants (id, room_id, name, participant_type, connected_at, agent_name)
        VALUES (?, ?, ?, ?, ?, ?)""",
        (participant_id, room["id"], name, participant_type, now, agent_name),
    )
    await db.commit()

    return {
        "room_id": room["id"],
        "code": code,
        "session_id": room["session_id"],
        "status": room["status"],
        "host_name": room["host_name"],
    }


async def get_room(db, code: str) -> dict | None:
    """Get room details with participants."""
    cursor = await db.execute("SELECT * FROM rooms WHERE code = ?", (code,))
    room = await cursor.fetchone()
    if not room:
        return None

    room = dict(room)

    cursor = await db.execute(
        "SELECT * FROM room_participants WHERE room_id = ?",
        (room["id"],),
    )
    participants = [dict(r) for r in await cursor.fetchall()]
    room["participants"] = participants
    return room


async def create_agent_meeting_room(
    db,
    topic: str,
    host_name: str,
    agents: list[dict],
    task_description: str = "",
    cooldown_seconds: float = 3.0,
    max_rounds: int = 20,
    title: str | None = None,
) -> dict:
    """Create an agent meeting room with its session and agent participants."""
    room_id = str(uuid.uuid4())
    session_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    effective_title = title or f"Agent Meeting: {topic[:50]}"

    meeting_config = {
        "topic": topic,
        "task_description": task_description,
        "agents": agents,
        "cooldown_seconds": cooldown_seconds,
        "max_rounds": max_rounds,
    }

    code = generate_room_code(effective_title)
    cursor = await db.execute("SELECT id FROM rooms WHERE code = ?", (code,))
    if await cursor.fetchone():
        code = f"{code}{uuid.uuid4().hex[:1].upper()}"

    # Create room
    await db.execute(
        """INSERT INTO rooms (id, code, session_id, host_name, created_at, mode, meeting_config)
        VALUES (?, ?, NULL, ?, ?, 'agent_meeting', ?)""",
        (room_id, code, host_name, now, json.dumps(meeting_config)),
    )

    # Create session
    await db.execute(
        """INSERT INTO sessions (id, title, context, context_metadata, room_id, host_name, created_at)
        VALUES (?, ?, 'working_session', ?, ?, ?, ?)""",
        (session_id, effective_title, json.dumps({"meeting_type": "agent_meeting", "topic": topic}), room_id, host_name, now),
    )

    # Link room to session
    await db.execute("UPDATE rooms SET session_id = ? WHERE id = ?", (session_id, room_id))

    # Add host as participant
    host_pid = str(uuid.uuid4())
    await db.execute(
        """INSERT INTO room_participants (id, room_id, name, participant_type, connected_at)
        VALUES (?, ?, ?, 'human', ?)""",
        (host_pid, room_id, host_name, now),
    )

    # Add agent participants
    for agent in agents:
        pid = str(uuid.uuid4())
        await db.execute(
            """INSERT INTO room_participants
            (id, room_id, name, participant_type, connected_at, persona_config, is_external)
            VALUES (?, ?, ?, 'agent', ?, ?, ?)""",
            (pid, room_id, agent["name"], now, json.dumps(agent), agent.get("type") == "external"),
        )

    await db.commit()

    return {
        "room_id": room_id,
        "code": code,
        "session_id": session_id,
        "status": "waiting",
        "host_name": host_name,
        "topic": topic,
        "agents": agents,
        "created_at": now,
    }


async def update_room_status(db, code: str, status: str) -> dict:
    """Update room status and associated session status."""
    cursor = await db.execute("SELECT * FROM rooms WHERE code = ?", (code,))
    room = await cursor.fetchone()
    if not room:
        raise ValueError("Room not found")

    room = dict(room)
    await db.execute("UPDATE rooms SET status = ? WHERE code = ?", (status, code))

    # Map room status to session status
    session_status_map = {
        "recording": "recording",
        "active": "recording",
        "processing": "processing",
        "closed": "complete",
    }
    session_status = session_status_map.get(status)
    if session_status:
        await db.execute(
            "UPDATE sessions SET status = ? WHERE id = ?",
            (session_status, room["session_id"]),
        )

    await db.commit()
    return {"code": code, "status": status}
