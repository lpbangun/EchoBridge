"""Tests for STT factory and OpenAI STT service."""

import pytest
from unittest.mock import AsyncMock, patch, MagicMock

from services.stt.base import TranscriptResult


# ---------------------------------------------------------------------------
# OpenAI STT service — openai_stt.transcribe_file
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_openai_stt_transcribe_file(tmp_path):
    """OpenAI STT service calls the API and returns a TranscriptResult."""
    audio_file = tmp_path / "test.wav"
    audio_file.write_bytes(b"fake-audio-data")

    mock_response = MagicMock()
    mock_response.raise_for_status = MagicMock()
    mock_response.json.return_value = {
        "text": "Hello world from OpenAI.",
        "duration": 42.5,
    }

    mock_client = AsyncMock()
    mock_client.post = AsyncMock(return_value=mock_response)
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)

    with patch("services.stt.openai_stt.httpx.AsyncClient", return_value=mock_client):
        with patch("services.stt.openai_stt.settings") as mock_settings:
            mock_settings.openai_api_key = "sk-test-key"
            mock_settings.openai_stt_model = "whisper-1"

            from services.stt.openai_stt import transcribe_file

            result = await transcribe_file(str(audio_file))

    assert isinstance(result, TranscriptResult)
    assert result.text == "Hello world from OpenAI."
    assert result.duration_seconds == 42.5


@pytest.mark.asyncio
async def test_openai_stt_uses_configured_model(tmp_path):
    """OpenAI STT sends the configured model name in the request."""
    audio_file = tmp_path / "test.wav"
    audio_file.write_bytes(b"fake-audio-data")

    mock_response = MagicMock()
    mock_response.raise_for_status = MagicMock()
    mock_response.json.return_value = {"text": "Test.", "duration": 1.0}

    mock_client = AsyncMock()
    mock_client.post = AsyncMock(return_value=mock_response)
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)

    with patch("services.stt.openai_stt.httpx.AsyncClient", return_value=mock_client):
        with patch("services.stt.openai_stt.settings") as mock_settings:
            mock_settings.openai_api_key = "sk-test-key"
            mock_settings.openai_stt_model = "gpt-4o-transcribe"

            from services.stt.openai_stt import transcribe_file

            await transcribe_file(str(audio_file))

    # Verify the model was sent in the request
    call_kwargs = mock_client.post.call_args
    assert call_kwargs.kwargs["data"]["model"] == "gpt-4o-transcribe"


# ---------------------------------------------------------------------------
# STT factory — services.stt.transcribe_file
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_factory_routes_to_openai_when_configured():
    """Factory uses OpenAI when stt_provider='openai' and API key is set."""
    mock_result = TranscriptResult(text="OpenAI result", duration_seconds=10.0)

    with patch("services.stt.settings") as mock_settings:
        mock_settings.stt_provider = "openai"
        mock_settings.openai_api_key = "sk-test"

        with patch(
            "services.stt.openai_stt.transcribe_file",
            new_callable=AsyncMock,
            return_value=mock_result,
        ) as mock_openai:
            from services.stt import transcribe_file

            result = await transcribe_file("/fake/path.wav")

    assert result.text == "OpenAI result"
    mock_openai.assert_called_once_with("/fake/path.wav")


@pytest.mark.asyncio
async def test_factory_routes_to_whisper_when_local():
    """Factory uses local whisper when stt_provider='local'."""
    mock_result = TranscriptResult(text="Local result", duration_seconds=5.0)

    with patch("services.stt.settings") as mock_settings:
        mock_settings.stt_provider = "local"
        mock_settings.openai_api_key = ""

        with patch(
            "services.stt.whisper.transcribe_file",
            new_callable=AsyncMock,
            return_value=mock_result,
        ) as mock_whisper:
            from services.stt import transcribe_file

            result = await transcribe_file("/fake/path.wav")

    assert result.text == "Local result"
    mock_whisper.assert_called_once_with("/fake/path.wav")


@pytest.mark.asyncio
async def test_factory_falls_back_when_no_api_key():
    """Factory falls back to local whisper when openai is selected but no key."""
    mock_result = TranscriptResult(text="Fallback result", duration_seconds=3.0)

    with patch("services.stt.settings") as mock_settings:
        mock_settings.stt_provider = "openai"
        mock_settings.openai_api_key = ""

        with patch(
            "services.stt.whisper.transcribe_file",
            new_callable=AsyncMock,
            return_value=mock_result,
        ) as mock_whisper:
            from services.stt import transcribe_file

            result = await transcribe_file("/fake/path.wav")

    assert result.text == "Fallback result"
    mock_whisper.assert_called_once()


# ---------------------------------------------------------------------------
# Settings API — STT fields
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_settings_include_stt_fields(client):
    """GET /api/settings includes the new STT provider fields."""
    res = await client.get("/api/settings")
    assert res.status_code == 200
    data = res.json()
    assert "stt_provider" in data
    assert "openai_stt_model" in data
    assert data["stt_provider"] == "local"
    assert data["openai_stt_model"] == "whisper-1"


@pytest.mark.asyncio
async def test_update_stt_provider(client):
    """PUT /api/settings can change the STT provider."""
    res = await client.put(
        "/api/settings",
        json={"stt_provider": "openai"},
    )
    assert res.status_code == 200
    assert res.json()["stt_provider"] == "openai"

    # Reset
    await client.put("/api/settings", json={"stt_provider": "local"})


@pytest.mark.asyncio
async def test_update_openai_stt_model(client):
    """PUT /api/settings can change the OpenAI STT model."""
    res = await client.put(
        "/api/settings",
        json={"openai_stt_model": "gpt-4o-transcribe"},
    )
    assert res.status_code == 200
    assert res.json()["openai_stt_model"] == "gpt-4o-transcribe"

    # Reset
    await client.put("/api/settings", json={"openai_stt_model": "whisper-1"})
