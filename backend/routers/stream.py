"""WebSocket streaming router for live transcripts and agent meetings."""

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from database import get_db_connection
from services.auth_service import verify_api_key_token
from services.stream_manager import ConnectionInfo, stream_manager
from services.orchestrator_service import get_orchestrator

router = APIRouter(tags=["stream"])


async def _replay_missed(ws: WebSocket, room_key: str, last_seq: int | None):
    """Send any buffered messages the client missed since last_seq."""
    if last_seq is None:
        return
    for msg in stream_manager.get_messages_since(room_key, last_seq):
        await ws.send_json(msg)


@router.websocket("/api/stream/session/{session_id}")
async def stream_session(websocket: WebSocket, session_id: str):
    """WebSocket endpoint for streaming a solo session's transcript."""
    await websocket.accept()
    room_key = f"session:{session_id}"

    last_seq_raw = websocket.query_params.get("last_seq")
    try:
        last_seq = int(last_seq_raw) if last_seq_raw is not None else None
    except (ValueError, TypeError):
        last_seq = None

    await stream_manager.subscribe(room_key, websocket)
    await _replay_missed(websocket, room_key, last_seq)
    try:
        while True:
            data = await websocket.receive_json()
            # Handle pong (keepalive response) — just ignore
            if data.get("type") == "pong":
                continue
            # Browser sends transcript chunks
            if data.get("type") == "transcript_chunk":
                await stream_manager.broadcast(room_key, data)
    except WebSocketDisconnect:
        await stream_manager.unsubscribe(room_key, websocket)


@router.websocket("/api/stream/room/{code}")
async def stream_room(websocket: WebSocket, code: str):
    """WebSocket endpoint for streaming a room's live transcript."""
    await websocket.accept()
    room_key = f"room:{code}"

    last_seq_raw = websocket.query_params.get("last_seq")
    try:
        last_seq = int(last_seq_raw) if last_seq_raw is not None else None
    except (ValueError, TypeError):
        last_seq = None

    # Token-based auth for agents
    token = websocket.query_params.get("token")
    agent_info = None

    if token:
        db = await get_db_connection()
        try:
            agent_info = await verify_api_key_token(token, db)
        finally:
            await db.close()

        if not agent_info:
            await websocket.close(code=4001, reason="unauthorized")
            return

        # Check if agent was previously kicked (persistent check)
        db = await get_db_connection()
        try:
            if await stream_manager.is_kicked(room_key, agent_info["name"], db=db):
                await websocket.close(code=4003, reason="kicked")
                return
        finally:
            await db.close()

    # Build connection metadata
    conn_info = ConnectionInfo(
        name=agent_info["name"] if agent_info else None,
        participant_type="agent" if agent_info else "human",
        agent_name=agent_info["name"] if agent_info else None,
    )

    await stream_manager.subscribe(room_key, websocket, conn_info)
    await _replay_missed(websocket, room_key, last_seq)

    # Auto-register authenticated agent as room participant
    if agent_info:
        db = await get_db_connection()
        try:
            cursor = await db.execute(
                "SELECT id FROM rooms WHERE code = ?", (code,)
            )
            room = await cursor.fetchone()
            if room:
                pid = str(uuid.uuid4())
                now = datetime.now(timezone.utc).isoformat()
                await db.execute(
                    """INSERT INTO room_participants
                    (id, room_id, name, participant_type, connected_at, agent_name)
                    VALUES (?, ?, ?, 'agent', ?, ?)""",
                    (pid, room["id"], agent_info["name"], now, agent_info["name"]),
                )
                await db.commit()
        finally:
            await db.close()

        await stream_manager.broadcast(room_key, {
            "type": "participant_joined",
            "name": agent_info["name"],
            "participant_type": "agent",
        })

    try:
        while True:
            data = await websocket.receive_json()
            msg_type = data.get("type")

            if msg_type == "pong":
                continue
            elif msg_type == "identify":
                if agent_info:
                    # Agent already identified via token — ignore
                    pass
                else:
                    name = data.get("name", "Unknown")
                    conn_info.name = name
                    await stream_manager.broadcast(room_key, {
                        "type": "participant_joined",
                        "name": name,
                        "participant_type": data.get("participant_type", "human"),
                    })
            elif msg_type == "transcript_chunk":
                await stream_manager.broadcast(room_key, data)
    except WebSocketDisconnect:
        # Clean up agent participant on disconnect
        if agent_info:
            db = await get_db_connection()
            try:
                cursor = await db.execute(
                    "SELECT id FROM rooms WHERE code = ?", (code,)
                )
                room = await cursor.fetchone()
                if room:
                    await db.execute(
                        "DELETE FROM room_participants WHERE room_id = ? AND agent_name = ?",
                        (room["id"], agent_info["name"]),
                    )
                    await db.commit()
            finally:
                await db.close()

            await stream_manager.broadcast(room_key, {
                "type": "participant_left",
                "name": agent_info["name"],
                "participant_type": "agent",
            })

        await stream_manager.unsubscribe(room_key, websocket)


@router.websocket("/api/stream/meeting/{code}")
async def stream_meeting(websocket: WebSocket, code: str):
    """WebSocket endpoint for agent meeting rooms."""
    await websocket.accept()
    room_key = f"meeting:{code}"

    last_seq_raw = websocket.query_params.get("last_seq")
    try:
        last_seq = int(last_seq_raw) if last_seq_raw is not None else None
    except (ValueError, TypeError):
        last_seq = None

    # Optional token-based auth (mirrors room stream pattern)
    token = websocket.query_params.get("token")
    if token:
        db = await get_db_connection()
        try:
            agent_info = await verify_api_key_token(token, db)
        finally:
            await db.close()
        if not agent_info:
            await websocket.close(code=4001, reason="unauthorized")
            return

    # Build connection metadata for meeting participants
    meeting_conn_info = ConnectionInfo(
        name=None,
        participant_type="human",
        agent_name=None,
    )
    await stream_manager.subscribe(room_key, websocket, meeting_conn_info)
    await _replay_missed(websocket, room_key, last_seq)
    try:
        while True:
            data = await websocket.receive_json()
            msg_type = data.get("type")

            if msg_type == "pong":
                continue
            elif msg_type == "identify":
                name = data.get("name", "Unknown")
                participant_type = data.get("participant_type", "human")
                meeting_conn_info.name = name
                meeting_conn_info.participant_type = participant_type
                await stream_manager.broadcast(room_key, {
                    "type": "participant_joined",
                    "name": name,
                    "participant_type": participant_type,
                })

            elif msg_type == "directive":
                orchestrator = get_orchestrator(code)
                if orchestrator:
                    db = await get_db_connection()
                    try:
                        await orchestrator.add_directive(
                            data.get("text", ""),
                            data.get("from_name", "Host"),
                            db=db,
                        )
                    finally:
                        await db.close()

            elif msg_type == "human_message":
                orchestrator = get_orchestrator(code)
                if orchestrator:
                    orchestrator.add_human_message(
                        data.get("text", ""),
                        data.get("from_name", "Host"),
                    )

            elif msg_type == "external_agent_response":
                orchestrator = get_orchestrator(code)
                if orchestrator:
                    orchestrator.submit_external_response(
                        data.get("agent_name", ""),
                        data.get("response", ""),
                    )

    except WebSocketDisconnect:
        if meeting_conn_info.name:
            await stream_manager.broadcast(room_key, {
                "type": "participant_left",
                "name": meeting_conn_info.name,
                "participant_type": meeting_conn_info.participant_type,
            })
        await stream_manager.unsubscribe(room_key, websocket)
