"""Export router — generates and saves .md files."""

import json

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import PlainTextResponse

from database import get_db
from services.markdown_service import generate_markdown, save_markdown

router = APIRouter(prefix="/api/sessions", tags=["export"])


@router.get("/{session_id}/export/md", response_class=PlainTextResponse)
async def export_markdown(session_id: str, db=Depends(get_db)):
    """Download the session as a .md file."""
    cursor = await db.execute("SELECT * FROM sessions WHERE id = ?", (session_id,))
    row = await cursor.fetchone()
    if not row:
        raise HTTPException(404, "Session not found")

    session = dict(row)
    if isinstance(session.get("context_metadata"), str):
        session["context_metadata"] = json.loads(session["context_metadata"])

    # Get primary interpretation
    cursor = await db.execute(
        "SELECT * FROM interpretations WHERE session_id = ? AND is_primary = 1 LIMIT 1",
        (session_id,),
    )
    interp_row = await cursor.fetchone()
    interpretation = dict(interp_row) if interp_row else None

    # Get participants if room session
    participants = None
    room_code = None
    if session.get("room_id"):
        cursor = await db.execute(
            "SELECT * FROM rooms WHERE id = ?", (session["room_id"],)
        )
        room_row = await cursor.fetchone()
        if room_row:
            room_code = room_row["code"]
        cursor = await db.execute(
            "SELECT * FROM room_participants WHERE room_id = ?",
            (session["room_id"],),
        )
        participants = [dict(r) for r in await cursor.fetchall()]

    md = generate_markdown(session, interpretation, participants, room_code)
    return PlainTextResponse(md, media_type="text/markdown")


@router.post("/{session_id}/export/save")
async def save_export(session_id: str, db=Depends(get_db)):
    """Save the .md file to the output directory."""
    cursor = await db.execute("SELECT * FROM sessions WHERE id = ?", (session_id,))
    row = await cursor.fetchone()
    if not row:
        raise HTTPException(404, "Session not found")

    session = dict(row)
    if isinstance(session.get("context_metadata"), str):
        session["context_metadata"] = json.loads(session["context_metadata"])

    # Get primary interpretation
    cursor = await db.execute(
        "SELECT * FROM interpretations WHERE session_id = ? AND is_primary = 1 LIMIT 1",
        (session_id,),
    )
    interp_row = await cursor.fetchone()
    interpretation = dict(interp_row) if interp_row else None

    filepath = await save_markdown(session, interpretation)
    return {"filepath": filepath, "ok": True}
