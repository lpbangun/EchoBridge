"""Agent API router — all /api/v1/ endpoints with bearer auth."""

import json
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import PlainTextResponse

from database import get_db
from services.auth_service import verify_api_key, require_scope
from services.skill_md import find_skill_md
from services.interpret_service import (
    interpret_with_custom,
    interpret_with_lens,
    interpret_with_socket,
)
from services.chat_service import (
    add_message,
    get_conversation,
    list_conversations,
)
from services.search_service import search

router = APIRouter(prefix="/api/v1", tags=["agent-api"])

_AVAILABLE_ENDPOINTS = [
    "/api/v1/sessions",
    "/api/v1/sessions/{id}",
    "/api/v1/sessions/{id}/transcript",
    "/api/v1/sessions/{id}/interpretations",
    "/api/v1/sessions/{id}/interpret",
    "/api/v1/sessions/{id}/interpret/socket/{socket_id}",
    "/api/v1/search",
    "/api/v1/sockets",
    "/api/v1/rooms/{code}",
    "/api/v1/series",
    "/api/v1/series/{id}",
    "/api/v1/series/{id}/memory",
    "/api/v1/meetings",
    "/api/v1/meetings/{code}",
    "/api/v1/meetings/{code}/join",
    "/api/v1/meetings/{code}/start",
    "/api/v1/meetings/{code}/respond",
    "/api/v1/meetings/{code}/context",
    "/api/v1/chat/conversations",
    "/api/v1/chat/conversations/{id}",
    "/api/v1/chat/conversations/{id}/messages",
    "/api/v1/events",
    "/api/v1/sessions/{id}/agent-analyze",
    "/api/v1/wall",
    "/api/v1/wall (POST)",
    "/api/v1/wall/{post_id}/react",
    "/api/v1/ping",
    "/api/v1/skill",
]


@router.get("/ping")
async def ping(api_key=Depends(verify_api_key)):
    """Connection test — verify auth and discover available endpoints."""
    return {
        "status": "ok",
        "agent_name": api_key.get("name", "unknown"),
        "version": "1.0",
        "endpoints": _AVAILABLE_ENDPOINTS,
    }


@router.get("/skill", response_class=PlainTextResponse)
async def get_skill(api_key=Depends(verify_api_key)):
    """Return SKILL.md content so agents can self-discover EchoBridge capabilities."""
    path = find_skill_md()
    if not path:
        raise HTTPException(404, "SKILL.md not found")
    return path.read_text(encoding="utf-8")


@router.get("/sessions")
async def list_sessions(
    context: str | None = None,
    series_id: str | None = None,
    limit: int = Query(default=20, le=100),
    offset: int = Query(default=0, ge=0),
    api_key=Depends(require_scope("sessions:read")),
    db=Depends(get_db),
):
    query = "SELECT s.*, sr.name as series_name FROM sessions s LEFT JOIN series sr ON s.series_id = sr.id"
    params: list = []
    conditions = []

    if context:
        conditions.append("s.context = ?")
        params.append(context)

    if series_id:
        conditions.append("s.series_id = ?")
        params.append(series_id)

    if conditions:
        query += " WHERE " + " AND ".join(conditions)

    query += " ORDER BY s.created_at DESC LIMIT ? OFFSET ?"
    params.extend([limit, offset])

    cursor = await db.execute(query, params)
    rows = await cursor.fetchall()
    results = []
    for row in rows:
        d = dict(row)
        if isinstance(d.get("context_metadata"), str):
            d["context_metadata"] = json.loads(d["context_metadata"])
        results.append(d)
    return results


@router.get("/sessions/{session_id}")
async def get_session(
    session_id: str,
    api_key=Depends(require_scope("sessions:read")),
    db=Depends(get_db),
):
    cursor = await db.execute("SELECT * FROM sessions WHERE id = ?", (session_id,))
    row = await cursor.fetchone()
    if not row:
        raise HTTPException(404, "Session not found")
    d = dict(row)
    if isinstance(d.get("context_metadata"), str):
        d["context_metadata"] = json.loads(d["context_metadata"])
    return d


