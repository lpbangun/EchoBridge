"""OpenAI Whisper API STT service for uploaded audio files."""

import httpx
from config import settings
from services.stt.base import TranscriptResult


async def transcribe_file(audio_path: str) -> TranscriptResult:
    """Transcribe an audio file using OpenAI's Whisper API."""
    async with httpx.AsyncClient(timeout=300) as client:
        with open(audio_path, "rb") as f:
            response = await client.post(
                "https://api.openai.com/v1/audio/transcriptions",
                headers={"Authorization": f"Bearer {settings.openai_api_key}"},
                files={"file": f},
                data={
                    "model": settings.openai_stt_model,
                    "response_format": "verbose_json",
                },
            )
        response.raise_for_status()
        data = response.json()
        return TranscriptResult(
            text=data.get("text", ""),
            duration_seconds=data.get("duration", 0.0),
        )
