"""Base STT types."""

from dataclasses import dataclass, field


@dataclass
class TranscriptSegment:
    """A segment of transcript attributed to a single speaker."""
    text: str
    speaker: int | None  # Speaker index or None
    start: float         # Start time (seconds)
    end: float           # End time (seconds)


@dataclass
class TranscriptResult:
    text: str
    duration_seconds: float
    segments: list[TranscriptSegment] = field(default_factory=list)
    is_diarized: bool = False
