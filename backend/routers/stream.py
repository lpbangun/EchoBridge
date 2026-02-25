"""WebSocket streaming router for live transcripts and agent meetings."""

import json
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect

from database import get_db, get_db_connection
from services.auth_service import verify_api_key_token
from services.stream_manager import ConnectionInfo, stream_manager
from services.orchestrator_service import get_orchestrator

router = APIRouter(tags=["stream"])


@router.websocket("/api/stream/session/{session_id}")
async def stream_session(websocket: WebSocket, session_id: str):
    """WebSocket endpoint for streaming a solo session's transcript."""
    await websocket.accept()
    room_key = f"session:{session_id}"

    await stream_manager.subscribe(room_key, websocket)
    try:
        while True:
            data = await websocket.receive_json()
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

        # Check if agent was previously kicked
        if stream_manager.is_kicked(room_key, agent_info["name"]):
            await websocket.close(code=4003, reason="kicked")
            return

    # Build connection metadata
    conn_info = ConnectionInfo(
        name=agent_info["name"] if agent_info else None,
        participant_type="agent" if agent_info else "human",
        agent_name=agent_info["name"] if agent_info else None,
    )

    await stream_manager.subscribe(room_key, websocket, conn_info)

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

            if msg_type == "identify":
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

    await stream_manager.subscribe(room_key, websocket)
    try:
        while True:
            data = await websocket.receive_json()
            msg_type = data.get("type")

            if msg_type == "identify":
                await stream_manager.broadcast(room_key, {
                    "type": "participant_joined",
                    "name": data.get("name", "Unknown"),
                    "participant_type": data.get("participant_type", "human"),
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
        await stream_manager.unsubscribe(room_key, websocket)