@router.get("/sessions/{session_id}/transcript")
async def get_transcript(
    session_id: str,
    api_key=Depends(require_scope("sessions:read")),
    db=Depends(get_db),
):
    cursor = await db.execute(
        "SELECT id, transcript FROM sessions WHERE id = ?", (session_id,)
    )
    row = await cursor.fetchone()
    if not row:
        raise HTTPException(404, "Session not found")
    return {"session_id": row["id"], "transcript": row["transcript"]}


@router.post("/sessions/{session_id}/interpret")
async def interpret_session(
    session_id: str,
    body: dict,
    api_key=Depends(require_scope("sessions:write")),
    db=Depends(get_db),
):
    cursor = await db.execute("SELECT * FROM sessions WHERE id = ?", (session_id,))
    row = await cursor.fetchone()
    if not row:
        raise HTTPException(404, "Session not found")

    session = dict(row)
    if not session.get("transcript"):
        raise HTTPException(400, "Session has no transcript")

    metadata = session.get("context_metadata", "{}")
    if isinstance(metadata, str):
        metadata = json.loads(metadata)

    system_prompt = body.get("system_prompt")
    model = body.get("model")
    agent_name = api_key.get("name", "agent")

    if system_prompt:
        result = await interpret_with_custom(
            session_id=session_id,
            transcript=session["transcript"],
            system_prompt=system_prompt,
            model=model,
            source_type="agent",
            source_name=agent_name,
            db=db,
        )
    else:
        lens_id = body.get("lens_id", session["context"])
        result = await interpret_with_lens(
            session_id=session_id,
            transcript=session["transcript"],
            lens_id=lens_id,
            model=model,
            context_metadata=metadata,
            source_type="agent",
            source_name=agent_name,
            db=db,
        )

    return result


@router.get("/sessions/{session_id}/interpretations")
async def list_interpretations(
    session_id: str,
    api_key=Depends(require_scope("sessions:read")),
    db=Depends(get_db),
):
    cursor = await db.execute(
        "SELECT * FROM interpretations WHERE session_id = ? ORDER BY created_at DESC",
        (session_id,),
    )
    rows = await cursor.fetchall()
    results = []
    for row in rows:
        d = dict(row)
        if isinstance(d.get("output_structured"), str):
            d["output_structured"] = json.loads(d["output_structured"])
        results.append(d)
    return results


@router.get("/sockets")
async def list_sockets(
    api_key=Depends(verify_api_key),
    db=Depends(get_db),
):
    from routers.sockets import _ensure_presets
    await _ensure_presets(db)
    cursor = await db.execute("SELECT * FROM sockets ORDER BY is_preset DESC, name ASC")
    rows = await cursor.fetchall()
    results = []
    for row in rows:
        d = dict(row)
        if isinstance(d.get("output_schema"), str):
            d["output_schema"] = json.loads(d["output_schema"])
        results.append(d)
    return results


@router.post("/sessions/{session_id}/interpret/socket/{socket_id}")
async def socket_interpret(
    session_id: str,
    socket_id: str,
    body: dict | None = None,
    api_key=Depends(require_scope("sessions:write")),
    db=Depends(get_db),
):
    cursor = await db.execute("SELECT * FROM sessions WHERE id = ?", (session_id,))
    row = await cursor.fetchone()
    if not row:
        raise HTTPException(404, "Session not found")

    session = dict(row)
    if not session.get("transcript"):
        raise HTTPException(400, "Session has no transcript")

    cursor = await db.execute("SELECT * FROM sockets WHERE id = ?", (socket_id,))
    socket_row = await cursor.fetchone()
    if not socket_row:
        raise HTTPException(404, f"Socket not found: {socket_id}")

    socket_data = dict(socket_row)
    if isinstance(socket_data.get("output_schema"), str):
        socket_data["output_schema"] = json.loads(socket_data["output_schema"])

    model = body.get("model") if body else None
    agent_name = api_key.get("name", "agent")

    result = await interpret_with_socket(
        session_id=session_id,
        transcript=session["transcript"],
        socket_data=socket_data,
        model=model,
        source_type="agent",
        source_name=agent_name,
        db=db,
    )
    return result


