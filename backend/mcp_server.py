"""EchoBridge MCP server — exposes meeting data as tools and resources."""

import hashlib
import json
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from dataclasses import dataclass

import aiosqlite
from mcp.server.fastmcp import Context, FastMCP
from mcp.server.session import ServerSession

from config import settings
from database import get_db


# ---------------------------------------------------------------------------
# Lifespan: provide DB connection to all tools via context
# ---------------------------------------------------------------------------

@dataclass
class AppContext:
    db: aiosqlite.Connection


@asynccontextmanager
async def mcp_lifespan(server: FastMCP) -> AsyncIterator[AppContext]:
    db = await get_db()
    yield AppContext(db=db)


mcp = FastMCP(
    "EchoBridge",
    lifespan=mcp_lifespan,
    streamable_http_path="/",
)


# ---------------------------------------------------------------------------
# Auth middleware (ASGI) for the HTTP transport
# ---------------------------------------------------------------------------

class MCPAuthMiddleware:
    """Validates Bearer scribe_sk_... tokens against the api_keys table."""

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] == "http":
            headers = dict(scope.get("headers", []))
            auth = headers.get(b"authorization", b"").decode()

            if not auth.startswith("Bearer scribe_sk_"):
                await self._send_401(send, "Missing or invalid API key")
                return

            token = auth[7:]  # Strip "Bearer "
            key_hash = hashlib.sha256(token.encode()).hexdigest()

            db = await get_db()
            cursor = await db.execute(
                "SELECT id FROM api_keys WHERE key_hash = ?", (key_hash,)
            )
            row = await cursor.fetchone()
            if not row:
                await self._send_401(send, "Invalid API key")
                return

        await self.app(scope, receive, send)

    @staticmethod
    async def _send_401(send, message: str):
        body = json.dumps({"error": message}).encode()
        await send({
            "type": "http.response.start",
            "status": 401,
            "headers": [
                [b"content-type", b"application/json"],
                [b"content-length", str(len(body)).encode()],
            ],
        })
        await send({"type": "http.response.body", "body": body})


def create_mcp_app():
    """Return the MCP HTTP app wrapped with auth middleware."""
    return MCPAuthMiddleware(mcp.streamable_http_app())


# ---------------------------------------------------------------------------
# Helper to get DB from tool context
# ---------------------------------------------------------------------------

def _db(ctx: Context) -> aiosqlite.Connection:
    return ctx.request_context.lifespan_context.db


# ---------------------------------------------------------------------------
# 11 Tools
# ---------------------------------------------------------------------------

@mcp.tool()
async def search_sessions(
    query: str,
    ctx: Context,
    limit: int = 20,
) -> str:
    """Search across meeting sessions and interpretations using full-text search.
    Returns matching sessions with relevance snippets."""
    from services.search_service import search
    results = await search(_db(ctx), query, limit)
    return json.dumps(results, default=str)


@mcp.tool()
async def list_sessions(
    ctx: Context,
    context: str | None = None,
    series_id: str | None = None,
    limit: int = 20,
    offset: int = 0,
) -> str:
    """List meeting sessions, optionally filtered by context type or series.
    Context types: class_lecture, startup_meeting, research_discussion, working_session, talk_seminar."""
    db = _db(ctx)
    query = "SELECT s.*, sr.name as series_name FROM sessions s LEFT JOIN series sr ON s.series_id = sr.id"
    params: list = []
    conditions = []

    if context:
        conditions.append("s.context = ?")
        params.append(context)
    if series_id:
        conditions.append("s.series_id = ?")
        params.append(series_id)

    if conditions:
        query += " WHERE " + " AND ".join(conditions)

    query += " ORDER BY s.created_at DESC LIMIT ? OFFSET ?"
    params.extend([limit, offset])

    cursor = await db.execute(query, params)
    rows = await cursor.fetchall()
    sessions = []
    for row in rows:
        d = dict(row)
        if isinstance(d.get("context_metadata"), str):
            d["context_metadata"] = json.loads(d["context_metadata"])
        sessions.append(d)
    return json.dumps(sessions, default=str)


@mcp.tool()
async def get_session(session_id: str, ctx: Context) -> str:
    """Get a meeting session by ID, including its primary interpretation notes."""
    db = _db(ctx)
    cursor = await db.execute(
        """SELECT s.*, sr.name as series_name
        FROM sessions s LEFT JOIN series sr ON s.series_id = sr.id
        WHERE s.id = ?""",
        (session_id,),
    )
    row = await cursor.fetchone()
    if not row:
        return json.dumps({"error": "Session not found"})

    session = dict(row)
    if isinstance(session.get("context_metadata"), str):
        session["context_metadata"] = json.loads(session["context_metadata"])

    # Include primary interpretation
    cursor = await db.execute(
        "SELECT * FROM interpretations WHERE session_id = ? AND is_primary = 1 LIMIT 1",
        (session_id,),
    )
    interp_row = await cursor.fetchone()
    session["primary_interpretation"] = dict(interp_row) if interp_row else None

    return json.dumps(session, default=str)


