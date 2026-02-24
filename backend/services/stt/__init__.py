"""STT factory — routes to the configured provider."""

from config import settings
from services.stt.base import TranscriptResult


async def transcribe_file(audio_path: str) -> TranscriptResult:
    """Route to the configured STT provider."""
    if settings.stt_provider == "openai" and settings.openai_api_key:
        from services.stt.openai_stt import transcribe_file as openai_transcribe

        return await openai_transcribe(audio_path)
    else:
        from services.stt.whisper import transcribe_file as whisper_transcribe

        return await whisper_transcribe(audio_path)
