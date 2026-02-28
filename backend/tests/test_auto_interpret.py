"""Tests for auto_interpret functionality."""

import pytest
from unittest.mock import AsyncMock, patch


# ---------------------------------------------------------------------------
# Helper: create a session with a transcript directly in the database
# ---------------------------------------------------------------------------


async def _create_session_with_transcript(client, sample_session, transcript="Test transcript about meeting decisions and action items."):
    """Create a session and attach a browser STT transcript to it."""
    res = await client.post("/api/sessions", json=sample_session)
    sid = res.json()["id"]
    await client.post(
        f"/api/sessions/{sid}/transcript",
        json={"transcript": transcript, "duration_seconds": 120},
    )
    return sid


async def _create_session_no_transcript(client, sample_session):
    """Create a session without a transcript."""
    res = await client.post("/api/sessions", json=sample_session)
    return res.json()["id"]


# ---------------------------------------------------------------------------
# auto_interpret — happy path
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@patch("services.interpret_service.call_ai", new_callable=AsyncMock)
async def test_auto_interpret_happy_path(mock_ai, client, db, sample_session):
    """auto_interpret creates a primary interpretation using smart_notes lens."""
    mock_ai.return_value = "## Summary\n\nKey decisions were discussed.\n\n## Action Items\n\n- [ ] Follow up on Q3 plan"

    sid = await _create_session_with_transcript(client, sample_session)

    from services.interpret_service import auto_interpret

    result = await auto_interpret(sid, db)

    assert result is not None
    assert result["session_id"] == sid
    assert result["lens_type"] == "preset"
    assert result["lens_id"] == "smart_notes"
    assert result["source_type"] == "system"
    assert result["source_name"] == "EchoBridge"
    assert result["is_primary"] is True
    assert "Summary" in result["output_markdown"]

    # Verify it was stored in the database
    cursor = await db.execute(
        "SELECT * FROM interpretations WHERE session_id = ? AND is_primary = 1",
        (sid,),
    )
    row = await cursor.fetchone()
    assert row is not None
    assert row["lens_id"] == "smart_notes"
    assert row["source_type"] == "system"

    # Verify AI was called
    mock_ai.assert_called_once()


# ---------------------------------------------------------------------------
# auto_interpret — empty transcript returns None
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_auto_interpret_empty_transcript(client, db, sample_session):
    """auto_interpret returns None when session has no transcript."""
    sid = await _create_session_no_transcript(client, sample_session)

    from services.interpret_service import auto_interpret

    result = await auto_interpret(sid, db)
    assert result is None


# ---------------------------------------------------------------------------
# auto_interpret — missing session returns None
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_auto_interpret_missing_session(db):
    """auto_interpret returns None for a non-existent session."""
    from services.interpret_service import auto_interpret

    result = await auto_interpret("nonexistent-session-id", db)
    assert result is None
