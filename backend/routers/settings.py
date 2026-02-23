"""Settings router."""

import hashlib
import secrets
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends

from config import settings
from database import get_db
from models.schemas import (
    ApiKeyCreate,
    ApiKeyResponse,
    SettingsResponse,
    SettingsUpdate,
)

router = APIRouter(prefix="/api", tags=["settings"])


@router.get("/settings", response_model=SettingsResponse)
async def get_settings():
    return SettingsResponse(
        openrouter_api_key_set=bool(settings.openrouter_api_key),
        user_display_name=settings.user_display_name,
        output_dir=settings.output_dir,
        auto_export=settings.auto_export,
        include_transcript_in_md=settings.include_transcript_in_md,
        whisper_model=settings.whisper_model,
        default_model=settings.default_model,
        models=settings.models,
    )


@router.put("/settings", response_model=SettingsResponse)
async def update_settings(body: SettingsUpdate):
    """Update runtime settings (non-persistent, session-only)."""
    if body.openrouter_api_key is not None:
        settings.openrouter_api_key = body.openrouter_api_key
    if body.user_display_name is not None:
        settings.user_display_name = body.user_display_name
    if body.output_dir is not None:
        settings.output_dir = body.output_dir
    if body.auto_export is not None:
        settings.auto_export = body.auto_export
    if body.include_transcript_in_md is not None:
        settings.include_transcript_in_md = body.include_transcript_in_md
    if body.whisper_model is not None:
        settings.whisper_model = body.whisper_model
    if body.default_model is not None:
        settings.default_model = body.default_model

    return SettingsResponse(
        openrouter_api_key_set=bool(settings.openrouter_api_key),
        user_display_name=settings.user_display_name,
        output_dir=settings.output_dir,
        auto_export=settings.auto_export,
        include_transcript_in_md=settings.include_transcript_in_md,
        whisper_model=settings.whisper_model,
        default_model=settings.default_model,
        models=settings.models,
    )


@router.post("/settings/api-keys", response_model=ApiKeyResponse)
async def create_api_key(body: ApiKeyCreate, db=Depends(get_db)):
    """Generate a new agent API key."""
    key_id = str(uuid.uuid4())
    raw_key = f"scribe_sk_{secrets.token_urlsafe(32)}"
    key_hash = hashlib.sha256(raw_key.encode()).hexdigest()
    now = datetime.now(timezone.utc).isoformat()

    await db.execute(
        "INSERT INTO api_keys (id, name, key_hash, created_at) VALUES (?, ?, ?, ?)",
        (key_id, body.name, key_hash, now),
    )
    await db.commit()

    return ApiKeyResponse(
        id=key_id,
        name=body.name,
        key=raw_key,
        created_at=now,
    )


@router.get("/lenses")
async def list_lenses():
    from lenses.base import list_lenses as _list_lenses
    return _list_lenses()


@router.get("/search")
async def search_all(q: str, db=Depends(get_db)):
    from services.search_service import search
    results = await search(db, q)
    return {"query": q, "results": results, "total": len(results)}
