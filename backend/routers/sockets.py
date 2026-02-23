"""Socket CRUD router."""

import json
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException

from database import get_db
from models.schemas import SocketCreate, SocketResponse
from sockets.presets import PRESET_SOCKETS

router = APIRouter(prefix="/api/sockets", tags=["sockets"])


async def _ensure_presets(db):
    """Insert preset sockets if they don't exist."""
    for socket in PRESET_SOCKETS:
        cursor = await db.execute("SELECT id FROM sockets WHERE id = ?", (socket["id"],))
        if not await cursor.fetchone():
            await db.execute(
                """INSERT INTO sockets (id, name, description, category, system_prompt, output_schema, is_preset)
                VALUES (?, ?, ?, ?, ?, ?, 1)""",
                (socket["id"], socket["name"], socket["description"],
                 socket["category"], socket["system_prompt"],
                 json.dumps(socket["output_schema"])),
            )
    await db.commit()


@router.get("", response_model=list[SocketResponse])
async def list_sockets(db=Depends(get_db)):
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


@router.get("/{socket_id}", response_model=SocketResponse)
async def get_socket(socket_id: str, db=Depends(get_db)):
    await _ensure_presets(db)
    cursor = await db.execute("SELECT * FROM sockets WHERE id = ?", (socket_id,))
    row = await cursor.fetchone()
    if not row:
        raise HTTPException(404, "Socket not found")
    d = dict(row)
    if isinstance(d.get("output_schema"), str):
        d["output_schema"] = json.loads(d["output_schema"])
    return d


@router.post("", response_model=SocketResponse)
async def create_socket(body: SocketCreate, db=Depends(get_db)):
    now = datetime.now(timezone.utc).isoformat()
    await db.execute(
        """INSERT INTO sockets (id, name, description, category, system_prompt, output_schema, is_preset, created_at)
        VALUES (?, ?, ?, ?, ?, ?, 0, ?)""",
        (body.id, body.name, body.description, body.category,
         body.system_prompt, json.dumps(body.output_schema), now),
    )
    await db.commit()

    return SocketResponse(
        id=body.id,
        name=body.name,
        description=body.description,
        category=body.category,
        system_prompt=body.system_prompt,
        output_schema=body.output_schema,
        is_preset=False,
        created_at=now,
    )