@mcp.tool()
async def get_transcript(session_id: str, ctx: Context) -> str:
    """Get the raw transcript text for a meeting session."""
    db = _db(ctx)
    cursor = await db.execute(
        "SELECT transcript FROM sessions WHERE id = ?", (session_id,)
    )
    row = await cursor.fetchone()
    if not row:
        return json.dumps({"error": "Session not found"})
    return row["transcript"] or ""


@mcp.tool()
async def get_interpretations(session_id: str, ctx: Context) -> str:
    """Get all interpretations (AI-generated notes) for a meeting session."""
    db = _db(ctx)
    cursor = await db.execute(
        "SELECT * FROM interpretations WHERE session_id = ? ORDER BY created_at DESC",
        (session_id,),
    )
    rows = await cursor.fetchall()
    return json.dumps([dict(r) for r in rows], default=str)


@mcp.tool()
async def interpret_session(
    session_id: str,
    ctx: Context,
    lens_id: str | None = None,
    system_prompt: str | None = None,
    socket_id: str | None = None,
    model: str | None = None,
) -> str:
    """Run an AI interpretation on a meeting session.
    Provide exactly one of: lens_id (preset lens), system_prompt (custom), or socket_id (structured output).
    Available lenses: class_lecture, startup_meeting, research_discussion, working_session, talk_seminar."""
    from services.interpret_service import (
        interpret_with_custom,
        interpret_with_lens,
        interpret_with_socket,
    )

    db = _db(ctx)

    # Fetch session
    cursor = await db.execute(
        "SELECT id, transcript, context, context_metadata, series_id FROM sessions WHERE id = ?",
        (session_id,),
    )
    row = await cursor.fetchone()
    if not row:
        return json.dumps({"error": "Session not found"})
    session = dict(row)

    if not session.get("transcript"):
        return json.dumps({"error": "Session has no transcript"})

    # Get memory context if in a series
    memory_context = None
    if session.get("series_id"):
        cursor = await db.execute(
            "SELECT memory_document FROM series WHERE id = ?",
            (session["series_id"],),
        )
        series_row = await cursor.fetchone()
        if series_row and series_row["memory_document"]:
            memory_context = series_row["memory_document"]

    metadata = session.get("context_metadata", "{}")
    if isinstance(metadata, str):
        metadata = json.loads(metadata)

    if lens_id:
        result = await interpret_with_lens(
            session_id=session_id,
            transcript=session["transcript"],
            lens_id=lens_id,
            model=model,
            context_metadata=metadata,
            source_type="agent",
            source_name="MCP Client",
            db=db,
            memory_context=memory_context,
        )
    elif system_prompt:
        result = await interpret_with_custom(
            session_id=session_id,
            transcript=session["transcript"],
            system_prompt=system_prompt,
            model=model,
            source_type="agent",
            source_name="MCP Client",
            db=db,
            memory_context=memory_context,
        )
    elif socket_id:
        cursor = await db.execute(
            "SELECT * FROM sockets WHERE id = ?", (socket_id,)
        )
        socket_row = await cursor.fetchone()
        if not socket_row:
            return json.dumps({"error": f"Socket not found: {socket_id}"})
        socket_data = dict(socket_row)
        if isinstance(socket_data.get("output_schema"), str):
            socket_data["output_schema"] = json.loads(socket_data["output_schema"])
        result = await interpret_with_socket(
            session_id=session_id,
            transcript=session["transcript"],
            socket_data=socket_data,
            model=model,
            source_type="agent",
            source_name="MCP Client",
            db=db,
            memory_context=memory_context,
        )
    else:
        return json.dumps({"error": "Provide lens_id, system_prompt, or socket_id"})

    return json.dumps(result, default=str)


@mcp.tool()
async def ask_meetings(
    question: str,
    ctx: Context,
    limit: int = 5,
) -> str:
    """Ask a question across all your meetings. Uses AI to search and synthesize
    an answer from your meeting transcripts and notes, citing specific meetings."""
    from services.ask_service import ask_across_meetings
    result = await ask_across_meetings(question, _db(ctx), limit=limit)
    return json.dumps(result, default=str)


