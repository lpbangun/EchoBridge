"""Deepgram STT service for uploaded audio files."""

import httpx
from config import settings
from services.stt.base import TranscriptResult


async def transcribe_file(audio_path: str) -> TranscriptResult:
    """Transcribe an audio file using Deepgram's API."""
    async with httpx.AsyncClient(timeout=300) as client:
        with open(audio_path, "rb") as f:
            audio_data = f.read()

        response = await client.post(
            "https://api.deepgram.com/v1/listen",
            headers={
                "Authorization": f"Token {settings.deepgram_api_key}",
                "Content-Type": "application/octet-stream",
            },
            params={
                "model": settings.deepgram_model,
                "smart_format": "true",
                "punctuate": "true",
            },
            content=audio_data,
        )
        response.raise_for_status()
        data = response.json()

        # Extract transcript from Deepgram response
        channels = data.get("results", {}).get("channels", [])
        if channels:
            alternatives = channels[0].get("alternatives", [])
            if alternatives:
                text = alternatives[0].get("transcript", "")
                duration = data.get("metadata", {}).get("duration", 0.0)
                return TranscriptResult(text=text, duration_seconds=duration)

        return TranscriptResult(text="", duration_seconds=0.0)
