"""Tests for export endpoints (markdown generation + file save)."""

import os

import pytest
from unittest.mock import AsyncMock, patch


# ---------------------------------------------------------------------------
# Helper: create a session with a transcript (and optionally an interpretation)
# ---------------------------------------------------------------------------


async def _create_session_with_transcript(client, sample_session):
    """Create a session and attach a transcript."""
    res = await client.post("/api/sessions", json=sample_session)
    sid = res.json()["id"]
    await client.post(
        f"/api/sessions/{sid}/transcript",
        json={
            "transcript": "This is a test transcript about startup decisions.",
            "duration_seconds": 60,
        },
    )
    return sid


async def _create_session_with_interpretation(client, sample_session):
    """Create a session, transcript, and a mocked interpretation."""
    sid = await _create_session_with_transcript(client, sample_session)
    with patch(
        "services.interpret_service.call_ai",
        new_callable=AsyncMock,
        return_value="## Summary\n\nKey decisions were discussed.",
    ):
        await client.post(
            f"/api/sessions/{sid}/interpret",
            json={"lens_type": "preset", "lens_id": "startup_meeting"},
        )
    return sid


# ---------------------------------------------------------------------------
# GET /api/sessions/{id}/export/md — Markdown export
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_export_markdown_not_found(client):
    """Exporting a non-existent session returns 404."""
    res = await client.get("/api/sessions/nonexistent/export/md")
    assert res.status_code == 404


@pytest.mark.asyncio
async def test_export_markdown_no_transcript(client, sample_session):
    """Exporting a session with no transcript still returns markdown (with placeholder text)."""
    res = await client.post("/api/sessions", json=sample_session)
    sid = res.json()["id"]

    res = await client.get(f"/api/sessions/{sid}/export/md")
    assert res.status_code == 200
    # The endpoint returns text/markdown via PlainTextResponse
    assert "text/markdown" in res.headers.get("content-type", "")
    body = res.text
    # Should contain the placeholder since there is no interpretation
    assert "No interpretation generated yet" in body


@pytest.mark.asyncio
async def test_export_markdown_with_transcript(client, sample_session):
    """Exporting a session that has a transcript returns valid markdown."""
    sid = await _create_session_with_transcript(client, sample_session)

    res = await client.get(f"/api/sessions/{sid}/export/md")
    assert res.status_code == 200
    body = res.text
    # Should contain YAML frontmatter
    assert body.startswith("---")
    assert "type: startup_meeting" in body
    # Should contain the session title
    assert "Test Meeting" in body


@pytest.mark.asyncio
async def test_export_markdown_with_interpretation(client, sample_session):
    """Exporting after an interpretation includes the AI output."""
    sid = await _create_session_with_interpretation(client, sample_session)

    res = await client.get(f"/api/sessions/{sid}/export/md")
    assert res.status_code == 200
    body = res.text
    assert "Key decisions were discussed" in body
    assert "---" in body  # frontmatter present


@pytest.mark.asyncio
async def test_export_markdown_frontmatter_fields(client, sample_session):
    """The frontmatter contains expected metadata fields."""
    sid = await _create_session_with_transcript(client, sample_session)

    res = await client.get(f"/api/sessions/{sid}/export/md")
    body = res.text
    # Verify key frontmatter fields
    assert f'id: "{sid}"' in body
    assert "date:" in body
    assert "type: startup_meeting" in body
    assert "duration:" in body
    assert "model:" in body
    assert "source: echobridge" in body


@pytest.mark.asyncio
async def test_export_markdown_includes_transcript_in_details(client, sample_session):
    """When include_transcript_in_md is true, the full transcript appears in <details>."""
    sid = await _create_session_with_transcript(client, sample_session)

    res = await client.get(f"/api/sessions/{sid}/export/md")
    body = res.text
    # config.settings.include_transcript_in_md defaults to True
    assert "<details>" in body
    assert "Full Transcript" in body
    assert "test transcript about startup decisions" in body


@pytest.mark.asyncio
async def test_export_markdown_context_metadata(client):
    """Context metadata from the session is reflected in the frontmatter."""
    session_data = {
        "title": "Planning Call",
        "context": "startup_meeting",
        "context_metadata": {"project": "Alpha", "sprint": "3"},
        "host_name": "Tester",
    }
    res = await client.post("/api/sessions", json=session_data)
    sid = res.json()["id"]
    await client.post(
        f"/api/sessions/{sid}/transcript",
        json={"transcript": "Discussion about Alpha project.", "duration_seconds": 30},
    )

    res = await client.get(f"/api/sessions/{sid}/export/md")
    body = res.text
    assert 'project: "Alpha"' in body
    assert 'sprint: "3"' in body


# ---------------------------------------------------------------------------
# POST /api/sessions/{id}/export/save — Save to output directory
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_save_export_not_found(client):
    """Saving export for a non-existent session returns 404."""
    res = await client.post("/api/sessions/nonexistent/export/save")
    assert res.status_code == 404


@pytest.mark.asyncio
async def test_save_export_happy_path(client, sample_session, tmp_path, monkeypatch):
    """Saving export writes a .md file to the output directory."""
    monkeypatch.setattr("config.settings.output_dir", str(tmp_path))

    sid = await _create_session_with_transcript(client, sample_session)

    res = await client.post(f"/api/sessions/{sid}/export/save")
    assert res.status_code == 200
    data = res.json()
    assert data["ok"] is True
    assert data["filepath"].endswith(".md")

    # Verify the file actually exists on disk
    assert os.path.exists(data["filepath"])


@pytest.mark.asyncio
async def test_save_export_file_content(client, sample_session, tmp_path, monkeypatch):
    """The saved file contains valid markdown with frontmatter."""
    monkeypatch.setattr("config.settings.output_dir", str(tmp_path))

    sid = await _create_session_with_interpretation(client, sample_session)

    res = await client.post(f"/api/sessions/{sid}/export/save")
    filepath = res.json()["filepath"]

    with open(filepath, "r", encoding="utf-8") as f:
        content = f.read()

    assert content.startswith("---")
    assert "Test Meeting" in content
    assert "Key decisions were discussed" in content


@pytest.mark.asyncio
async def test_save_export_filename_format(client, sample_session, tmp_path, monkeypatch):
    """The saved filename follows the {YYYY-MM-DD}-{slug}.md pattern."""
    monkeypatch.setattr("config.settings.output_dir", str(tmp_path))

    sid = await _create_session_with_transcript(client, sample_session)

    res = await client.post(f"/api/sessions/{sid}/export/save")
    filepath = res.json()["filepath"]
    filename = os.path.basename(filepath)

    # Should match pattern like 2026-02-22-test-meeting.md
    assert filename.endswith(".md")
    parts = filename.split("-", 3)  # YYYY-MM-DD-slug.md
    assert len(parts) >= 4
    # First three parts should be date components (digits)
    assert parts[0].isdigit()
    assert parts[1].isdigit()
    assert parts[2].isdigit()
