"""Room management router."""

import json

from fastapi import APIRouter, Depends, HTTPException, Query

from database import get_db
from models.schemas import (
    AgentMeetingCreate,
    AgentMeetingResponse,
    DirectiveCreate,
    HumanMessageCreate,
    MeetingMessageResponse,
    RoomCreate,
    RoomJoin,
    RoomResponse,
)
from services.room_service import create_room, join_room, get_room, update_room_status
from services.orchestrator_service import MeetingOrchestrator, get_orchestrator

router = APIRouter(prefix="/api/rooms", tags=["rooms"])


@router.post("", response_model=RoomResponse)
async def create_room_endpoint(body: RoomCreate, db=Depends(get_db)):
    result = await create_room(
        db=db,
        context=body.context.value,
        host_name=body.host_name,
        title=body.title,
        context_metadata=body.context_metadata,
    )
    return result


@router.post("/join")
async def join_room_endpoint(body: RoomJoin, db=Depends(get_db)):
    try:
        result = await join_room(db, body.code, body.name, body.type)
        return result
    except ValueError as e:
        raise HTTPException(404, str(e))


@router.get("/{code}", response_model=RoomResponse)
async def get_room_endpoint(code: str, db=Depends(get_db)):
    room = await get_room(db, code)
    if not room:
        raise HTTPException(404, "Room not found")
    return RoomResponse(
        room_id=room["id"],
        code=room["code"],
        session_id=room["session_id"],
        status=room["status"],
        host_name=room["host_name"],
        created_at=room["created_at"],
        participants=[
            {"name": p["name"], "type": p["participant_type"]}
            for p in room.get("participants", [])
        ],
    )


@router.post("/{code}/start")
async def start_recording(code: str, db=Depends(get_db)):
    try:
        result = await update_room_status(db, code, "recording")
        return result
    except ValueError as e:
        raise HTTPException(404, str(e))


@router.post("/{code}/stop")
async def stop_recording(code: str, db=Depends(get_db)):
    try:
        result = await update_room_status(db, code, "processing")
        return result
    except ValueError as e:
        raise HTTPException(404, str(e))


# --- Agent Meeting endpoints ---


@router.post("/meeting", response_model=AgentMeetingResponse)
async def create_agent_meeting(body: AgentMeetingCreate, db=Depends(get_db)):
    """Create an agent meeting room."""
    from services.room_service import create_agent_meeting_room
    result = await create_agent_meeting_room(
        db=db,
        topic=body.topic,
        host_name=body.host_name,
        agents=[a.model_dump() for a in body.agents],
        task_description=body.task_description,
        cooldown_seconds=body.cooldown_seconds,
        max_rounds=body.max_rounds,
        title=body.title,
    )
    return result


@router.get("/{code}/meeting", response_model=AgentMeetingResponse)
async def get_agent_meeting(code: str, db=Depends(get_db)):
    """Get agent meeting details."""
    room = await get_room(db, code)
    if not room:
        raise HTTPException(404, "Room not found")
    if room.get("mode") != "agent_meeting":
        raise HTTPException(400, "Room is not an agent meeting")

    config = room.get("meeting_config", "{}")
    if isinstance(config, str):
        config = json.loads(config)

    return AgentMeetingResponse(
        room_id=room["id"],
        code=room["code"],
        session_id=room["session_id"],
        status=room["status"],
        host_name=room["host_name"],
        topic=config.get("topic", ""),
        agents=config.get("agents", []),
        created_at=room["created_at"],
    )