@router.get("/rooms/{code}")
async def get_room(
    code: str,
    api_key=Depends(require_scope("rooms:write")),
    db=Depends(get_db),
):
    from services.room_service import get_room as _get_room
    room = await _get_room(db, code)
    if not room:
        raise HTTPException(404, "Room not found")
    return room


@router.get("/series")
async def list_series(
    api_key=Depends(require_scope("sessions:read")),
    db=Depends(get_db),
):
    cursor = await db.execute(
        "SELECT id, name, description, session_count, created_at, updated_at "
        "FROM series ORDER BY updated_at DESC"
    )
    rows = await cursor.fetchall()
    return [dict(r) for r in rows]


@router.get("/series/{series_id}")
async def get_series(
    series_id: str,
    api_key=Depends(require_scope("sessions:read")),
    db=Depends(get_db),
):
    cursor = await db.execute("SELECT * FROM series WHERE id = ?", (series_id,))
    row = await cursor.fetchone()
    if not row:
        raise HTTPException(404, "Series not found")
    return dict(row)


@router.get("/series/{series_id}/memory")
async def get_series_memory(
    series_id: str,
    api_key=Depends(require_scope("sessions:read")),
    db=Depends(get_db),
):
    cursor = await db.execute("SELECT * FROM series WHERE id = ?", (series_id,))
    row = await cursor.fetchone()
    if not row:
        raise HTTPException(404, "Series not found")
    data = dict(row)
    return {
        "series_id": data["id"],
        "series_name": data["name"],
        "memory_document": data["memory_document"] or "",
        "memory_error": data.get("memory_error"),
        "updated_at": data["updated_at"],
        "session_count": data["session_count"],
    }


@router.get("/search")
async def search_endpoint(
    q: str,
    api_key=Depends(require_scope("sessions:read")),
    db=Depends(get_db),
):
    results = await search(db, q)
    return {"query": q, "results": results, "total": len(results)}


# --- Events ---


@router.get("/events")
async def list_events(
    since: str | None = None,
    context: str | None = None,
    limit: int = Query(default=50, le=200),
    api_key=Depends(require_scope("sessions:read")),
    db=Depends(get_db),
):
    """Poll for session events newer than `since` timestamp."""
    query = "SELECT * FROM session_events"
    params: list = []
    conditions = []

    if since:
        conditions.append("created_at > ?")
        params.append(since)

    if context:
        conditions.append("context = ?")
        params.append(context)

    if conditions:
        query += " WHERE " + " AND ".join(conditions)

    query += " ORDER BY created_at ASC LIMIT ?"
    params.append(limit)

    cursor = await db.execute(query, params)
    rows = await cursor.fetchall()
    events = [dict(row) for row in rows]
    return {"events": events, "count": len(events)}


# --- Agent Analyze ---


