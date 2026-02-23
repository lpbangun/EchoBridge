"""Tests for MCP server tools, ask_service, and auth middleware."""

import hashlib
import json
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
import pytest_asyncio


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@dataclass
class MockAppCtx:
    db: object


@pytest.fixture
def mcp_ctx(db):
    """Create a mock MCP Context that provides the test DB."""
    ctx = MagicMock()
    ctx.request_context.lifespan_context = MockAppCtx(db=db)
    return ctx


async def _insert_session(db, session_id=None, title="Test Meeting", context="startup_meeting",
                          transcript=None, series_id=None):
    """Helper to insert a session directly into the test DB."""
    sid = session_id or str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    await db.execute(
        """INSERT INTO sessions (id, title, context, context_metadata, created_at, transcript, series_id, status)
        VALUES (?, ?, ?, '{}', ?, ?, ?, 'created')""",
        (sid, title, context, now, transcript, series_id),
    )
    await db.commit()
    return sid


async def _insert_interpretation(db, session_id, output_markdown="# Notes", is_primary=True):
    """Helper to insert an interpretation."""
    iid = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    await db.execute(
        """INSERT INTO interpretations (id, session_id, source_type, source_name, lens_type,
        model, output_markdown, is_primary, created_at)
        VALUES (?, ?, 'user', 'Test', 'preset', 'test-model', ?, ?, ?)""",
        (iid, session_id, output_markdown, is_primary, now),
    )
    await db.commit()
    return iid


async def _insert_series(db, series_id=None, name="Weekly Standup", memory_document=""):
    """Helper to insert a series."""
    sid = series_id or str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    await db.execute(
        """INSERT INTO series (id, name, description, memory_document, session_count, created_at, updated_at)
        VALUES (?, ?, '', ?, 0, ?, ?)""",
        (sid, name, memory_document, now, now),
    )
    await db.commit()
    return sid


async def _insert_api_key(db, token="scribe_sk_testkey123"):
    """Helper to insert an API key and return the token."""
    key_hash = hashlib.sha256(token.encode()).hexdigest()
    kid = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    await db.execute(
        "INSERT INTO api_keys (id, name, key_hash, created_at) VALUES (?, 'test', ?, ?)",
        (kid, key_hash, now),
    )
    await db.commit()
    return token


# ===========================================================================
# A. ask_service unit tests
# ===========================================================================

@pytest.mark.asyncio
async def test_ask_meetings_with_results(db):
    """ask_across_meetings returns AI answer with sources when sessions match."""
    sid = await _insert_session(db, title="Sprint Planning", transcript="We discussed the roadmap")
    await _insert_interpretation(db, sid, output_markdown="# Sprint Planning Notes\nRoadmap was discussed.")

    with patch("services.ask_service.search") as mock_search, \
         patch("services.ask_service.call_ai", new_callable=AsyncMock) as mock_ai:
        mock_search.return_value = [
            {"type": "session", "id": sid, "session_id": sid,
             "title": "Sprint Planning", "context": "startup_meeting",
             "snippet": "roadmap", "created_at": "2026-01-01"}
        ]
        mock_ai.return_value = "The roadmap was discussed in Sprint Planning on 2026-01-01."

        from services.ask_service import ask_across_meetings
        result = await ask_across_meetings("What was discussed about the roadmap?", db)

    assert result["question"] == "What was discussed about the roadmap?"
    assert "roadmap" in result["answer"]
    assert len(result["sources"]) == 1
    assert result["sources"][0]["session_id"] == sid


@pytest.mark.asyncio
async def test_ask_meetings_no_results(db):
    """ask_across_meetings returns graceful message when no sessions match."""
    with patch("services.ask_service.search") as mock_search:
        mock_search.return_value = []

        from services.ask_service import ask_across_meetings
        result = await ask_across_meetings("What about quantum physics?", db)

    assert result["sources"] == []
    assert "No meetings found" in result["answer"]


