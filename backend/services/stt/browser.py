"""Browser STT service — receives transcript chunks from Web Speech API."""

from services.stt.base import TranscriptResult


def assemble_transcript(chunks: list[dict]) -> TranscriptResult:
    """Assemble final transcript from browser STT chunks.

    Each chunk has: text (str), is_final (bool), timestamp_ms (int)
    """
    final_texts = [c["text"] for c in chunks if c.get("is_final")]
    text = " ".join(final_texts)
    duration = chunks[-1]["timestamp_ms"] / 1000.0 if chunks else 0.0
    return TranscriptResult(text=text, duration_seconds=duration)
