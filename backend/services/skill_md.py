"""Shared SKILL.md file resolution."""

from pathlib import Path

_SKILL_MD_CANDIDATES = [
    Path(__file__).resolve().parent.parent / "SKILL.md",  # Docker: /app/SKILL.md
    Path(__file__).resolve().parent.parent.parent / "openclaw-skill" / "echobridge" / "SKILL.md",  # Dev
]


def find_skill_md() -> Path | None:
    """Find the SKILL.md file from known candidate paths."""
    for p in _SKILL_MD_CANDIDATES:
        if p.exists():
            return p
    return None
