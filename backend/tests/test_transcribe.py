"""Tests for transcription endpoints (browser STT + audio upload)."""

import struct

import pytest


def make_wav_bytes(duration_samples: int = 100, sample_rate: int = 16000) -> bytes:
    """Create a minimal valid WAV file in memory."""
    num_channels = 1
    bits_per_sample = 16
    data_size = duration_samples * num_channels * (bits_per_sample // 8)
    samples = b"\x00\x00" * duration_samples
    header = struct.pack(
        "<4sI4s4sIHHIIHH4sI",
        b"RIFF",
        36 + data_size,
        b"WAVE",
        b"fmt ",
        16,
        1,
        num_channels,
        sample_rate,
        sample_rate * num_channels * (bits_per_sample // 8),
        num_channels * (bits_per_sample // 8),
        bits_per_sample,
        b"data",
        data_size,
    )
    return header + samples


# ---------------------------------------------------------------------------
# POST /api/sessions/{id}/transcript — Browser STT submission
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_submit_transcript_happy_path(client, sample_session):
    """Submitting a browser STT transcript stores it on the session."""
    res = await client.post("/api/sessions", json=sample_session)
    sid = res.json()["id"]

    res = await client.post(
        f"/api/sessions/{sid}/transcript",
        json={"transcript": "Hello world, this is a test.", "duration_seconds": 120},
    )
    assert res.status_code == 200
    data = res.json()
    assert data["session_id"] == sid
    assert data["transcript_length"] == len("Hello world, this is a test.")
    assert data["duration_seconds"] == 120
    assert data["status"] == "processing"


@pytest.mark.asyncio
async def test_submit_transcript_updates_session(client, sample_session):
    """After submitting a transcript the session record reflects it."""
    res = await client.post("/api/sessions", json=sample_session)
    sid = res.json()["id"]

    await client.post(
        f"/api/sessions/{sid}/transcript",
        json={"transcript": "Meeting discussion content.", "duration_seconds": 60},
    )

    res = await client.get(f"/api/sessions/{sid}")
    assert res.status_code == 200
    session = res.json()
    assert session["transcript"] == "Meeting discussion content."
    assert session["status"] == "processing"
    assert session["stt_provider"] == "browser"


@pytest.mark.asyncio
async def test_submit_transcript_not_found(client):
    """Submitting a transcript for a missing session returns 404."""
    res = await client.post(
        "/api/sessions/nonexistent/transcript",
        json={"transcript": "Hello", "duration_seconds": 10},
    )
    assert res.status_code == 404


@pytest.mark.asyncio
async def test_submit_transcript_empty(client, sample_session):
    """Submitting an empty transcript string returns 400."""
    res = await client.post("/api/sessions", json=sample_session)
    sid = res.json()["id"]

    res = await client.post(
        f"/api/sessions/{sid}/transcript",
        json={"transcript": "", "duration_seconds": 0},
    )
    assert res.status_code == 400


@pytest.mark.asyncio
async def test_submit_transcript_missing_field(client, sample_session):
    """Submitting without a transcript field defaults to empty and returns 400."""
    res = await client.post("/api/sessions", json=sample_session)
    sid = res.json()["id"]

    res = await client.post(
        f"/api/sessions/{sid}/transcript",
        json={"duration_seconds": 30},
    )
    assert res.status_code == 400


# ---------------------------------------------------------------------------
# POST /api/sessions/{id}/audio — Audio file upload
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_upload_audio_not_found(client):
    """Uploading audio to a non-existent session returns 404."""
    wav = make_wav_bytes()
    res = await client.post(
        "/api/sessions/nonexistent/audio",
        files={"audio": ("test.wav", wav, "audio/wav")},
    )
    assert res.status_code == 404


@pytest.mark.asyncio
async def test_upload_audio_unsupported_format(client, sample_session):
    """Uploading an unsupported file type returns 400."""
    res = await client.post("/api/sessions", json=sample_session)
    sid = res.json()["id"]

    res = await client.post(
        f"/api/sessions/{sid}/audio",
        files={"audio": ("test.txt", b"not audio", "text/plain")},
    )
    assert res.status_code == 400
    assert "Unsupported format" in res.json()["detail"]


@pytest.mark.asyncio
async def test_upload_audio_wav_happy_path(client, sample_session, tmp_path, monkeypatch):
    """A valid WAV file is accepted and transcribed."""
    monkeypatch.setattr("config.settings.audio_dir", str(tmp_path))

    res = await client.post("/api/sessions", json=sample_session)
    sid = res.json()["id"]

    wav = make_wav_bytes()
    res = await client.post(
        f"/api/sessions/{sid}/audio",
        files={"audio": ("recording.wav", wav, "audio/wav")},
    )
    assert res.status_code == 200
    data = res.json()
    assert data["session_id"] == sid


@pytest.mark.asyncio
async def test_upload_audio_no_extension(client, sample_session):
    """Uploading a file with no extension returns 400."""
    res = await client.post("/api/sessions", json=sample_session)
    sid = res.json()["id"]

    res = await client.post(
        f"/api/sessions/{sid}/audio",
        files={"audio": ("recording", b"data", "application/octet-stream")},
    )
    assert res.status_code == 400
