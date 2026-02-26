"""Agent API authentication service."""

import hashlib
from datetime import datetime, timezone

from fastapi import Depends, HTTPException, Request

from database import get_db

ALL_SCOPES = frozenset([
    "sessions:read",
    "sessions:write",
    "rooms:write",
    "wall:read",
    "wall:write",
])


def _parse_scopes(raw: str | None) -> list[str]:
    """Convert comma-separated scopes string to list. None = all scopes."""
    if raw is None:
        return list(ALL_SCOPES)
    return [s.strip() for s in raw.split(",") if s.strip()]


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

    result = dict(row)
    raw_scopes = result.pop("scopes", None)
    result["scopes"] = _parse_scopes(raw_scopes)
    result["has_all_scopes"] = raw_scopes is None
    return result


async def verify_api_key_token(token: str, db) -> dict | None:
    """Verify a raw API key string (for WebSocket auth, not HTTP requests).

    Returns {"name": key_name, "id": key_id, "scopes": [...]} if valid, None if not.
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

    raw_scopes = row["scopes"] if "scopes" in row.keys() else None
    return {
        "name": row["name"],
        "id": row["id"],
        "scopes": _parse_scopes(raw_scopes),
        "has_all_scopes": raw_scopes is None,
    }


def require_scope(scope: str):
    """FastAPI dependency factory that chains verify_api_key and checks scope.

    Keys with NULL scopes in DB (has_all_scopes=True) always pass.
    Keys with explicit scopes must include the required scope.
    """
    async def _check(request: Request, db=Depends(get_db)) -> dict:
        api_key = await verify_api_key(request, db)
        if api_key.get("has_all_scopes"):
            return api_key
        if scope not in api_key.get("scopes", []):
            raise HTTPException(403, f"API key missing required scope: {scope}")
        return api_key
    return _check
