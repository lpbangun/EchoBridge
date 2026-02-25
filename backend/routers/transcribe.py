"""Transcription router — handles audio upload and browser STT."""

import asyncio
import json
import logging
import os
import uuid

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File

from config import settings
from database import get_db

logger = logging.getLogger(__name__)


async def _run_memory_synthesis(db, series_id, session, interpretation_md, model):
    """Background task: synthesize memory with its own db connection."""
    from services.memory_service import synthesize_and_store_memory
    try:
        await synthesize_and_store_memory(
            series_id=series_id,
            session=session,
            interpretation_markdown=interpretation_md,
            model=model,
            db=db,
        )
    except Exception:
        logger.exception("Memory synthesis failed for series %s", series_id)
    finally:
        await db.close()


async def _run_auto_pipeline(session_id: str):
    """Background task: auto-interpret then auto-export."""
    from database import get_db_connection
    from services.interpret_service import auto_interpret
    from services.markdown_service import save_markdown

    try:
        db = await get_db_connection()
        try:
            if not settings.auto_interpret:
                # Still mark session complete even when auto-interpret is off
                await db.execute(
                    "UPDATE sessions SET status = 'complete' WHERE id = ?",
                    (session_id,),
                )
                await db.commit()
                return

            # Generate title if none set
            cursor = await db.execute(
                "SELECT title, transcript FROM sessions WHERE id = ?", (session_id,)
            )
            title_row = await cursor.fetchone()
            if title_row and not title_row["title"] and title_row["transcript"]:
                from services.ai_service import generate_title
                model = settings.auto_interpret_model or settings.default_model
                generated = await generate_title(title_row["transcript"], model)
                if generated:
                    await db.execute(
                        "UPDATE sessions SET title = ? WHERE id = ? AND (title IS NULL OR title = '')",
                        (generated, session_id),
                    )
                    await db.commit()

            # Run auto-interpretation
            interpretation = await auto_interpret(session_id, db)
            if not interpretation:
                # Empty transcript or other issue — mark complete anyway
                await db.execute(
                    "UPDATE sessions SET status = 'complete' WHERE id = ?",
                    (session_id,),
                )
                await db.commit()
                return

            # Update session status to complete
            await db.execute(
                "UPDATE sessions SET status = 'complete' WHERE id = ?",
                (session_id,),
            )
            await db.commit()

            # Fire memory synthesis if session belongs to a series
            # Use a separate db connection so we can close ours safely
            cursor = await db.execute(
                "SELECT series_id FROM sessions WHERE id = ?", (session_id,)
            )
            row = await cursor.fetchone()
            if row and row["series_id"]:
                from services.memory_service import synthesize_and_store_memory
                cursor2 = await db.execute(
                    "SELECT * FROM sessions WHERE id = ?", (session_id,)
                )
                session = dict(await cursor2.fetchone())
                # Give memory synthesis its own db connection
                mem_db = await get_db_connection()
                asyncio.create_task(
                    _run_memory_synthesis(
                        mem_db,
                        session["series_id"],
                        session,
                        interpretation.get("output_markdown", ""),
                        settings.auto_interpret_model or settings.default_model,
                    )
                )

            # Auto-export if enabled
            if settings.auto_export:
                cursor = await db.execute(
                    "SELECT * FROM sessions WHERE id = ?", (session_id,)
                )
                session_row = await cursor.fetchone()
                if session_row:
                    session_dict = dict(session_row)
                    if isinstance(session_dict.get("context_metadata"), str):
                        session_dict["context_metadata"] = json.loads(
                            session_dict["context_metadata"]
                        )
                    await save_markdown(session_dict, interpretation)
        finally:
            await db.close()
    except Exception:
        logger.exception("Auto-pipeline failed for session %s", session_id)
        # Ensure session doesn't stay stuck in 'processing'
        try:
            from database import get_db_connection as _get_db
            err_db = await _get_db()
            try:
                await err_db.execute(
                    "UPDATE sessions SET status = 'complete' WHERE id = ? AND status = 'processing'",
                    (session_id,),
                )
                await err_db.commit()
            finally:
                await err_db.close()
        except Exception:
            logger.exception("Failed to update session status after pipeline error")

router = APIRouter(prefix="/api/sessions", tags=["transcription"])

ACCEPTED_FORMATS = {".mp3", ".wav", ".m4a", ".webm", ".ogg"}