@mcp.tool()
async def list_series(ctx: Context) -> str:
    """List all meeting series (recurring meeting groups with persistent memory)."""
    db = _db(ctx)
    cursor = await db.execute(
        "SELECT * FROM series ORDER BY updated_at DESC"
    )
    rows = await cursor.fetchall()
    return json.dumps([dict(r) for r in rows], default=str)


@mcp.tool()
async def get_series_memory(series_id: str, ctx: Context) -> str:
    """Get the memory document for a meeting series — a living summary that persists across sessions."""
    db = _db(ctx)
    cursor = await db.execute(
        "SELECT id, name, description, memory_document, session_count FROM series WHERE id = ?",
        (series_id,),
    )
    row = await cursor.fetchone()
    if not row:
        return json.dumps({"error": "Series not found"})
    return json.dumps(dict(row), default=str)


@mcp.tool()
async def list_sockets(ctx: Context) -> str:
    """List all available sockets (structured output interpreters with JSON schemas)."""
    from sockets.presets import PRESET_SOCKETS

    db = _db(ctx)

    # Ensure presets exist in DB
    for preset in PRESET_SOCKETS:
        await db.execute(
            """INSERT OR IGNORE INTO sockets (id, name, description, category, system_prompt, output_schema, is_preset)
            VALUES (?, ?, ?, ?, ?, ?, 1)""",
            (preset["id"], preset["name"], preset["description"],
             preset["category"], preset["system_prompt"],
             json.dumps(preset["output_schema"])),
        )
    await db.commit()

    cursor = await db.execute("SELECT * FROM sockets ORDER BY is_preset DESC, name")
    rows = await cursor.fetchall()
    results = []
    for r in rows:
        d = dict(r)
        if isinstance(d.get("output_schema"), str):
            d["output_schema"] = json.loads(d["output_schema"])
        results.append(d)
    return json.dumps(results, default=str)


@mcp.tool()
async def export_markdown(session_id: str, ctx: Context) -> str:
    """Export a meeting session as markdown with YAML frontmatter."""
    from services.markdown_service import generate_markdown

    db = _db(ctx)

    cursor = await db.execute("SELECT * FROM sessions WHERE id = ?", (session_id,))
    row = await cursor.fetchone()
    if not row:
        return json.dumps({"error": "Session not found"})
    session = dict(row)

    cursor = await db.execute(
        "SELECT * FROM interpretations WHERE session_id = ? AND is_primary = 1 LIMIT 1",
        (session_id,),
    )
    interp_row = await cursor.fetchone()
    interpretation = dict(interp_row) if interp_row else None

    md = generate_markdown(session, interpretation)
    return md


# ---------------------------------------------------------------------------
# 5 Resources
# ---------------------------------------------------------------------------

@mcp.resource("session://{session_id}")
async def resource_session(session_id: str) -> str:
    """Get a meeting session as JSON."""
    db = await get_db()
    cursor = await db.execute(
        """SELECT s.*, sr.name as series_name
        FROM sessions s LEFT JOIN series sr ON s.series_id = sr.id
        WHERE s.id = ?""",
        (session_id,),
    )
    row = await cursor.fetchone()
    if not row:
        return json.dumps({"error": "Session not found"})
    d = dict(row)
    if isinstance(d.get("context_metadata"), str):
        d["context_metadata"] = json.loads(d["context_metadata"])
    return json.dumps(d, default=str)


@mcp.resource("session://{session_id}/transcript")
async def resource_transcript(session_id: str) -> str:
    """Get the raw transcript for a meeting session."""
    db = await get_db()
    cursor = await db.execute(
        "SELECT transcript FROM sessions WHERE id = ?", (session_id,)
    )
    row = await cursor.fetchone()
    if not row:
        return "Session not found"
    return row["transcript"] or ""


@mcp.resource("series://{series_id}/memory")
async def resource_series_memory(series_id: str) -> str:
    """Get the memory document for a meeting series."""
    db = await get_db()
    cursor = await db.execute(
        "SELECT memory_document FROM series WHERE id = ?", (series_id,)
    )
    row = await cursor.fetchone()
    if not row:
        return "Series not found"
    return row["memory_document"] or ""


@mcp.resource("config://lenses")
def resource_lenses() -> str:
    """List all available interpretation lenses."""
    from lenses.base import list_lenses
    return json.dumps(list_lenses())


@mcp.resource("config://sockets")
async def resource_sockets() -> str:
    """List all available sockets (structured output interpreters)."""
    from sockets.presets import PRESET_SOCKETS
    return json.dumps([
        {"id": s["id"], "name": s["name"], "description": s["description"], "category": s["category"]}
        for s in PRESET_SOCKETS
    ])
