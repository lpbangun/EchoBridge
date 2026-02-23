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


def _build_settings_response() -> SettingsResponse:
    return SettingsResponse(
        ai_provider=settings.ai_provider,
        openrouter_api_key_set=bool(settings.openrouter_api_key),
        openai_api_key_set=bool(settings.openai_api_key),
        anthropic_api_key_set=bool(settings.anthropic_api_key),
        google_api_key_set=bool(settings.google_api_key),
        xai_api_key_set=bool(settings.xai_api_key),
        user_display_name=settings.user_display_name,
        output_dir=settings.output_dir,
        auto_export=settings.auto_export,
        include_transcript_in_md=settings.include_transcript_in_md,
        whisper_model=settings.whisper_model,
        default_model=settings.default_model,
        models=settings.models,
        provider_models=settings.provider_models,
        cloud_storage_enabled=settings.cloud_storage_enabled,
        s3_endpoint_url=settings.s3_endpoint_url,
        s3_access_key_id=settings.s3_access_key_id,
        s3_secret_configured=bool(settings.s3_secret_access_key),
        s3_bucket_name=settings.s3_bucket_name,
        s3_region=settings.s3_region,
        s3_prefix=settings.s3_prefix,
        cloud_sync_audio=settings.cloud_sync_audio,
        cloud_sync_exports=settings.cloud_sync_exports,
    )


@router.get("/settings", response_model=SettingsResponse)
async def get_settings():
    return _build_settings_response()


@router.put("/settings", response_model=SettingsResponse)
async def update_settings(body: SettingsUpdate):
    """Update runtime settings (non-persistent, session-only)."""
    if body.ai_provider is not None:
        settings.ai_provider = body.ai_provider
    if body.openrouter_api_key is not None:
        settings.openrouter_api_key = body.openrouter_api_key
    if body.openai_api_key is not None:
        settings.openai_api_key = body.openai_api_key
    if body.anthropic_api_key is not None:
        settings.anthropic_api_key = body.anthropic_api_key
    if body.google_api_key is not None:
        settings.google_api_key = body.google_api_key
    if body.xai_api_key is not None:
        settings.xai_api_key = body.xai_api_key
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
    if body.cloud_storage_enabled is not None:
        settings.cloud_storage_enabled = body.cloud_storage_enabled
    if body.s3_endpoint_url is not None:
        settings.s3_endpoint_url = body.s3_endpoint_url
    if body.s3_access_key_id is not None:
        settings.s3_access_key_id = body.s3_access_key_id
    if body.s3_secret_access_key is not None:
        settings.s3_secret_access_key = body.s3_secret_access_key
    if body.s3_bucket_name is not None:
        settings.s3_bucket_name = body.s3_bucket_name
    if body.s3_region is not None:
        settings.s3_region = body.s3_region
    if body.s3_prefix is not None:
        settings.s3_prefix = body.s3_prefix
    if body.cloud_sync_audio is not None:
        settings.cloud_sync_audio = body.cloud_sync_audio
    if body.cloud_sync_exports is not None:
        settings.cloud_sync_exports = body.cloud_sync_exports

    return _build_settings_response()


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
