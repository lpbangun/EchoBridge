"""Memory synthesis engine — maintains living memory documents for session series."""

import logging
from datetime import datetime, timezone

from config import settings
from services.ai_service import call_openrouter

logger = logging.getLogger(__name__)

MEMORY_SYNTHESIS_PROMPT = """You are a meeting memory synthesizer. You maintain a living memory document that evolves with each meeting in a series.

Your job: Given the current memory document and a new session's interpretation, produce an UPDATED memory document.

Rules:
- PRESERVE all existing information unless it's clearly superseded
- ADD new decisions, action items, threads, and people from the new session
- MARK action items as complete ([x]) if the new session indicates they're done
- REMOVE open threads only when explicitly resolved
- Keep the document self-contained — someone reading only this document should understand the full history
- Be concise but complete. Every entry should have enough context to be useful on its own.
- Use the exact section structure below. Do not add or rename sections.
- Temperature is low — be deterministic and factual, not creative.

Output the complete updated memory document in this exact format:

# Meeting Memory: {series_name}

## Decisions Log
<!-- Chronological decisions with date and source session title -->

## Action Items
<!-- Living checklist: - [ ] or - [x] with owners when known -->

## Open Threads
<!-- Recurring topics or unresolved discussions. Remove when resolved. -->

## Key People & Entities
<!-- Who's mentioned and their role/context -->

## Timeline
<!-- Reverse-chronological: newest first. 2-3 sentence summary per session. -->

## Patterns & Insights
<!-- Cross-session observations the AI notices -->
"""

MEMORY_REFRESH_PROMPT = """You are a meeting memory synthesizer. You are rebuilding a memory document from scratch using all sessions in a series.

Given a list of sessions with their interpretations (in chronological order), produce a comprehensive memory document.

Rules:
- Synthesize ALL sessions into a single coherent memory
- Track decisions chronologically
- Maintain action items (mark completed ones with [x] if later sessions indicate completion)
- Identify recurring threads and patterns across sessions
- Note key people and their roles
- Create a timeline with 2-3 sentence summaries per session

Output the complete memory document in this exact format:

# Meeting Memory: {series_name}

## Decisions Log
## Action Items
## Open Threads
## Key People & Entities
## Timeline
## Patterns & Insights
"""


async def synthesize_memory(
    series_name: str,
    current_memory: str,
    session_title: str,
    session_date: str,
    new_interpretation: str,
    model: str | None,
) -> str:
    """Call AI to update memory document with new session info."""
    model = model or settings.default_model

    user_content = f"""CURRENT MEMORY DOCUMENT:
{current_memory or "(empty — this is the first session in the series)"}

---

NEW SESSION: "{session_title}" ({session_date})
INTERPRETATION:
{new_interpretation}

---

Produce the complete updated memory document."""

    prompt = MEMORY_SYNTHESIS_PROMPT.replace("{series_name}", series_name)

    return await call_openrouter(
        model=model,
        system_prompt=prompt,
        user_content=user_content,
        temperature=0.2,
        max_tokens=4096,
    )


async def synthesize_and_store_memory(
    series_id: str,
    session: dict,
    interpretation_markdown: str,
    model: str | None,
    db,
) -> None:
    """Fire-and-forget wrapper: fetch current memory, synthesize, store result."""
    try:
        cursor = await db.execute(
            "SELECT name, memory_document FROM series WHERE id = ?",
            (series_id,),
        )
        row = await cursor.fetchone()
        if not row:
            return

        series_name = row["name"]
        current_memory = row["memory_document"] or ""

        updated_memory = await synthesize_memory(
            series_name=series_name,
            current_memory=current_memory,
            session_title=session.get("title") or "Untitled Session",
            session_date=session.get("created_at", ""),
            new_interpretation=interpretation_markdown,
            model=model,
        )

        now = datetime.now(timezone.utc).isoformat()
        await db.execute(
            "UPDATE series SET memory_document = ?, updated_at = ? WHERE id = ?",
            (updated_memory, now, series_id),
        )
        await db.commit()
    except Exception:
        logger.exception("Failed to synthesize memory for series %s", series_id)


async def refresh_memory_from_scratch(
    series_id: str,
    model: str | None,
    db,
) -> str:
    """Rebuild memory from all sessions in order (expensive, for manual refresh)."""
    model = model or settings.default_model

    cursor = await db.execute(
        "SELECT name FROM series WHERE id = ?", (series_id,)
    )
    row = await cursor.fetchone()
    if not row:
        raise ValueError(f"Series not found: {series_id}")

    series_name = row["name"]

    # Get all sessions in the series, ordered chronologically
    cursor = await db.execute(
        """SELECT s.id, s.title, s.created_at, s.transcript
        FROM sessions s
        WHERE s.series_id = ?
        ORDER BY s.created_at ASC""",
        (series_id,),
    )
    sessions = [dict(r) for r in await cursor.fetchall()]

    if not sessions:
        empty_memory = f"# Meeting Memory: {series_name}\n\n## Decisions Log\n\n## Action Items\n\n## Open Threads\n\n## Key People & Entities\n\n## Timeline\n\n## Patterns & Insights\n"
        now = datetime.now(timezone.utc).isoformat()
        await db.execute(
            "UPDATE series SET memory_document = ?, updated_at = ? WHERE id = ?",
            (empty_memory, now, series_id),
        )
        await db.commit()
        return empty_memory

    # Build a combined document of all sessions and their interpretations
    session_texts = []
    for sess in sessions:
        cursor = await db.execute(
            """SELECT output_markdown FROM interpretations
            WHERE session_id = ? AND is_primary = 1
            ORDER BY created_at DESC LIMIT 1""",
            (sess["id"],),
        )
        interp_row = await cursor.fetchone()
        interpretation = interp_row["output_markdown"] if interp_row else "(no interpretation)"

        session_texts.append(
            f'SESSION: "{sess["title"] or "Untitled"}" ({sess["created_at"]})\n'
            f"INTERPRETATION:\n{interpretation}"
        )

    user_content = "\n\n---\n\n".join(session_texts)
    user_content += "\n\n---\n\nProduce the complete memory document."

    prompt = MEMORY_REFRESH_PROMPT.replace("{series_name}", series_name)

    updated_memory = await call_openrouter(
        model=model,
        system_prompt=prompt,
        user_content=user_content,
        temperature=0.2,
        max_tokens=4096,
    )

    now = datetime.now(timezone.utc).isoformat()
    await db.execute(
        "UPDATE series SET memory_document = ?, updated_at = ? WHERE id = ?",
        (updated_memory, now, series_id),
    )
    await db.commit()
    return updated_memory


async def get_memory_context_for_session(session_id: str, db) -> str | None:
    """Lookup helper: if session has series_id, return the memory document."""
    cursor = await db.execute(
        "SELECT series_id FROM sessions WHERE id = ?", (session_id,)
    )
    row = await cursor.fetchone()
    if not row or not row["series_id"]:
        return None

    cursor = await db.execute(
        "SELECT memory_document FROM series WHERE id = ?",
        (row["series_id"],),
    )
    series_row = await cursor.fetchone()
    if not series_row or not series_row["memory_document"]:
        return None

    return series_row["memory_document"]
