"""Agent API authentication service."""

import hashlib
from datetime import datetime, timezone

from fastapi import Depends, HTTPException, Request

from database import get_db


async def verify_api_key(request: Request, db=Depends(get_db)) -> dict:
    """Verify bearer token against stored API key hashes."""
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        raise HTTPException(401, "Missing or invalid Authorization header")

    token = auth[7:]  # Strip "Bearer "
    if not token.startswith("scribe_sk_"):
        raise HTTPException(401, "Invalid API key format")

    key_hash = hashlib.sha256(token.encode()).hexdigest()
    cursor = await db.execute(
        "SELECT * FROM api_keys WHERE key_hash = ?", (key_hash,)
    )
    row = await cursor.fetchone()
    if not row:
        raise HTTPException(401, "Invalid API key")

    # Update last used
    now = datetime.now(timezone.utc).isoformat()
    await db.execute(
        "UPDATE api_keys SET last_used_at = ? WHERE id = ?",
        (now, row["id"]),
    )
    await db.commit()

    return dict(row)


async def verify_api_key_token(token: str, db) -> dict | None:
    """Verify a raw API key string (for WebSocket auth, not HTTP requests).

    Returns {"name": key_name, "id": key_id} if valid, None if not.
    """
    if not token.startswith("scribe_sk_"):
        return None

    key_hash = hashlib.sha256(token.encode()).hexdigest()
    cursor = await db.execute(
        "SELECT * FROM api_keys WHERE key_hash = ?", (key_hash,)
    )
    row = await cursor.fetchone()
    if not row:
        return None

    now = datetime.now(timezone.utc).isoformat()
    await db.execute(
        "UPDATE api_keys SET last_used_at = ? WHERE id = ?",
        (now, row["id"]),
    )
    await db.commit()

    return {"name": row["name"], "id": row["id"]}
