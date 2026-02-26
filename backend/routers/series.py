"""Series CRUD + memory endpoints."""

import json
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException

from database import get_db
from models.schemas import (
    MemoryDocumentResponse,
    SeriesCreate,
    SeriesListItem,
    SeriesResponse,
    SeriesUpdate,
    SessionListItem,
)
from services.memory_service import refresh_memory_from_scratch

router = APIRouter(prefix="/api/series", tags=["series"])


@router.post("", response_model=SeriesResponse, status_code=201)
async def create_series(body: SeriesCreate, db=Depends(get_db)):
    series_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()

    await db.execute(
        """INSERT INTO series (id, name, description, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?)""",
        (series_id, body.name, body.description, now, now),
    )
    await db.commit()

    cursor = await db.execute("SELECT * FROM series WHERE id = ?", (series_id,))
    row = await cursor.fetchone()
    return dict(row)


@router.get("", response_model=list[SeriesListItem])
async def list_series(db=Depends(get_db)):
    cursor = await db.execute(
        "SELECT id, name, description, session_count, created_at, updated_at "
        "FROM series ORDER BY updated_at DESC"
    )
    rows = await cursor.fetchall()
    return [dict(r) for r in rows]


@router.get("/{series_id}", response_model=SeriesResponse)
async def get_series(series_id: str, db=Depends(get_db)):
    cursor = await db.execute("SELECT * FROM series WHERE id = ?", (series_id,))
    row = await cursor.fetchone()
    if not row:
        raise HTTPException(404, "Series not found")
    return dict(row)


@router.patch("/{series_id}", response_model=SeriesResponse)
async def update_series(series_id: str, body: SeriesUpdate, db=Depends(get_db)):
    cursor = await db.execute("SELECT * FROM series WHERE id = ?", (series_id,))
    row = await cursor.fetchone()
    if not row:
        raise HTTPException(404, "Series not found")

    updates = []
    params = []
    if body.name is not None:
        updates.append("name = ?")
        params.append(body.name)
    if body.description is not None:
        updates.append("description = ?")
        params.append(body.description)

    if not updates:
        raise HTTPException(400, "No fields to update")

    now = datetime.now(timezone.utc).isoformat()
    updates.append("updated_at = ?")
    params.append(now)

    params.append(series_id)
    await db.execute(
        f"UPDATE series SET {', '.join(updates)} WHERE id = ?", params
    )
    await db.commit()

    cursor = await db.execute("SELECT * FROM series WHERE id = ?", (series_id,))
    row = await cursor.fetchone()
    return dict(row)


@router.delete("/{series_id}")
async def delete_series(series_id: str, db=Depends(get_db)):
    cursor = await db.execute("SELECT * FROM series WHERE id = ?", (series_id,))
    row = await cursor.fetchone()
    if not row:
        raise HTTPException(404, "Series not found")

    # Null out series_id on associated sessions
    await db.execute(
        "UPDATE sessions SET series_id = NULL WHERE series_id = ?",
        (series_id,),
    )
    await db.execute("DELETE FROM series WHERE id = ?", (series_id,))
    await db.commit()
    return {"ok": True}


@router.get("/{series_id}/memory", response_model=MemoryDocumentResponse)
async def get_memory(series_id: str, db=Depends(get_db)):
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


@router.post("/{series_id}/memory/refresh", response_model=MemoryDocumentResponse)
async def refresh_memory(
    series_id: str,
    db=Depends(get_db),
):
    cursor = await db.execute("SELECT * FROM series WHERE id = ?", (series_id,))
    row = await cursor.fetchone()
    if not row:
        raise HTTPException(404, "Series not found")

    await refresh_memory_from_scratch(series_id, None, db)

    cursor = await db.execute("SELECT * FROM series WHERE id = ?", (series_id,))
    row = await cursor.fetchone()
    data = dict(row)
    return {
        "series_id": data["id"],
        "series_name": data["name"],
        "memory_document": data["memory_document"] or "",
        "memory_error": data.get("memory_error"),
        "updated_at": data["updated_at"],
        "session_count": data["session_count"],
    }


@router.get("/{series_id}/sessions", response_model=list[SessionListItem])
async def list_series_sessions(series_id: str, db=Depends(get_db)):
    cursor = await db.execute("SELECT * FROM series WHERE id = ?", (series_id,))
    if not await cursor.fetchone():
        raise HTTPException(404, "Series not found")

    cursor = await db.execute(
        """SELECT s.*, sr.name as series_name
        FROM sessions s
        LEFT JOIN series sr ON s.series_id = sr.id
        WHERE s.series_id = ?
        ORDER BY s.created_at DESC""",
        (series_id,),
    )
    rows = await cursor.fetchall()
    results = []
    for row in rows:
        d = dict(row)
        if isinstance(d.get("context_metadata"), str):
            d["context_metadata"] = json.loads(d["context_metadata"])
        results.append(d)
    return results


@router.post("/{series_id}/sessions/{session_id}", status_code=200)
async def add_session_to_series(
    series_id: str, session_id: str, db=Depends(get_db)
):
    """Add an existing session to a series (retroactive)."""
    cursor = await db.execute("SELECT * FROM series WHERE id = ?", (series_id,))
    if not await cursor.fetchone():
        raise HTTPException(404, "Series not found")

    cursor = await db.execute("SELECT * FROM sessions WHERE id = ?", (session_id,))
    row = await cursor.fetchone()
    if not row:
        raise HTTPException(404, "Session not found")

    session = dict(row)
    old_series_id = session.get("series_id")

    await db.execute(
        "UPDATE sessions SET series_id = ? WHERE id = ?",
        (series_id, session_id),
    )

    # Update session counts
    await db.execute(
        "UPDATE series SET session_count = session_count + 1 WHERE id = ?",
        (series_id,),
    )
    if old_series_id and old_series_id != series_id:
        await db.execute(
            "UPDATE series SET session_count = MAX(session_count - 1, 0) WHERE id = ?",
            (old_series_id,),
        )

    await db.commit()
    return {"ok": True}


@router.delete("/{series_id}/sessions/{session_id}", status_code=200)
async def remove_session_from_series(
    series_id: str, session_id: str, db=Depends(get_db)
):
    """Remove a session from a series."""
    cursor = await db.execute("SELECT * FROM series WHERE id = ?", (series_id,))
    if not await cursor.fetchone():
        raise HTTPException(404, "Series not found")

    cursor = await db.execute(
        "SELECT * FROM sessions WHERE id = ? AND series_id = ?",
        (session_id, series_id),
    )
    if not await cursor.fetchone():
        raise HTTPException(404, "Session not in this series")

    await db.execute(
        "UPDATE sessions SET series_id = NULL WHERE id = ?",
        (session_id,),
    )
    await db.execute(
        "UPDATE series SET session_count = MAX(session_count - 1, 0) WHERE id = ?",
        (series_id,),
    )
    await db.commit()
    return {"ok": True}