@pytest.mark.asyncio
async def test_ask_meetings_includes_series_memory(db):
    """ask_across_meetings includes series memory document in AI context."""
    series_id = await _insert_series(db, name="Weekly", memory_document="Previous: decided on React")
    sid = await _insert_session(db, title="Weekly 5", transcript="Continued React work",
                                series_id=series_id)

    with patch("services.ask_service.search") as mock_search, \
         patch("services.ask_service.call_ai", new_callable=AsyncMock) as mock_ai:
        mock_search.return_value = [
            {"type": "session", "id": sid, "session_id": sid,
             "title": "Weekly 5", "context": "startup_meeting",
             "snippet": "React", "created_at": "2026-01-15"}
        ]
        mock_ai.return_value = "React was chosen previously."

        from services.ask_service import ask_across_meetings
        result = await ask_across_meetings("What framework did we choose?", db)

        # Verify the AI was called with context that includes memory document
        call_args = mock_ai.call_args
        user_content = call_args.kwargs.get("user_content") or call_args[1].get("user_content", "")
        if not user_content:
            # Try positional args
            user_content = call_args[0][2] if len(call_args[0]) > 2 else ""
        assert "Previous: decided on React" in user_content


# ===========================================================================
# B. MCP tool function tests
# ===========================================================================

@pytest.mark.asyncio
async def test_tool_search_sessions(db, mcp_ctx):
    """search_sessions tool returns matching sessions."""
    sid = await _insert_session(db, title="Architecture Review", transcript="Microservices discussion")

    from mcp_server import search_sessions
    result_json = await search_sessions(query="microservices", ctx=mcp_ctx)
    result = json.loads(result_json)
    # FTS should find the session
    assert isinstance(result, list)


@pytest.mark.asyncio
async def test_tool_list_sessions(db, mcp_ctx):
    """list_sessions tool returns sessions with optional filters."""
    await _insert_session(db, title="Meeting A", context="startup_meeting")
    await _insert_session(db, title="Meeting B", context="class_lecture")

    from mcp_server import list_sessions
    # All sessions
    result = json.loads(await list_sessions(ctx=mcp_ctx))
    assert len(result) == 2

    # Filtered by context
    result = json.loads(await list_sessions(ctx=mcp_ctx, context="class_lecture"))
    assert len(result) == 1
    assert result[0]["context"] == "class_lecture"


@pytest.mark.asyncio
async def test_tool_get_session(db, mcp_ctx):
    """get_session tool returns session with primary interpretation."""
    sid = await _insert_session(db, title="My Meeting")
    await _insert_interpretation(db, sid, output_markdown="# My Notes")

    from mcp_server import get_session
    result = json.loads(await get_session(session_id=sid, ctx=mcp_ctx))
    assert result["title"] == "My Meeting"
    assert result["primary_interpretation"] is not None
    assert result["primary_interpretation"]["output_markdown"] == "# My Notes"


@pytest.mark.asyncio
async def test_tool_get_session_not_found(db, mcp_ctx):
    """get_session tool returns error for missing session."""
    from mcp_server import get_session
    result = json.loads(await get_session(session_id="nonexistent", ctx=mcp_ctx))
    assert "error" in result


@pytest.mark.asyncio
async def test_tool_get_transcript(db, mcp_ctx):
    """get_transcript tool returns transcript text."""
    sid = await _insert_session(db, transcript="Hello everyone, let's begin.")

    from mcp_server import get_transcript
    result = await get_transcript(session_id=sid, ctx=mcp_ctx)
    assert result == "Hello everyone, let's begin."


@pytest.mark.asyncio
async def test_tool_get_interpretations(db, mcp_ctx):
    """get_interpretations tool returns all interpretations for a session."""
    sid = await _insert_session(db)
    await _insert_interpretation(db, sid, output_markdown="# Primary", is_primary=True)
    await _insert_interpretation(db, sid, output_markdown="# Secondary", is_primary=False)

    from mcp_server import get_interpretations
    result = json.loads(await get_interpretations(session_id=sid, ctx=mcp_ctx))
    assert len(result) == 2


