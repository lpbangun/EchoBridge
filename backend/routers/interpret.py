"""Interpretation router."""

import asyncio
import json

from fastapi import APIRouter, Depends, HTTPException

from database import get_db
from models.schemas import InterpretRequest, InterpretationResponse, InterpretationUpdate
from services.interpret_service import (
    interpret_with_custom,
    interpret_with_lens,
    interpret_with_socket,
)
from services.memory_service import (
    get_memory_context_for_session,
    synthesize_and_store_memory,
)

router = APIRouter(prefix="/api/sessions", tags=["interpretation"])


@router.post("/{session_id}/interpret", response_model=InterpretationResponse)
async def interpret_session(
    session_id: str,
    body: InterpretRequest,
    db=Depends(get_db),
):
    """Run a lens or socket interpretation on a session."""
    cursor = await db.execute("SELECT * FROM sessions WHERE id = ?", (session_id,))
    row = await cursor.fetchone()
    if not row:
        raise HTTPException(404, "Session not found")

    session = dict(row)
    if not session.get("transcript"):
        raise HTTPException(400, "Session has no transcript yet")

    metadata = session.get("context_metadata", "{}")
    if isinstance(metadata, str):
        metadata = json.loads(metadata)

    # Fetch memory context if session belongs to a series
    memory_context = await get_memory_context_for_session(session_id, db)

    if body.lens_type.value == "preset":
        if not body.lens_id:
            # Default to session context
            body.lens_id = session["context"]
        result = await interpret_with_lens(
            session_id=session_id,
            transcript=session["transcript"],
            lens_id=body.lens_id,
            model=body.model,
            context_metadata=metadata,
            source_name=body.source_name,
            db=db,
            memory_context=memory_context,
        )
    elif body.lens_type.value == "custom":
        if not body.system_prompt:
            raise HTTPException(400, "Custom lens requires system_prompt")
        result = await interpret_with_custom(
            session_id=session_id,
            transcript=session["transcript"],
            system_prompt=body.system_prompt,
            model=body.model,
            source_name=body.source_name,
            db=db,
            memory_context=memory_context,
        )
    elif body.lens_type.value == "socket":
        if not body.lens_id:
            raise HTTPException(400, "Socket interpretation requires lens_id (socket ID)")
        cursor = await db.execute("SELECT * FROM sockets WHERE id = ?", (body.lens_id,))
        socket_row = await cursor.fetchone()
        if not socket_row:
            raise HTTPException(404, f"Socket not found: {body.lens_id}")
        socket_data = dict(socket_row)
        if isinstance(socket_data.get("output_schema"), str):
            socket_data["output_schema"] = json.loads(socket_data["output_schema"])
        result = await interpret_with_socket(
            session_id=session_id,
            transcript=session["transcript"],
            socket_data=socket_data,
            model=body.model,
            source_name=body.source_name,
            db=db,
            memory_context=memory_context,
        )
    else:
        raise HTTPException(400, f"Unknown lens type: {body.lens_type}")

    # Update session status to complete
    await db.execute(
        "UPDATE sessions SET status = 'complete' WHERE id = ?",
        (session_id,),
    )
    await db.commit()

    # Fire-and-forget memory synthesis if session belongs to a series
    if session.get("series_id"):
        asyncio.create_task(
            synthesize_and_store_memory(
                series_id=session["series_id"],
                session=session,
                interpretation_markdown=result.get("output_markdown", ""),
                model=body.model,
                db=db,
            )
        )

    return result


@router.patch("/{session_id}/interpretations/{interpretation_id}", response_model=InterpretationResponse)
async def update_interpretation(
    session_id: str,
    interpretation_id: str,
    body: InterpretationUpdate,
    db=Depends(get_db),
):
    """Update an interpretation's markdown content."""
    cursor = await db.execute("SELECT * FROM sessions WHERE id = ?", (session_id,))
    if not await cursor.fetchone():
        raise HTTPException(404, "Session not found")

    cursor = await db.execute(
        "SELECT * FROM interpretations WHERE id = ? AND session_id = ?",
        (interpretation_id, session_id),
    )
    row = await cursor.fetchone()
    if not row:
        raise HTTPException(404, "Interpretation not found")

    if not body.output_markdown.strip():
        raise HTTPException(400, "Markdown content cannot be empty")

    await db.execute(
        "UPDATE interpretations SET output_markdown = ? WHERE id = ?",
        (body.output_markdown, interpretation_id),
    )
    await db.commit()

    cursor = await db.execute(
        "SELECT * FROM interpretations WHERE id = ?", (interpretation_id,)
    )
    updated = await cursor.fetchone()
    d = dict(updated)
    if isinstance(d.get("output_structured"), str):
        d["output_structured"] = json.loads(d["output_structured"])
    return d


@router.get("/{session_id}/interpretations", response_model=list[InterpretationResponse])
async def list_interpretations(session_id: str, db=Depends(get_db)):
    """List all interpretations for a session."""
    cursor = await db.execute("SELECT * FROM sessions WHERE id = ?", (session_id,))
    if not await cursor.fetchone():
        raise HTTPException(404, "Session not found")

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
