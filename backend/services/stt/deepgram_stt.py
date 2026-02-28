"""Deepgram STT service for uploaded audio files."""

import httpx
from config import settings
from services.stt.base import TranscriptResult, TranscriptSegment


def _group_words_into_segments(words: list[dict]) -> list[TranscriptSegment]:
    """Group consecutive same-speaker words into TranscriptSegments."""
    if not words:
        return []

    segments: list[TranscriptSegment] = []
    current_speaker = words[0].get("speaker")
    current_words: list[str] = [words[0].get("punctuated_word") or words[0].get("word", "")]
    current_start = words[0].get("start", 0.0)
    current_end = words[0].get("end", 0.0)

    for word in words[1:]:
        speaker = word.get("speaker")
        word_text = word.get("punctuated_word") or word.get("word", "")
        word_start = word.get("start", 0.0)
        word_end = word.get("end", 0.0)

        if speaker == current_speaker:
            # Same speaker — extend current segment
            current_words.append(word_text)
            current_end = word_end
        else:
            # Speaker changed — finalize current segment and start new one
            segments.append(TranscriptSegment(
                text=" ".join(current_words),
                speaker=current_speaker,
                start=current_start,
                end=current_end,
            ))
            current_speaker = speaker
            current_words = [word_text]
            current_start = word_start
            current_end = word_end

    # Finalize the last segment
    segments.append(TranscriptSegment(
        text=" ".join(current_words),
        speaker=current_speaker,
        start=current_start,
        end=current_end,
    ))

    return segments


def _format_diarized_text(segments: list[TranscriptSegment]) -> str:
    """Format segments as `[Speaker N]: text` lines."""
    lines: list[str] = []
    for seg in segments:
        if seg.speaker is not None:
            lines.append(f"[Speaker {seg.speaker}]: {seg.text}")
        else:
            lines.append(seg.text)
    return "\n".join(lines)


async def transcribe_file(audio_path: str) -> TranscriptResult:
    """Transcribe an audio file using Deepgram's API."""
    diarize = settings.deepgram_diarize

    async with httpx.AsyncClient(timeout=300) as client:
        with open(audio_path, "rb") as f:
            audio_data = f.read()

        params = {
            "model": settings.deepgram_model,
            "smart_format": "true",
            "punctuate": "true",
        }
        if diarize:
            params["diarize"] = "true"

        response = await client.post(
            "https://api.deepgram.com/v1/listen",
            headers={
                "Authorization": f"Token {settings.deepgram_api_key}",
                "Content-Type": "application/octet-stream",
            },
            params=params,
            content=audio_data,
        )
        response.raise_for_status()
        data = response.json()

        # Extract transcript from Deepgram response
        channels = data.get("results", {}).get("channels", [])
        duration = data.get("metadata", {}).get("duration", 0.0)

        if not channels:
            return TranscriptResult(text="", duration_seconds=0.0)

        alternatives = channels[0].get("alternatives", [])
        if not alternatives:
            return TranscriptResult(text="", duration_seconds=0.0)

        alt = alternatives[0]

        # If diarization is enabled, parse word-level speaker labels
        if diarize:
            words = alt.get("words", [])
            # Check if any word actually has speaker info
            has_speakers = any(w.get("speaker") is not None for w in words)

            if words and has_speakers:
                segments = _group_words_into_segments(words)
                text = _format_diarized_text(segments)
                return TranscriptResult(
                    text=text,
                    duration_seconds=duration,
                    segments=segments,
                    is_diarized=True,
                )

        # Fallback: plain transcript (no diarization or no speaker data)
        text = alt.get("transcript", "")
        return TranscriptResult(text=text, duration_seconds=duration)
