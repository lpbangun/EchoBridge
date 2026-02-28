"""Tests for interpretation endpoints."""

import pytest
from unittest.mock import AsyncMock, patch


# ---------------------------------------------------------------------------
# Helper: create a session that already has a transcript
# ---------------------------------------------------------------------------


async def _create_session_with_transcript(client, sample_session, transcript="Test transcript about startup decisions."):
    """Create a session and attach a browser STT transcript to it."""
    res = await client.post("/api/sessions", json=sample_session)
    sid = res.json()["id"]
    await client.post(
        f"/api/sessions/{sid}/transcript",
        json={"transcript": transcript, "duration_seconds": 60},
    )
    return sid


# ---------------------------------------------------------------------------
# POST /api/sessions/{id}/interpret — Validation & error tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_interpret_session_not_found(client):
    """Interpreting a non-existent session returns 404."""
    res = await client.post(
        "/api/sessions/nonexistent/interpret",
        json={"lens_type": "preset", "lens_id": "startup_meeting"},
    )
    assert res.status_code == 404


@pytest.mark.asyncio
async def test_interpret_no_transcript(client, sample_session):
    """Interpreting a session that has no transcript returns 400."""
    res = await client.post("/api/sessions", json=sample_session)
    sid = res.json()["id"]

    res = await client.post(
        f"/api/sessions/{sid}/interpret",
        json={"lens_type": "preset", "lens_id": "startup_meeting"},
    )
    assert res.status_code == 400
    assert "no transcript" in res.json()["detail"].lower()


@pytest.mark.asyncio
async def test_interpret_invalid_lens_type(client, sample_session):
    """Using an invalid lens_type returns 422 (Pydantic validation)."""
    res = await client.post("/api/sessions", json=sample_session)
    sid = res.json()["id"]

    res = await client.post(
        f"/api/sessions/{sid}/interpret",
        json={"lens_type": "invalid_type"},
    )
    assert res.status_code == 422


@pytest.mark.asyncio
async def test_interpret_custom_without_prompt(client, sample_session):
    """Custom lens without a system_prompt returns 400."""
    sid = await _create_session_with_transcript(client, sample_session)

    res = await client.post(
        f"/api/sessions/{sid}/interpret",
        json={"lens_type": "custom"},
    )
    assert res.status_code == 400
    assert "system_prompt" in res.json()["detail"].lower()


@pytest.mark.asyncio
async def test_interpret_socket_without_lens_id(client, sample_session):
    """Socket lens without a lens_id returns 400."""
    sid = await _create_session_with_transcript(client, sample_session)

    res = await client.post(
        f"/api/sessions/{sid}/interpret",
        json={"lens_type": "socket"},
    )
    assert res.status_code == 400


@pytest.mark.asyncio
async def test_interpret_socket_with_missing_socket(client, sample_session):
    """Socket lens with a non-existent socket ID returns 404."""
    sid = await _create_session_with_transcript(client, sample_session)

    res = await client.post(
        f"/api/sessions/{sid}/interpret",
        json={"lens_type": "socket", "lens_id": "nonexistent_socket"},
    )
    assert res.status_code == 404


@pytest.mark.asyncio
@patch("services.interpret_service.call_ai", new_callable=AsyncMock)
async def test_interpret_preset_happy_path(mock_ai, client, sample_session):
    """Preset lens interpretation succeeds when AI is mocked."""
    mock_ai.return_value = "## Meeting Summary\n\nKey decisions were made."

    sid = await _create_session_with_transcript(client, sample_session)

    res = await client.post(
        f"/api/sessions/{sid}/interpret",
        json={"lens_type": "preset", "lens_id": "startup_meeting"},
    )
    assert res.status_code == 200
    data = res.json()
    assert data["session_id"] == sid
    assert data["lens_type"] == "preset"
    assert data["lens_id"] == "startup_meeting"
    assert "Meeting Summary" in data["output_markdown"]
    assert data["is_primary"] is True
    assert "id" in data
    assert "created_at" in data

    # Verify AI was called
    mock_ai.assert_called_once()


@pytest.mark.asyncio
@patch("services.interpret_service.call_ai", new_callable=AsyncMock)
async def test_interpret_preset_defaults_to_context(mock_ai, client, sample_session):
    """Preset lens without lens_id defaults to session context."""
    mock_ai.return_value = "## Notes\n\nSome notes."

    sid = await _create_session_with_transcript(client, sample_session)

    res = await client.post(
        f"/api/sessions/{sid}/interpret",
        json={"lens_type": "preset"},
    )
    assert res.status_code == 200
    data = res.json()
    # Should default to the session context "startup_meeting"
    assert data["lens_id"] == "startup_meeting"


@pytest.mark.asyncio
@patch("services.interpret_service.call_ai", new_callable=AsyncMock)
async def test_interpret_custom_happy_path(mock_ai, client, sample_session):
    """Custom lens interpretation succeeds when AI is mocked."""
    mock_ai.return_value = "Custom summary output."

    sid = await _create_session_with_transcript(client, sample_session)

    res = await client.post(
        f"/api/sessions/{sid}/interpret",
        json={
            "lens_type": "custom",
            "system_prompt": "Summarize the key takeaways.",
        },
    )
    assert res.status_code == 200
    data = res.json()
    assert data["lens_type"] == "custom"
    assert data["output_markdown"] == "Custom summary output."
    assert data["is_primary"] is False


@pytest.mark.asyncio
@patch("services.interpret_service.call_ai", new_callable=AsyncMock)
async def test_interpret_updates_session_status(mock_ai, client, sample_session):
    """After interpretation the session status changes to 'complete'."""
    mock_ai.return_value = "Done."

    sid = await _create_session_with_transcript(client, sample_session)

    await client.post(
        f"/api/sessions/{sid}/interpret",
        json={"lens_type": "preset", "lens_id": "startup_meeting"},
    )

    res = await client.get(f"/api/sessions/{sid}")
    assert res.json()["status"] == "complete"


# ---------------------------------------------------------------------------
# GET /api/sessions/{id}/interpretations — List interpretations
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_list_interpretations_empty(client, sample_session):
    """New session has an empty interpretation list."""
    res = await client.post("/api/sessions", json=sample_session)
    sid = res.json()["id"]

    res = await client.get(f"/api/sessions/{sid}/interpretations")
    assert res.status_code == 200
    assert res.json() == []


@pytest.mark.asyncio
async def test_list_interpretations_not_found(client):
    """Listing interpretations for a non-existent session returns 404."""
    res = await client.get("/api/sessions/nonexistent/interpretations")
    assert res.status_code == 404


@pytest.mark.asyncio
@patch("services.interpret_service.call_ai", new_callable=AsyncMock)
async def test_list_interpretations_after_creating(mock_ai, client, sample_session):
    """After running interpretations they appear in the list."""
    mock_ai.return_value = "Interpretation output."

    sid = await _create_session_with_transcript(client, sample_session)

    # Create two interpretations
    await client.post(
        f"/api/sessions/{sid}/interpret",
        json={"lens_type": "preset", "lens_id": "startup_meeting"},
    )
    await client.post(
        f"/api/sessions/{sid}/interpret",
        json={"lens_type": "custom", "system_prompt": "List action items."},
    )

    res = await client.get(f"/api/sessions/{sid}/interpretations")
    assert res.status_code == 200
    data = res.json()
    assert len(data) == 2
    # Most recent first
    lens_types = [d["lens_type"] for d in data]
    assert "preset" in lens_types
    assert "custom" in lens_types
