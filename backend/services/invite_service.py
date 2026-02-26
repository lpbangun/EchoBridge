"""Invite link service — create, list, revoke, claim invites."""

import hashlib
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

import aiosqlite


INVITE_EXPIRY_DAYS = 7

_SKILL_MD_CANDIDATES = [
    Path(__file__).resolve().parent.parent / "SKILL.md",  # Docker: /app/SKILL.md
    Path(__file__).resolve().parent.parent / "openclaw-skill" / "echobridge" / "SKILL.md",  # Dev
]


def _find_skill_md() -> Path | None:
    for p in _SKILL_MD_CANDIDATES:
        if p.exists():
            return p
    return None


def generate_token() -> str:
    return f"echobridge_invite_{secrets.token_urlsafe(16)}"


async def create_invite(db: aiosqlite.Connection, label: str) -> dict:
    """Create a new invite with a 7-day expiry."""
    invite_id = str(uuid.uuid4())
    token = generate_token()
    now = datetime.now(timezone.utc)
    expires_at = now + timedelta(days=INVITE_EXPIRY_DAYS)

    await db.execute(
        "INSERT INTO invites (id, token, label, created_at, expires_at) VALUES (?, ?, ?, ?, ?)",
        (invite_id, token, label, now.isoformat(), expires_at.isoformat()),
    )
    await db.commit()

    return {
        "id": invite_id,
        "token": token,
        "label": label,
        "created_at": now.isoformat(),
        "expires_at": expires_at.isoformat(),
        "claimed_at": None,
        "api_key_id": None,
    }


async def list_invites(db: aiosqlite.Connection) -> list[dict]:
    """List all invites, newest first."""
    cursor = await db.execute(
        "SELECT id, token, label, created_at, expires_at, claimed_at, api_key_id "
        "FROM invites ORDER BY created_at DESC"
    )
    rows = await cursor.fetchall()
    return [
        {
            "id": row["id"],
            "token": row["token"],
            "label": row["label"],
            "created_at": row["created_at"],
            "expires_at": row["expires_at"],
            "claimed_at": row["claimed_at"],
            "api_key_id": row["api_key_id"],
        }
        for row in rows
    ]


async def revoke_invite(db: aiosqlite.Connection, invite_id: str) -> bool:
    """Delete an unclaimed invite. Returns True if deleted, False if not found or already claimed."""
    cursor = await db.execute(
        "DELETE FROM invites WHERE id = ? AND claimed_at IS NULL",
        (invite_id,),
    )
    await db.commit()
    return cursor.rowcount > 0


async def get_invite_by_token(db: aiosqlite.Connection, token: str) -> dict | None:
    """Fetch an invite by its token."""
    cursor = await db.execute(
        "SELECT id, token, label, created_at, expires_at, claimed_at, api_key_id "
        "FROM invites WHERE token = ?",
        (token,),
    )
    row = await cursor.fetchone()
    if not row:
        return None
    return {
        "id": row["id"],
        "token": row["token"],
        "label": row["label"],
        "created_at": row["created_at"],
        "expires_at": row["expires_at"],
        "claimed_at": row["claimed_at"],
        "api_key_id": row["api_key_id"],
    }


async def claim_invite(
    db: aiosqlite.Connection,
    token: str,
    agent_name: str,
    base_url: str,
) -> dict:
    """Claim an invite: validate, create API key, mark claimed, build SKILL.md.

    Raises ValueError for invalid/expired/claimed invites.
    """
    invite = await get_invite_by_token(db, token)
    if not invite:
        raise ValueError("Invite not found")

    if invite["claimed_at"]:
        raise ValueError("Invite already claimed")

    # Check expiry
    if invite["expires_at"]:
        expires = datetime.fromisoformat(invite["expires_at"])
        if expires.tzinfo is None:
            expires = expires.replace(tzinfo=timezone.utc)
        if datetime.now(timezone.utc) > expires:
            raise ValueError("Invite has expired")

    # Create API key for the agent
    key_id = str(uuid.uuid4())
    raw_key = f"scribe_sk_{secrets.token_urlsafe(32)}"
    key_hash = hashlib.sha256(raw_key.encode()).hexdigest()
    now = datetime.now(timezone.utc).isoformat()

    await db.execute(
        "INSERT INTO api_keys (id, name, key_hash, created_at) VALUES (?, ?, ?, ?)",
        (key_id, agent_name, key_hash, now),
    )

    # Mark invite as claimed
    await db.execute(
        "UPDATE invites SET claimed_at = ?, api_key_id = ? WHERE id = ?",
        (now, key_id, invite["id"]),
    )
    await db.commit()

    # Build SKILL.md with embedded values
    skill_content = _build_skill_content(base_url, raw_key)

    return {
        "api_key": raw_key,
        "api_key_id": key_id,
        "agent_name": agent_name,
        "skill_md": skill_content,
    }


def _build_skill_content(base_url: str, raw_key: str) -> str:
    """Read SKILL.md template and replace placeholders with actual values."""
    path = _find_skill_md()
    if not path:
        return f"# EchoBridge Skill\n\nBase URL: {base_url}\nAPI Key: {raw_key}\n\nSKILL.md template not found on server."

    content = path.read_text(encoding="utf-8")

    # Replace env placeholders with actual values
    content = content.replace("$ECHOBRIDGE_API_URL", base_url)
    content = content.replace("$ECHOBRIDGE_API_KEY", raw_key)

    # Update YAML frontmatter: remove requires.env since values are embedded
    content = content.replace(
        "    requires:\n      env: [ECHOBRIDGE_API_URL, ECHOBRIDGE_API_KEY]\n    primaryEnv: ECHOBRIDGE_API_KEY",
        "    # env vars embedded — no configuration required",
    )

    return content
