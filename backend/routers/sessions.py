"""Session CRUD router."""

import json
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query

from database import get_db
from models.schemas import (
    SessionCreate,
    SessionListItem,
    SessionResponse,
    SessionUpdate,
)

router = APIRouter(prefix="/api/sessions", tags=["sessions"])


def _row_to_session(row) -> dict:
    """Convert a database row to a session dict."""
    d = dict(row)
    if isinstance(d.get("context_metadata"), str):
        d["context_metadata"] = json.loads(d["context_metadata"])
    return d


@router.post("", response_model=SessionResponse)
async def create_session(body: SessionCreate, db=Depends(get_db)):
    session_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    metadata_json = json.dumps(body.context_metadata)

    await db.execute(
        """INSERT INTO sessions (id, title, context, context_metadata, host_name, created_at)
        VALUES (?, ?, ?, ?, ?, ?)""",
        (session_id, body.title, body.context.value, metadata_json,
         body.host_name, now),
    )
    await db.commit()

    cursor = await db.execute("SELECT * FROM sessions WHERE id = ?", (session_id,))
    row = await cursor.fetchone()
    return _row_to_session(row)


@router.get("", response_model=list[SessionListItem])
async def list_sessions(
    context: str | None = None,
    q: str | None = None,
    limit: int = Query(default=50, le=100),
    offset: int = Query(default=0, ge=0),
    db=Depends(get_db),
):
    query = "SELECT * FROM sessions"
    params: list = []
    conditions = []

    if context:
        conditions.append("context = ?")
        params.append(context)

    if conditions:
        query += " WHERE " + " AND ".join(conditions)

    query += " ORDER BY created_at DESC LIMIT ? OFFSET ?"
    params.extend([limit, offset])

    cursor = await db.execute(query, params)
    rows = await cursor.fetchall()
    return [_row_to_session(row) for row in rows]


@router.get("/{session_id}", response_model=SessionResponse)
async def get_session(session_id: str, db=Depends(get_db)):
    cursor = await db.execute("SELECT * FROM sessions WHERE id = ?", (session_id,))
    row = await cursor.fetchone()
    if not row:
        raise HTTPException(404, "Session not found")
    return _row_to_session(row)


@router.patch("/{session_id}", response_model=SessionResponse)
async def update_session(session_id: str, body: SessionUpdate, db=Depends(get_db)):
    cursor = await db.execute("SELECT * FROM sessions WHERE id = ?", (session_id,))
    row = await cursor.fetchone()
    if not row:
        raise HTTPException(404, "Session not found")

    updates = []
    params = []
    if body.title is not None:
        updates.append("title = ?")
        params.append(body.title)
    if body.context_metadata is not None:
        updates.append("context_metadata = ?")
        params.append(json.dumps(body.context_metadata))

    if not updates:
        raise HTTPException(400, "No fields to update")

    params.append(session_id)
    await db.execute(
        f"UPDATE sessions SET {', '.join(updates)} WHERE id = ?", params
    )
    await db.commit()

    cursor = await db.execute("SELECT * FROM sessions WHERE id = ?", (session_id,))
    row = await cursor.fetchone()
    return _row_to_session(row)


@router.delete("/{session_id}")
async def delete_session(session_id: str, db=Depends(get_db)):
    cursor = await db.execute("SELECT * FROM sessions WHERE id = ?", (session_id,))
    row = await cursor.fetchone()
    if not row:
        raise HTTPException(404, "Session not found")

    await db.execute("DELETE FROM sessions WHERE id = ?", (session_id,))
    await db.commit()
    return {"ok": True}