@router.post("/{session_id}/audio")
async def upload_audio(
    session_id: str,
    audio: UploadFile = File(...),
    db=Depends(get_db),
):
    """Upload an audio file and run STT."""
    # Check session exists
    cursor = await db.execute("SELECT * FROM sessions WHERE id = ?", (session_id,))
    row = await cursor.fetchone()
    if not row:
        raise HTTPException(404, "Session not found")

    # Validate file extension
    ext = os.path.splitext(audio.filename or "")[1].lower()
    if ext not in ACCEPTED_FORMATS:
        raise HTTPException(
            400,
            f"Unsupported format: {ext}. Accepted: {', '.join(ACCEPTED_FORMATS)}",
        )

    # Save audio file
    audio_dir = settings.audio_dir
    os.makedirs(audio_dir, exist_ok=True)
    file_id = str(uuid.uuid4())
    audio_path = os.path.join(audio_dir, f"{file_id}{ext}")

    content = await audio.read()
    with open(audio_path, "wb") as f:
        f.write(content)

    # Update session status
    await db.execute(
        "UPDATE sessions SET status = 'transcribing', audio_path = ? WHERE id = ?",
        (audio_path, session_id),
    )
    await db.commit()

    # Determine which STT provider to use
    use_cloud = (
        (settings.stt_provider == "openai" and settings.openai_api_key) or
        (settings.stt_provider == "deepgram" and settings.deepgram_api_key)
    )

    if not use_cloud:
        # Lazy-import whisper — heavy native deps (ctranslate2) may not be available
        try:
            from services.stt.whisper import transcribe_file as _check_whisper  # noqa: F401
        except ImportError:
            raise HTTPException(
                503,
                "Audio transcription is unavailable — faster-whisper is not installed. "
                "Use browser speech recognition instead.",
            )

    # Run transcription via the STT factory
    try:
        from services.stt import transcribe_file

        result = await transcribe_file(audio_path)
        provider_name = settings.stt_provider if use_cloud else "whisper"
        await db.execute(
            """UPDATE sessions
            SET transcript = ?, duration_seconds = ?, status = 'processing',
                stt_provider = ?
            WHERE id = ?""",
            (result.text, int(result.duration_seconds), provider_name, session_id),
        )
        await db.commit()
        # Enqueue audio for cloud sync if enabled
        if settings.cloud_storage_enabled and settings.cloud_sync_audio:
            from services.sync_service import get_sync_service
            sync = get_sync_service()
            if sync:
                remote_key = f"audio/{file_id}{ext}"
                sync.enqueue(audio_path, remote_key, file_type="audio")

        # Fire-and-forget auto-interpret pipeline
        asyncio.create_task(_run_auto_pipeline(session_id))

        return {
            "session_id": session_id,
            "transcript_length": len(result.text),
            "duration_seconds": int(result.duration_seconds),
            "status": "processing",
        }
    except Exception as e:
        await db.execute(
            "UPDATE sessions SET status = 'error', error_message = ? WHERE id = ?",
            (str(e), session_id),
        )
        await db.commit()
        raise HTTPException(500, f"Transcription failed: {e}")


@router.post("/{session_id}/transcript")
async def submit_transcript(
    session_id: str,
    body: dict,
    db=Depends(get_db),
):
    """Submit a browser STT transcript directly."""
    cursor = await db.execute("SELECT * FROM sessions WHERE id = ?", (session_id,))
    row = await cursor.fetchone()
    if not row:
        raise HTTPException(404, "Session not found")

    transcript = body.get("transcript", "")
    duration = body.get("duration_seconds", 0)
    append = body.get("append", False)

    if not transcript:
        raise HTTPException(400, "Transcript is empty")

    if append:
        await db.execute(
            """UPDATE sessions
            SET transcript = COALESCE(transcript, '') || ' ' || ?,
                duration_seconds = COALESCE(duration_seconds, 0) + ?,
                status = 'processing', stt_provider = 'browser'
            WHERE id = ?""",
            (transcript, duration, session_id),
        )
    else:
        await db.execute(
            """UPDATE sessions
            SET transcript = ?, duration_seconds = ?, status = 'processing',
                stt_provider = 'browser'
            WHERE id = ?""",
            (transcript, duration, session_id),
        )
    await db.commit()

    # Fire-and-forget auto-interpret pipeline
    asyncio.create_task(_run_auto_pipeline(session_id))

    return {
        "session_id": session_id,
        "transcript_length": len(transcript),
        "duration_seconds": duration,
        "status": "processing",
    }
