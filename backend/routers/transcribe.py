"""Transcription router — handles audio upload and browser STT."""

import os
import uuid

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File

from config import settings
from database import get_db
from services.stt.whisper import transcribe_file, ACCEPTED_FORMATS

router = APIRouter(prefix="/api/sessions", tags=["transcription"])


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

    # Run transcription
    try:
        result = await transcribe_file(audio_path)
        await db.execute(
            """UPDATE sessions
            SET transcript = ?, duration_seconds = ?, status = 'processing',
                stt_provider = 'whisper'
            WHERE id = ?""",
            (result.text, int(result.duration_seconds), session_id),
        )
        await db.commit()
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

    if not transcript:
        raise HTTPException(400, "Transcript is empty")

    await db.execute(
        """UPDATE sessions
        SET transcript = ?, duration_seconds = ?, status = 'processing',
            stt_provider = 'browser'
        WHERE id = ?""",
        (transcript, duration, session_id),
    )
    await db.commit()

    return {
        "session_id": session_id,
        "transcript_length": len(transcript),
        "duration_seconds": duration,
        "status": "processing",
    }