@router.post("/{code}/meeting/start")
async def start_agent_meeting(code: str, db=Depends(get_db)):
    """Start the agent meeting orchestrator."""
    room = await get_room(db, code)
    if not room:
        raise HTTPException(404, "Room not found")
    if room.get("mode") != "agent_meeting":
        raise HTTPException(400, "Room is not an agent meeting")
    if room["status"] != "waiting":
        raise HTTPException(400, f"Meeting cannot start from status '{room['status']}'")

    config = room.get("meeting_config", "{}")
    if isinstance(config, str):
        config = json.loads(config)

    orchestrator = MeetingOrchestrator(
        room_id=room["id"],
        room_code=code,
        session_id=room["session_id"],
        topic=config.get("topic", ""),
        task_description=config.get("task_description", ""),
        agents=config.get("agents", []),
        cooldown_seconds=config.get("cooldown_seconds", 3.0),
        max_rounds=config.get("max_rounds", 20),
        host_name=room["host_name"],
    )

    # Use a standalone DB connection for the background task
    from database import get_db_connection
    bg_db = await get_db_connection()
    await orchestrator.start(bg_db)

    return {"status": "started", "code": code}


@router.post("/{code}/meeting/stop")
async def stop_agent_meeting(code: str, db=Depends(get_db)):
    """Stop the agent meeting."""
    orchestrator = get_orchestrator(code)
    if not orchestrator:
        raise HTTPException(404, "No active meeting found for this room")

    from database import get_db_connection
    bg_db = await get_db_connection()
    await orchestrator.stop(bg_db)
    return {"status": "stopped", "code": code}


@router.post("/{code}/meeting/pause")
async def pause_agent_meeting(code: str):
    """Pause the agent meeting."""
    orchestrator = get_orchestrator(code)
    if not orchestrator:
        raise HTTPException(404, "No active meeting found for this room")
    if orchestrator.status != "active":
        raise HTTPException(400, f"Cannot pause meeting in status '{orchestrator.status}'")

    orchestrator.pause()
    return {"status": "paused", "code": code}


@router.post("/{code}/meeting/resume")
async def resume_agent_meeting(code: str):
    """Resume a paused agent meeting."""
    orchestrator = get_orchestrator(code)
    if not orchestrator:
        raise HTTPException(404, "No active meeting found for this room")
    if orchestrator.status != "paused":
        raise HTTPException(400, f"Cannot resume meeting in status '{orchestrator.status}'")

    orchestrator.resume()
    return {"status": "active", "code": code}


@router.post("/{code}/meeting/directive")
async def send_directive(code: str, body: DirectiveCreate, db=Depends(get_db)):
    """Send a directive to the agent meeting."""
    orchestrator = get_orchestrator(code)
    if not orchestrator:
        raise HTTPException(404, "No active meeting found for this room")
    if orchestrator.status not in ("active", "paused"):
        raise HTTPException(400, "Meeting is not running")

    await orchestrator.add_directive(body.text, body.from_name, db=db)
    return {"status": "directive_sent"}


@router.post("/{code}/meeting/message")
async def send_human_message(code: str, body: HumanMessageCreate, db=Depends(get_db)):
    """Send a human message into the agent meeting conversation."""
    orchestrator = get_orchestrator(code)
    if not orchestrator:
        raise HTTPException(404, "No active meeting found for this room")
    if orchestrator.status not in ("active", "paused"):
        raise HTTPException(400, "Meeting is not running")

    orchestrator.add_human_message(body.text, body.from_name)
    return {"status": "message_queued"}


@router.get("/{code}/meeting/messages", response_model=list[MeetingMessageResponse])
async def get_meeting_messages(
    code: str,
    after_sequence: int = Query(default=0, ge=0),
    db=Depends(get_db),
):
    """Get meeting messages, optionally after a specific sequence number."""
    room = await get_room(db, code)
    if not room:
        raise HTTPException(404, "Room not found")

    cursor = await db.execute(
        """SELECT * FROM meeting_messages
        WHERE room_id = ? AND sequence_number > ?
        ORDER BY sequence_number ASC""",
        (room["id"], after_sequence),
    )
    rows = await cursor.fetchall()
    return [dict(r) for r in rows]


@router.get("/{code}/meeting/state")
async def get_meeting_state(code: str):
    """Get the current orchestrator state."""
    orchestrator = get_orchestrator(code)
    if not orchestrator:
        raise HTTPException(404, "No active meeting found for this room")
    return orchestrator.get_state()
