"""Chat service — per-session and cross-meeting conversational AI."""

import uuid
from datetime import datetime, timezone

from config import settings
from services.ai_service import call_ai
from services.ask_service import ask_across_meetings


SESSION_CHAT_PROMPT = """You are a meeting assistant for EchoBridge.
You are chatting about a specific meeting session. Use the provided transcript and notes to answer questions.
- Only reference information present in the meeting data. Do not invent details.
- Be concise and helpful. Use bullet points for multi-part answers.
- If something was not discussed in the meeting, say so."""


async def create_conversation(
    db,
    session_id: str | None = None,
    title: str | None = None,
) -> dict:
    """Create a new conversation, optionally scoped to a session."""
    conversation_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()

    if not title:
        if session_id:
            cursor = await db.execute(
                "SELECT title FROM sessions WHERE id = ?", (session_id,)
            )
            row = await cursor.fetchone()
            title = f"Chat: {row['title'] or 'Untitled'}" if row else "Chat"
        else:
            title = "Ask EchoBridge"

    await db.execute(
        """INSERT INTO conversations (id, session_id, title, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?)""",
        (conversation_id, session_id, title, now, now),
    )
    await db.commit()

    return {
        "id": conversation_id,
        "session_id": session_id,
        "title": title,
        "created_at": now,
        "updated_at": now,
    }


async def add_message(
    db,
    conversation_id: str,
    role: str,
    content: str,
    source: str = "user",
    model: str | None = None,
) -> dict:
    """Store a message in a conversation."""
    message_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()

    await db.execute(
        """INSERT INTO messages (id, conversation_id, role, content, source, model, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)""",
        (message_id, conversation_id, role, content, source, model, now),
    )
    await db.execute(
        "UPDATE conversations SET updated_at = ? WHERE id = ?",
        (now, conversation_id),
    )
    await db.commit()

    return {
        "id": message_id,
        "conversation_id": conversation_id,
        "role": role,
        "content": content,
        "source": source,
        "model": model,
        "created_at": now,
    }


async def get_conversation(db, conversation_id: str) -> dict | None:
    """Get a conversation with all its messages."""
    cursor = await db.execute(
        "SELECT * FROM conversations WHERE id = ?", (conversation_id,)
    )
    row = await cursor.fetchone()
    if not row:
        return None

    conversation = dict(row)

    cursor = await db.execute(
        "SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC",
        (conversation_id,),
    )
    messages = [dict(r) for r in await cursor.fetchall()]
    conversation["messages"] = messages

    return conversation


async def list_conversations(
    db,
    session_id: str | None = None,
    global_only: bool = False,
) -> list[dict]:
    """List conversations, optionally filtered by session_id or global-only."""
    if global_only:
        cursor = await db.execute(
            "SELECT * FROM conversations WHERE session_id IS NULL ORDER BY updated_at DESC"
        )
    elif session_id:
        cursor = await db.execute(
            "SELECT * FROM conversations WHERE session_id = ? ORDER BY updated_at DESC",
            (session_id,),
        )
    else:
        cursor = await db.execute(
            "SELECT * FROM conversations ORDER BY updated_at DESC"
        )

    rows = await cursor.fetchall()
    return [dict(r) for r in rows]


async def delete_conversation(db, conversation_id: str) -> bool:
    """Delete a conversation and its messages (cascade)."""
    cursor = await db.execute(
        "SELECT id FROM conversations WHERE id = ?", (conversation_id,)
    )
    if not await cursor.fetchone():
        return False

    await db.execute("DELETE FROM conversations WHERE id = ?", (conversation_id,))
    await db.commit()
    return True


async def _build_session_context(db, session_id: str) -> str:
    """Build context string from a session's transcript, primary interpretation, and series memory."""
    cursor = await db.execute(
        "SELECT id, title, context, transcript, series_id FROM sessions WHERE id = ?",
        (session_id,),
    )
    row = await cursor.fetchone()
    if not row:
        return ""

    session = dict(row)
    parts = []

    parts.append(f"Meeting: {session['title'] or 'Untitled'}")
    parts.append(f"Context: {session['context']}")

    # Primary interpretation (notes)
    cursor = await db.execute(
        "SELECT output_markdown FROM interpretations WHERE session_id = ? AND is_primary = 1 LIMIT 1",
        (session_id,),
    )
    interp_row = await cursor.fetchone()
    if interp_row:
        parts.append(f"\nMeeting Notes:\n{interp_row['output_markdown']}")

    # Transcript
    if session.get("transcript"):
        transcript = session["transcript"]
        if len(transcript) > 6000:
            transcript = transcript[:6000] + "\n... [transcript truncated]"
        parts.append(f"\nTranscript:\n{transcript}")

    # Series memory
    if session.get("series_id"):
        cursor = await db.execute(
            "SELECT name, memory_document FROM series WHERE id = ?",
            (session["series_id"],),
        )
        series_row = await cursor.fetchone()
        if series_row and series_row["memory_document"]:
            parts.append(
                f"\nSeries Memory ({series_row['name']}):\n{series_row['memory_document']}"
            )

    return "\n".join(parts)


def _format_conversation_history(messages: list[dict]) -> str:
    """Format message history for inclusion in the AI prompt."""
    if not messages:
        return ""

    lines = []
    for msg in messages:
        role_label = msg["role"].upper()
        if msg.get("source") and msg["source"] != "user" and msg["source"] != "assistant":
            role_label = f"AGENT ({msg['source']})"
        lines.append(f"{role_label}: {msg['content']}")

    return "\n\n".join(lines)


async def chat(
    db,
    conversation_id: str,
    user_message: str,
    model: str | None = None,
) -> dict:
    """Send a message in a conversation and get an AI response.

    For session-scoped conversations, builds context from the session data.
    For global conversations, delegates to ask_across_meetings.
    """
    model = model or settings.default_model

    # Get conversation to determine scope
    conversation = await get_conversation(db, conversation_id)
    if not conversation:
        raise ValueError("Conversation not found")

    # Store user message
    await add_message(db, conversation_id, "user", user_message, source="user")

    session_id = conversation.get("session_id")

    if session_id:
        # Session-scoped: build context from session data
        session_context = await _build_session_context(db, session_id)

        system_prompt = SESSION_CHAT_PROMPT + f"\n\nMEETING DATA:\n{session_context}"

        # Build conversation history (excluding the message we just stored)
        history = _format_conversation_history(conversation["messages"])
        user_content = history + f"\n\nUSER: {user_message}" if history else user_message

        answer = await call_ai(
            model=model,
            system_prompt=system_prompt,
            user_content=user_content,
        )

        # Store assistant response
        assistant_msg = await add_message(
            db, conversation_id, "assistant", answer,
            source="assistant", model=model,
        )

        return {
            "message": assistant_msg,
            "sources": [{"session_id": session_id}],
        }

    else:
        # Global: use ask_across_meetings for context building
        result = await ask_across_meetings(
            question=user_message, db=db, model=model,
        )

        # Store assistant response
        assistant_msg = await add_message(
            db, conversation_id, "assistant", result["answer"],
            source="assistant", model=model,
        )

        return {
            "message": assistant_msg,
            "sources": result.get("sources", []),
        }
