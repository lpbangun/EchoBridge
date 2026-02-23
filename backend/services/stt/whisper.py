"""faster-whisper STT service for uploaded audio files."""

from faster_whisper import WhisperModel
from services.stt.base import TranscriptResult
from config import settings

_model: WhisperModel | None = None

ACCEPTED_FORMATS = {".mp3", ".wav", ".m4a", ".webm", ".ogg"}


def _get_model() -> WhisperModel:
    """Lazy-load the Whisper model."""
    global _model
    if _model is None:
        _model = WhisperModel(
            settings.whisper_model,
            device=settings.whisper_device,
            compute_type=settings.whisper_compute_type,
        )
    return _model


async def transcribe_file(audio_path: str) -> TranscriptResult:
    """Transcribe an audio file using faster-whisper."""
    model = _get_model()
    segments, info = model.transcribe(
        audio_path,
        language="en",
        beam_size=5,
        vad_filter=True,
        vad_parameters={"min_silence_duration_ms": 500},
    )
    text = " ".join([seg.text.strip() for seg in segments])
    return TranscriptResult(text=text, duration_seconds=info.duration)
