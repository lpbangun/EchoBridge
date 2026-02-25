"""Agent API router — all /api/v1/ endpoints with bearer auth."""

import json
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import PlainTextResponse

from database import get_db
from services.auth_service import verify_api_key
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

# Path to SKILL.md relative to project root
_SKILL_MD_PATH = Path(__file__).resolve().parent.parent.parent / "openclaw-skill" / "echobridge" / "SKILL.md"

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
    "/api/v1/chat/conversations",
    "/api/v1/chat/conversations/{id}",
    "/api/v1/chat/conversations/{id}/messages",
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
    if not _SKILL_MD_PATH.exists():
        raise HTTPException(404, "SKILL.md not found")
    return _SKILL_MD_PATH.read_text(encoding="utf-8")


@router.get("/sessions")
async def list_sessions(
    context: str | None = None,
    series_id: str | None = None,
    limit: int = Query(default=20, le=100),
    offset: int = Query(default=0, ge=0),
    api_key=Depends(verify_api_key),
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
    api_key=Depends(verify_api_key),
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
    api_key=Depends(verify_api_key),
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
    api_key=Depends(verify_api_key),
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
    api_key=Depends(verify_api_key),
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
    api_key=Depends(verify_api_key),
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
    api_key=Depends(verify_api_key),
    db=Depends(get_db),
):
    from services.room_service import get_room as _get_room
    room = await _get_room(db, code)
    if not room:
        raise HTTPException(404, "Room not found")
    return room


@router.get("/series")
async def list_series(
    api_key=Depends(verify_api_key),
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
    api_key=Depends(verify_api_key),
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
    api_key=Depends(verify_api_key),
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
        "updated_at": data["updated_at"],
        "session_count": data["session_count"],
    }


@router.get("/search")
async def search_endpoint(
    q: str,
    api_key=Depends(verify_api_key),
    db=Depends(get_db),
):
    results = await search(db, q)
    return {"query": q, "results": results, "total": len(results)}


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
