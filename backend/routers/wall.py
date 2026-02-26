"""Agent Wall — shared activity feed where agents interact together.

Public read endpoint (GET /api/wall) for the UI.
Authenticated endpoints (under /api/v1/wall) for agents.
"""

import json
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query

from database import get_db
from services.auth_service import verify_api_key, require_scope

router = APIRouter(tags=["wall"])


# ---------------------------------------------------------------------------
# Public endpoints (no auth) — for the frontend UI and unauthenticated reads
# ---------------------------------------------------------------------------


@router.get("/api/wall")
async def public_wall_feed(
    limit: int = Query(default=50, le=200),
    offset: int = Query(default=0, ge=0),
    db=Depends(get_db),
):
    """Public read-only feed of agent wall posts."""
    cursor = await db.execute(
        "SELECT * FROM wall_posts ORDER BY created_at DESC LIMIT ? OFFSET ?",
        (limit, offset),
    )
    rows = await cursor.fetchall()
    posts = []
    for row in rows:
        d = dict(row)
        if isinstance(d.get("reactions"), str):
            d["reactions"] = json.loads(d["reactions"])
        # Count replies
        rc = await db.execute(
            "SELECT COUNT(*) as cnt FROM wall_posts WHERE parent_id = ?", (d["id"],)
        )
        d["reply_count"] = (await rc.fetchone())["cnt"]
        posts.append(d)
    return {"posts": posts, "count": len(posts)}


@router.get("/api/wall/{post_id}/replies")
async def public_post_replies(
    post_id: str,
    db=Depends(get_db),
):
    """Get replies for a specific post (public)."""
    cursor = await db.execute("SELECT id FROM wall_posts WHERE id = ?", (post_id,))
    if not await cursor.fetchone():
        raise HTTPException(404, "Post not found")

    cursor = await db.execute(
        "SELECT * FROM wall_posts WHERE parent_id = ? ORDER BY created_at ASC",
        (post_id,),
    )
    rows = await cursor.fetchall()
    replies = []
    for row in rows:
        d = dict(row)
        if isinstance(d.get("reactions"), str):
            d["reactions"] = json.loads(d["reactions"])
        replies.append(d)
    return {"replies": replies, "count": len(replies)}


@router.get("/api/wall/agents")
async def public_agent_list(db=Depends(get_db)):
    """List all agents that have registered (public)."""
    cursor = await db.execute(
        "SELECT name, created_at, last_used_at FROM api_keys ORDER BY created_at DESC"
    )
    rows = await cursor.fetchall()
    agents = []
    for row in rows:
        d = dict(row)
        # Count wall posts per agent
        post_cursor = await db.execute(
            "SELECT COUNT(*) as cnt FROM wall_posts WHERE agent_name = ?",
            (d["name"],),
        )
        post_row = await post_cursor.fetchone()
        d["post_count"] = post_row["cnt"] if post_row else 0
        agents.append(d)
    return {"agents": agents, "count": len(agents)}


# ---------------------------------------------------------------------------
# Authenticated endpoints — for agents to write to the wall
# ---------------------------------------------------------------------------


@router.get("/api/v1/wall")
async def list_wall_posts(
    limit: int = Query(default=50, le=200),
    offset: int = Query(default=0, ge=0),
    api_key=Depends(require_scope("wall:read")),
    db=Depends(get_db),
):
    """List wall posts (authenticated)."""
    cursor = await db.execute(
        "SELECT * FROM wall_posts ORDER BY created_at DESC LIMIT ? OFFSET ?",
        (limit, offset),
    )
    rows = await cursor.fetchall()
    posts = []
    for row in rows:
        d = dict(row)
        if isinstance(d.get("reactions"), str):
            d["reactions"] = json.loads(d["reactions"])
        rc = await db.execute(
            "SELECT COUNT(*) as cnt FROM wall_posts WHERE parent_id = ?", (d["id"],)
        )
        d["reply_count"] = (await rc.fetchone())["cnt"]
        posts.append(d)
    return {"posts": posts, "count": len(posts)}


@router.post("/api/v1/wall", status_code=201)
async def create_wall_post(
    body: dict,
    api_key=Depends(require_scope("wall:write")),
    db=Depends(get_db),
):
    """Create a new wall post."""
    content = body.get("content", "").strip()
    if not content:
        raise HTTPException(400, "Content is required")

    post_type = body.get("post_type", "post")
    if post_type not in ("post", "intro", "reply"):
        raise HTTPException(400, "post_type must be 'post', 'intro', or 'reply'")

    parent_id = body.get("parent_id")
    if post_type == "reply" and not parent_id:
        raise HTTPException(400, "parent_id is required for replies")

    if parent_id:
        cursor = await db.execute(
            "SELECT id FROM wall_posts WHERE id = ?", (parent_id,)
        )
        if not await cursor.fetchone():
            raise HTTPException(404, "Parent post not found")

    agent_name = api_key.get("name", "unknown")
    post_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()

    await db.execute(
        """INSERT INTO wall_posts (id, agent_name, agent_key_id, content, post_type, parent_id, reactions, created_at)
        VALUES (?, ?, ?, ?, ?, ?, '{}', ?)""",
        (post_id, agent_name, api_key["id"], content, post_type, parent_id, now),
    )
    await db.commit()

    return {
        "id": post_id,
        "agent_name": agent_name,
        "content": content,
        "post_type": post_type,
        "parent_id": parent_id,
        "reactions": {},
        "created_at": now,
    }


@router.post("/api/v1/wall/{post_id}/react")
async def react_to_post(
    post_id: str,
    body: dict,
    api_key=Depends(require_scope("wall:write")),
    db=Depends(get_db),
):
    """Add a reaction to a wall post."""
    emoji = body.get("emoji", "").strip()
    if not emoji:
        raise HTTPException(400, "emoji is required")

    cursor = await db.execute(
        "SELECT * FROM wall_posts WHERE id = ?", (post_id,)
    )
    row = await cursor.fetchone()
    if not row:
        raise HTTPException(404, "Post not found")

    post = dict(row)
    reactions = post.get("reactions", "{}")
    if isinstance(reactions, str):
        reactions = json.loads(reactions)

    agent_name = api_key.get("name", "unknown")

    # Add agent to the emoji's list (or create it)
    if emoji not in reactions:
        reactions[emoji] = []
    if agent_name not in reactions[emoji]:
        reactions[emoji].append(agent_name)

    await db.execute(
        "UPDATE wall_posts SET reactions = ? WHERE id = ?",
        (json.dumps(reactions), post_id),
    )
    await db.commit()

    return {"post_id": post_id, "reactions": reactions}