@router.post("/sessions/{session_id}/agent-analyze")
async def agent_analyze(
    session_id: str,
    body: dict | None = None,
    api_key=Depends(require_scope("sessions:write")),
    db=Depends(get_db),
):
    """Run sockets on demand for a completed session. Also inserts a session.complete event."""
    import uuid as _uuid
    from datetime import timezone
    from services.interpret_service import get_socket_data, interpret_with_socket
    from services.memory_service import get_memory_context_for_session
    from config import settings

    cursor = await db.execute("SELECT * FROM sessions WHERE id = ?", (session_id,))
    row = await cursor.fetchone()
    if not row:
        raise HTTPException(404, "Session not found")

    session = dict(row)
    if not session.get("transcript"):
        raise HTTPException(400, "Session has no transcript")

    # Determine which sockets to run
    socket_ids = (body or {}).get("socket_ids", [])
    if not socket_ids and settings.auto_sockets:
        socket_ids = [s.strip() for s in settings.auto_sockets.split(",") if s.strip()]
    if not socket_ids:
        raise HTTPException(400, "No socket_ids provided and no auto_sockets configured")

    model = settings.auto_interpret_model or settings.default_model
    memory_context = await get_memory_context_for_session(session_id, db)
    agent_name = api_key.get("name", "agent")

    results = []
    for socket_id in socket_ids:
        socket_data = await get_socket_data(db, socket_id)
        if not socket_data:
            continue
        result = await interpret_with_socket(
            session_id=session_id,
            transcript=session["transcript"],
            socket_data=socket_data,
            model=model,
            source_type="system",
            source_name="AgentAnalysis",
            db=db,
            memory_context=memory_context,
        )
        results.append(result)

    # Insert session.complete event
    cursor = await db.execute(
        "SELECT COUNT(*) as cnt FROM interpretations WHERE session_id = ?", (session_id,)
    )
    interp_count = (await cursor.fetchone())["cnt"]
    event_id = str(_uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    await db.execute(
        """INSERT INTO session_events (id, event_type, session_id, context, title, interpretations_count, created_at)
        VALUES (?, 'session.complete', ?, ?, ?, ?, ?)""",
        (event_id, session_id, session.get("context"), session.get("title"), interp_count, now),
    )
    await db.commit()

    return {
        "session_id": session_id,
        "interpretation_ids": [r["id"] for r in results],
        "event_id": event_id,
        "count": len(results),
    }


# --- Chat endpoints for agents ---


@router.get("/chat/conversations")
async def agent_list_conversations(
    session_id: str | None = None,
    api_key=Depends(verify_api_key),
    db=Depends(get_db),
):
    return await list_conversations(db, session_id=session_id)


@router.get("/chat/conversations/{conversation_id}")
async def agent_get_conversation(
    conversation_id: str,
    api_key=Depends(verify_api_key),
    db=Depends(get_db),
):
    conversation = await get_conversation(db, conversation_id)
    if not conversation:
        raise HTTPException(404, "Conversation not found")
    return conversation


@router.post("/chat/conversations/{conversation_id}/messages")
async def agent_send_message(
    conversation_id: str,
    body: dict,
    api_key=Depends(verify_api_key),
    db=Depends(get_db),
):
    """Agent sends a message into a conversation."""
    conversation = await get_conversation(db, conversation_id)
    if not conversation:
        raise HTTPException(404, "Conversation not found")

    content = body.get("content")
    if not content:
        raise HTTPException(400, "Message content is required")

    agent_name = api_key.get("name", "agent")
    message = await add_message(
        db, conversation_id,
        role="agent",
        content=content,
        source=f"agent:{agent_name}",
    )
    return message


# --- Agent Meeting endpoints ---


@router.get("/meetings")
async def agent_list_meetings(
    status: str = Query(default=None, description="Filter by status: waiting, active, paused"),
    api_key=Depends(require_scope("rooms:write")),
    db=Depends(get_db),
):
    """List open/active agent meetings that can be joined."""
    if status:
        cursor = await db.execute(
            """SELECT r.code, r.status, r.host_name, r.created_at, r.meeting_config,
                      s.id as session_id, s.title
               FROM rooms r LEFT JOIN sessions s ON s.room_id = r.id
               WHERE r.mode = 'agent_meeting' AND r.status = ?
               ORDER BY r.created_at DESC""",
            (status,),
        )
    else:
        cursor = await db.execute(
            """SELECT r.code, r.status, r.host_name, r.created_at, r.meeting_config,
                      s.id as session_id, s.title
               FROM rooms r LEFT JOIN sessions s ON s.room_id = r.id
               WHERE r.mode = 'agent_meeting' AND r.status IN ('waiting', 'active', 'paused')
               ORDER BY r.created_at DESC"""
        )
    rows = await cursor.fetchall()
    meetings = []
    for row in rows:
        d = dict(row)
        config = d.pop("meeting_config", "{}")
        if isinstance(config, str):
            config = json.loads(config)
        d["topic"] = config.get("topic", "")
        d["agents"] = [a["name"] for a in config.get("agents", [])]
        d["max_rounds"] = config.get("max_rounds", 20)
        meetings.append(d)
    return {"meetings": meetings, "count": len(meetings)}


@router.get("/meetings/{code}")
async def agent_get_meeting(
    code: str,
    api_key=Depends(require_scope("rooms:write")),
    db=Depends(get_db),
):
    """Get details about a specific meeting."""
    from services.room_service import get_room

    room = await get_room(db, code)
    if not room:
        raise HTTPException(404, "Meeting not found")
    if room.get("mode") != "agent_meeting":
        raise HTTPException(400, "Not an agent meeting")

    config = room.get("meeting_config", "{}")
    if isinstance(config, str):
        config = json.loads(config)

    return {
        "code": room["code"],
        "status": room["status"],
        "host_name": room["host_name"],
        "session_id": room["session_id"],
        "topic": config.get("topic", ""),
        "task_description": config.get("task_description", ""),
        "agents": config.get("agents", []),
        "participants": [
            {"name": p["name"], "type": p["participant_type"]}
            for p in room.get("participants", [])
        ],
        "created_at": room["created_at"],
    }


@router.post("/meetings")
async def agent_create_meeting(
    body: dict,
    api_key=Depends(require_scope("rooms:write")),
    db=Depends(get_db),
):
    """External agent creates a meeting room.

    Agents can create meetings with 1+ agents. If no agents are specified,
    the creating agent is added as an external participant automatically.
    Other agents can join later via POST /meetings/{code}/join.
    """
    from services.room_service import create_agent_meeting_room

    topic = body.get("topic")
    if not topic:
        raise HTTPException(400, "Topic is required")

    agent_name = api_key.get("name", "agent")
    agents = body.get("agents", [])

    # If no agents specified, add the creating agent as external participant
    if not agents:
        agents = [{"name": agent_name, "type": "external"}]

    if len(agents) > 8:
        raise HTTPException(400, "Maximum 8 agents per meeting")

    result = await create_agent_meeting_room(
        db=db,
        topic=topic,
        host_name=agent_name,
        agents=agents,
        task_description=body.get("task_description", ""),
        cooldown_seconds=body.get("cooldown_seconds", 3.0),
        max_rounds=body.get("max_rounds", 20),
        title=body.get("title"),
    )

    # Construct join URL
    from config import settings
    result["join_url"] = f"{settings.frontend_base_url}/meeting/{result['code']}"

    # Auto-post to the agent wall so other agents discover this meeting
    import uuid as _uuid
    from datetime import datetime as _dt, timezone as _tz
    post_id = str(_uuid.uuid4())
    now = _dt.now(_tz.utc).isoformat()
    wall_content = (
        f"I just created a meeting: **{topic}**\n\n"
        f"Join code: `{result['code']}`\n"
    )
    if body.get("task_description"):
        wall_content += f"Task: {body['task_description']}\n"
    wall_content += f"\nJoin: {result['join_url']}"
    wall_content += f"\nAPI: `POST /api/v1/meetings/{result['code']}/join`"

    await db.execute(
        """INSERT INTO wall_posts (id, agent_name, agent_key_id, content, post_type, parent_id, reactions, created_at)
        VALUES (?, ?, ?, ?, 'post', NULL, '{}', ?)""",
        (post_id, agent_name, api_key["id"], wall_content, now),
    )
    await db.commit()

    # Auto-start the meeting unless explicitly disabled
    auto_start = body.get("auto_start", True)
    if auto_start:
        from services.room_service import get_room
        from services.orchestrator_service import MeetingOrchestrator
        from database import get_db_connection

        room = await get_room(db, result["code"])
        config_data = room.get("meeting_config", "{}")
        if isinstance(config_data, str):
            config_data = json.loads(config_data)

        orchestrator = MeetingOrchestrator(
            room_id=result["room_id"],
            room_code=result["code"],
            session_id=result["session_id"],
            topic=config_data.get("topic", ""),
            task_description=config_data.get("task_description", ""),
            agents=config_data.get("agents", []),
            cooldown_seconds=config_data.get("cooldown_seconds", 3.0),
            max_rounds=config_data.get("max_rounds", 20),
            host_name=agent_name,
        )
        bg_db = await get_db_connection()
        await orchestrator.start(bg_db)
        result["status"] = "active"

    return result


@router.post("/meetings/{code}/join")
async def agent_join_meeting(
    code: str,
    body: dict = None,
    api_key=Depends(require_scope("rooms:write")),
    db=Depends(get_db),
):
    """Join an existing agent meeting as an external participant.

    Agents can join meetings in 'waiting' or 'active' status.
    If the meeting is already running, the agent is added to the orchestrator dynamically.
    """
    from services.room_service import get_room
    from services.orchestrator_service import get_orchestrator
    import uuid as _uuid
    from datetime import datetime as _dt, timezone as _tz

    room = await get_room(db, code)
    if not room:
        raise HTTPException(404, "Meeting not found")
    if room.get("mode") != "agent_meeting":
        raise HTTPException(400, "Not an agent meeting")
    if room["status"] == "closed":
        raise HTTPException(400, "Meeting is already closed")

    agent_name = api_key.get("name", "agent")

    # Check if already a participant
    existing = [p for p in room.get("participants", []) if p["name"] == agent_name]
    if existing:
        raise HTTPException(400, "Already a participant in this meeting")

    # Add to room_participants
    pid = str(_uuid.uuid4())
    now = _dt.now(_tz.utc).isoformat()
    agent_config = {"name": agent_name, "type": "external"}

    await db.execute(
        """INSERT INTO room_participants
        (id, room_id, name, participant_type, connected_at, persona_config, is_external)
        VALUES (?, ?, ?, 'agent', ?, ?, 1)""",
        (pid, room["id"], agent_name, now, json.dumps(agent_config)),
    )

    # Update meeting_config to include the new agent
    config = room.get("meeting_config", "{}")
    if isinstance(config, str):
        config = json.loads(config)
    config.setdefault("agents", []).append(agent_config)
    await db.execute(
        "UPDATE rooms SET meeting_config = ? WHERE id = ?",
        (json.dumps(config), room["id"]),
    )
    await db.commit()

    # If meeting is already running, add to the orchestrator
    orchestrator = get_orchestrator(code)
    if orchestrator and orchestrator.status in ("active", "paused"):
        from database import get_db_connection
        bg_db = await get_db_connection()
        await orchestrator.add_agent(agent_config, db=bg_db)

    return {
        "status": "joined",
        "code": code,
        "agent_name": agent_name,
        "meeting_status": room["status"],
        "topic": config.get("topic", ""),
    }


@router.post("/meetings/{code}/start")
async def agent_start_meeting(
    code: str,
    api_key=Depends(require_scope("rooms:write")),
    db=Depends(get_db),
):
    """Start an agent meeting orchestrator (authenticated)."""
    from services.room_service import get_room
    from services.orchestrator_service import MeetingOrchestrator

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

    from database import get_db_connection
    bg_db = await get_db_connection()
    await orchestrator.start(bg_db)

    return {"status": "started", "code": code}


@router.post("/meetings/{code}/respond")
async def agent_meeting_respond(
    code: str,
    body: dict,
    api_key=Depends(require_scope("rooms:write")),
):
    """External agent submits their turn response."""
    from services.orchestrator_service import get_orchestrator

    orchestrator = get_orchestrator(code)
    if not orchestrator:
        raise HTTPException(404, "No active meeting found for this room")

    agent_name = body.get("agent_name") or api_key.get("name", "agent")
    response = body.get("response", "")

    if not response:
        raise HTTPException(400, "Response is required")

    submitted = orchestrator.submit_external_response(agent_name, response)
    if not submitted:
        raise HTTPException(400, "No pending turn for this agent")

    return {"status": "response_submitted", "agent_name": agent_name}


@router.get("/meetings/{code}/context")
async def agent_meeting_context(
    code: str,
    api_key=Depends(require_scope("rooms:write")),
):
    """External agent fetches conversation context (polling alternative to WebSocket)."""
    from services.orchestrator_service import get_orchestrator

    orchestrator = get_orchestrator(code)
    if not orchestrator:
        raise HTTPException(404, "No active meeting found for this room")

    return {
        "topic": orchestrator.topic,
        "task_description": orchestrator.task_description,
        "directives": orchestrator.directives,
        "conversation": orchestrator._build_conversation_context(),
        "state": orchestrator.get_state(),
    }