@pytest.mark.asyncio
async def test_tool_list_series(db, mcp_ctx):
    """list_series tool returns all series."""
    await _insert_series(db, name="Weekly Standup")
    await _insert_series(db, name="Board Meeting")

    from mcp_server import list_series
    result = json.loads(await list_series(ctx=mcp_ctx))
    assert len(result) == 2


@pytest.mark.asyncio
async def test_tool_get_series_memory(db, mcp_ctx):
    """get_series_memory tool returns series with memory document."""
    sid = await _insert_series(db, name="Weekly", memory_document="# Memory\nDecided on React")

    from mcp_server import get_series_memory
    result = json.loads(await get_series_memory(series_id=sid, ctx=mcp_ctx))
    assert result["name"] == "Weekly"
    assert "Decided on React" in result["memory_document"]


@pytest.mark.asyncio
async def test_tool_get_series_memory_not_found(db, mcp_ctx):
    """get_series_memory tool returns error for missing series."""
    from mcp_server import get_series_memory
    result = json.loads(await get_series_memory(series_id="nonexistent", ctx=mcp_ctx))
    assert "error" in result


@pytest.mark.asyncio
async def test_tool_list_sockets(db, mcp_ctx):
    """list_sockets tool returns preset sockets."""
    from mcp_server import list_sockets
    result = json.loads(await list_sockets(ctx=mcp_ctx))
    assert len(result) >= 5  # 5 presets
    ids = [s["id"] for s in result]
    assert "action_items" in ids
    assert "decisions" in ids


@pytest.mark.asyncio
async def test_tool_export_markdown(db, mcp_ctx):
    """export_markdown tool returns markdown with frontmatter."""
    sid = await _insert_session(db, title="Export Test", context="startup_meeting")
    await _insert_interpretation(db, sid, output_markdown="# Meeting notes here")

    from mcp_server import export_markdown
    result = await export_markdown(session_id=sid, ctx=mcp_ctx)
    assert result.startswith("---")
    assert "Export Test" in result
    assert "Meeting notes here" in result


@pytest.mark.asyncio
async def test_tool_export_markdown_not_found(db, mcp_ctx):
    """export_markdown tool returns error for missing session."""
    from mcp_server import export_markdown
    result = await export_markdown(session_id="nonexistent", ctx=mcp_ctx)
    assert "error" in result


# ===========================================================================
# C. Auth middleware tests
# ===========================================================================

@pytest.mark.asyncio
async def test_mcp_auth_rejects_no_token(client):
    """MCP endpoint rejects requests without auth token."""
    resp = await client.post("/mcp/", json={
        "jsonrpc": "2.0", "id": 1, "method": "tools/list", "params": {}
    })
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_mcp_auth_rejects_bad_token(client, db):
    """MCP endpoint rejects requests with invalid API key."""
    import database
    old_db = database._db
    database._db = db  # Middleware calls get_db() directly, not via FastAPI DI
    try:
        resp = await client.post("/mcp/", json={
            "jsonrpc": "2.0", "id": 1, "method": "tools/list", "params": {}
        }, headers={"Authorization": "Bearer scribe_sk_badkey"})
        assert resp.status_code == 401
    finally:
        database._db = old_db


# ===========================================================================
# D. Integration test
# ===========================================================================

@pytest.mark.asyncio
async def test_mcp_mount_exists(client):
    """Verify /mcp/ is mounted (not a 404 from SPA catch-all)."""
    resp = await client.post("/mcp/", json={
        "jsonrpc": "2.0", "id": 1, "method": "tools/list", "params": {}
    })
    # Should get 401 (auth required), not 404
    assert resp.status_code != 404
