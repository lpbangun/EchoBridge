"""WebSocket streaming router for live transcripts and agent meetings."""

import json

from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect

from database import get_db
from services.stream_manager import stream_manager
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

    await stream_manager.subscribe(room_key, websocket)
    try:
        while True:
            data = await websocket.receive_json()
            msg_type = data.get("type")

            if msg_type == "identify":
                # Participant identifying themselves
                await stream_manager.broadcast(room_key, {
                    "type": "participant_joined",
                    "name": data.get("name", "Unknown"),
                    "participant_type": data.get("participant_type", "human"),
                })
            elif msg_type == "transcript_chunk":
                # Host sending transcript chunks
                await stream_manager.broadcast(room_key, data)
    except WebSocketDisconnect:
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
                    from database import get_db_connection
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
