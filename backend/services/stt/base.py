"""Base STT types."""

from dataclasses import dataclass


@dataclass
class TranscriptResult:
    text: str
    duration_seconds: float
