"""Cross-meeting AI query service — search and synthesize across all meetings."""

from config import settings
from services.ai_service import call_ai
from services.search_service import search


ASK_MEETINGS_PROMPT = """You are a meeting knowledge assistant for EchoBridge.
Answer questions by synthesizing information from the user's meeting transcripts and notes.
- Only use information present in the provided meeting data. Do not invent.
- Cite specific meetings by title and date.
- If meetings don't contain enough information, say so.
- Be concise. Prefer bullet points for multi-part answers."""


async def ask_across_meetings(
    question: str,
    db,
    model: str | None = None,
    limit: int = 5,
) -> dict:
    """Search across meetings and synthesize an AI answer with citations."""
    model = model or settings.default_model

    # Find relevant sessions via FTS5
    search_results = await search(db, question, limit)

    if not search_results:
        return {
            "question": question,
            "answer": "No meetings found matching your question. Try rephrasing or check that you have meeting transcripts recorded.",
            "sources": [],
            "model": model,
        }

    # Deduplicate by session_id (search returns both session and interpretation hits)
    seen_session_ids: set[str] = set()
    unique_sessions: list[dict] = []
    for result in search_results:
        sid = result.get("session_id") or result.get("id")
        if sid not in seen_session_ids:
            seen_session_ids.add(sid)
            unique_sessions.append(result)

    # Fetch full data for each matched session
    meeting_blocks: list[str] = []
    sources: list[dict] = []
    seen_series: set[str] = set()

    for result in unique_sessions:
        sid = result.get("session_id") or result.get("id")

        # Get session details
        cursor = await db.execute(
            "SELECT id, title, context, created_at, transcript, series_id FROM sessions WHERE id = ?",
            (sid,),
        )
        session_row = await cursor.fetchone()
        if not session_row:
            continue
        session = dict(session_row)

        # Get primary interpretation
        cursor = await db.execute(
            "SELECT output_markdown FROM interpretations WHERE session_id = ? AND is_primary = 1 LIMIT 1",
            (sid,),
        )
        interp_row = await cursor.fetchone()
        interpretation_md = dict(interp_row)["output_markdown"] if interp_row else None

        # Build meeting block
        block = f"### Meeting: {session['title'] or 'Untitled'}\n"
        block += f"Date: {session['created_at']}\nContext: {session['context']}\n\n"
        if interpretation_md:
            block += f"Notes:\n{interpretation_md}\n"
        elif session.get("transcript"):
            # Fall back to transcript snippet if no interpretation
            transcript = session["transcript"]
            if len(transcript) > 2000:
                transcript = transcript[:2000] + "..."
            block += f"Transcript:\n{transcript}\n"

        # Include series memory if available (once per series)
        series_id = session.get("series_id")
        if series_id and series_id not in seen_series:
            seen_series.add(series_id)
            cursor = await db.execute(
                "SELECT name, memory_document FROM series WHERE id = ?",
                (series_id,),
            )
            series_row = await cursor.fetchone()
            if series_row:
                series = dict(series_row)
                if series.get("memory_document"):
                    block += f"\nSeries Memory ({series['name']}):\n{series['memory_document']}\n"

        meeting_blocks.append(block)
        sources.append({
            "session_id": sid,
            "title": session["title"] or "Untitled",
            "created_at": session["created_at"],
            "context": session["context"],
        })

    # Build context and call AI
    user_content = f"QUESTION: {question}\n\nMEETING DATA:\n\n" + "\n---\n\n".join(meeting_blocks)

    answer = await call_ai(
        model=model,
        system_prompt=ASK_MEETINGS_PROMPT,
        user_content=user_content,
    )

    return {
        "question": question,
        "answer": answer,
        "sources": sources,
        "model": model,
    }
