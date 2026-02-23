"""Interpretation router."""

import json

from fastapi import APIRouter, Depends, HTTPException

from database import get_db
from models.schemas import InterpretRequest, InterpretationResponse
from services.interpret_service import (
    interpret_with_custom,
    interpret_with_lens,
    interpret_with_socket,
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
        )
    else:
        raise HTTPException(400, f"Unknown lens type: {body.lens_type}")

    # Update session status to complete
    await db.execute(
        "UPDATE sessions SET status = 'complete' WHERE id = ?",
        (session_id,),
    )
    await db.commit()

    return result


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
