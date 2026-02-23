"""Markdown export service — generates .md files with YAML frontmatter."""

import json
import os
import re
from datetime import datetime, timezone

from config import settings


def _slugify(text: str) -> str:
    """Convert text to a URL-safe slug."""
    text = text.lower().strip()
    text = re.sub(r"[^\w\s-]", "", text)
    text = re.sub(r"[\s_]+", "-", text)
    text = re.sub(r"-+", "-", text)
    return text[:60].rstrip("-")


def generate_filename(session: dict) -> str:
    """Generate filename: {YYYY-MM-DD}-{slug}.md"""
    created = session.get("created_at", "")
    try:
        dt = datetime.fromisoformat(created.replace("Z", "+00:00"))
        date_str = dt.strftime("%Y-%m-%d")
    except (ValueError, AttributeError):
        date_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    title = session.get("title") or session.get("context", "session")
    slug = _slugify(title)
    return f"{date_str}-{slug}.md"


def generate_markdown(
    session: dict,
    interpretation: dict | None = None,
    participants: list[dict] | None = None,
    room_code: str | None = None,
) -> str:
    """Generate full markdown with YAML frontmatter."""
    created = session.get("created_at", "")
    context = session.get("context", "")
    metadata = session.get("context_metadata", {})
    if isinstance(metadata, str):
        metadata = json.loads(metadata)

    duration_sec = session.get("duration_seconds", 0)
    duration_min = f"{duration_sec // 60}min" if duration_sec else "unknown"

    # Build frontmatter
    frontmatter_lines = [
        "---",
        f'id: "{session["id"]}"',
        f"date: {created}",
        f"type: {context}",
        f"duration: {duration_min}",
    ]

    # Add context metadata fields
    for key, val in metadata.items():
        if isinstance(val, str):
            frontmatter_lines.append(f'{key}: "{val}"')
        else:
            frontmatter_lines.append(f"{key}: {json.dumps(val)}")

    if room_code:
        frontmatter_lines.append(f'room: "{room_code}"')

    if participants:
        names = [p.get("name", "Unknown") for p in participants]
        frontmatter_lines.append(f"participants: [{', '.join(names)}]")

    model = interpretation.get("model", "") if interpretation else settings.default_model
    frontmatter_lines.extend([
        f"model: {model}",
        "source: echobridge",
        "---",
    ])

    parts = ["\n".join(frontmatter_lines), ""]

    # Title
    title = session.get("title") or f"{context.replace('_', ' ').title()} Notes"
    parts.append(f"# {title}")
    parts.append("")

    # Interpretation markdown body
    if interpretation and interpretation.get("output_markdown"):
        output = interpretation["output_markdown"]
        # Strip any embedded frontmatter from the AI output
        if output.startswith("---"):
            fm_end = output.find("---", 3)
            if fm_end != -1:
                output = output[fm_end + 3:].strip()
        parts.append(output)
    else:
        parts.append("*No interpretation generated yet.*")

    parts.append("")

    # Transcript
    if settings.include_transcript_in_md and session.get("transcript"):
        parts.extend([
            "<details>",
            "<summary>Full Transcript</summary>",
            "",
            session["transcript"],
            "",
            "</details>",
        ])

    return "\n".join(parts)


async def save_markdown(
    session: dict,
    interpretation: dict | None = None,
    participants: list[dict] | None = None,
    room_code: str | None = None,
) -> str:
    """Save markdown to the output directory. Returns the file path."""
    content = generate_markdown(session, interpretation, participants, room_code)
    filename = generate_filename(session)

    output_dir = settings.output_dir
    os.makedirs(output_dir, exist_ok=True)

    filepath = os.path.join(output_dir, filename)
    with open(filepath, "w", encoding="utf-8") as f:
        f.write(content)

    return filepath
