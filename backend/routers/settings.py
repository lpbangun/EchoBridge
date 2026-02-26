"""Settings router."""

import hashlib
import secrets
import uuid
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import PlainTextResponse
from starlette.responses import Response

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
        stt_provider=settings.stt_provider,
        whisper_model=settings.whisper_model,
        openai_stt_model=settings.openai_stt_model,
        default_model=settings.default_model,
        models=settings.models,
        provider_models=settings.provider_models,
        deepgram_api_key_set=bool(settings.deepgram_api_key),
        deepgram_model=settings.deepgram_model,
        auto_interpret=settings.auto_interpret,
        auto_sockets=[s.strip() for s in settings.auto_sockets.split(",") if s.strip()],
        cloud_storage_enabled=settings.cloud_storage_enabled,
        s3_endpoint_url=settings.s3_endpoint_url,
        s3_access_key_id=settings.s3_access_key_id,
        s3_secret_configured=bool(settings.s3_secret_access_key),
        s3_bucket_name=settings.s3_bucket_name,
        s3_region=settings.s3_region,
        s3_prefix=settings.s3_prefix,
        cloud_sync_audio=settings.cloud_sync_audio,
        cloud_sync_exports=settings.cloud_sync_exports,
        onboarding_complete=settings.onboarding_complete,
    )


@router.get("/settings", response_model=SettingsResponse)
async def get_settings():
    return _build_settings_response()


@router.put("/settings", response_model=SettingsResponse)
async def update_settings(body: SettingsUpdate, db=Depends(get_db)):
    """Update runtime settings and persist preferences to SQLite."""
    changed: dict = {}

    if body.ai_provider is not None:
        settings.ai_provider = body.ai_provider
        changed["ai_provider"] = body.ai_provider
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
        changed["user_display_name"] = body.user_display_name
    if body.output_dir is not None:
        settings.output_dir = body.output_dir
        changed["output_dir"] = body.output_dir
    if body.auto_export is not None:
        settings.auto_export = body.auto_export
        changed["auto_export"] = body.auto_export
    if body.include_transcript_in_md is not None:
        settings.include_transcript_in_md = body.include_transcript_in_md
        changed["include_transcript_in_md"] = body.include_transcript_in_md
    if body.stt_provider is not None:
        settings.stt_provider = body.stt_provider
        changed["stt_provider"] = body.stt_provider
    if body.whisper_model is not None:
        settings.whisper_model = body.whisper_model
        changed["whisper_model"] = body.whisper_model
    if body.openai_stt_model is not None:
        settings.openai_stt_model = body.openai_stt_model
        changed["openai_stt_model"] = body.openai_stt_model
    if body.default_model is not None:
        settings.default_model = body.default_model
        changed["default_model"] = body.default_model
    if body.deepgram_api_key is not None:
        settings.deepgram_api_key = body.deepgram_api_key
    if body.deepgram_model is not None:
        settings.deepgram_model = body.deepgram_model
        changed["deepgram_model"] = body.deepgram_model
    if body.auto_interpret is not None:
        settings.auto_interpret = body.auto_interpret
        changed["auto_interpret"] = body.auto_interpret
    if body.auto_sockets is not None:
        joined = ",".join(body.auto_sockets)
        settings.auto_sockets = joined
        changed["auto_sockets"] = joined
    if body.cloud_storage_enabled is not None:
        settings.cloud_storage_enabled = body.cloud_storage_enabled
        changed["cloud_storage_enabled"] = body.cloud_storage_enabled
    if body.s3_endpoint_url is not None:
        settings.s3_endpoint_url = body.s3_endpoint_url
        changed["s3_endpoint_url"] = body.s3_endpoint_url
    if body.s3_access_key_id is not None:
        settings.s3_access_key_id = body.s3_access_key_id
        changed["s3_access_key_id"] = body.s3_access_key_id
    if body.s3_secret_access_key is not None:
        settings.s3_secret_access_key = body.s3_secret_access_key
    if body.s3_bucket_name is not None:
        settings.s3_bucket_name = body.s3_bucket_name
        changed["s3_bucket_name"] = body.s3_bucket_name
    if body.s3_region is not None:
        settings.s3_region = body.s3_region
        changed["s3_region"] = body.s3_region
    if body.s3_prefix is not None:
        settings.s3_prefix = body.s3_prefix
        changed["s3_prefix"] = body.s3_prefix
    if body.cloud_sync_audio is not None:
        settings.cloud_sync_audio = body.cloud_sync_audio
        changed["cloud_sync_audio"] = body.cloud_sync_audio
    if body.cloud_sync_exports is not None:
        settings.cloud_sync_exports = body.cloud_sync_exports
        changed["cloud_sync_exports"] = body.cloud_sync_exports
    if body.onboarding_complete is not None:
        settings.onboarding_complete = body.onboarding_complete
        changed["onboarding_complete"] = body.onboarding_complete

    # Persist preference fields to SQLite
    if changed:
        from services.settings_service import save_preferences
        await save_preferences(db, changed)

    return _build_settings_response()


@router.post("/settings/api-keys", response_model=ApiKeyResponse)
async def create_api_key(body: ApiKeyCreate, db=Depends(get_db)):
    """Generate a new agent API key."""
    key_id = str(uuid.uuid4())
    raw_key = f"scribe_sk_{secrets.token_urlsafe(32)}"
    key_hash = hashlib.sha256(raw_key.encode()).hexdigest()
    now = datetime.now(timezone.utc).isoformat()

    scopes_str = ",".join(body.scopes) if body.scopes is not None else None

    await db.execute(
        "INSERT INTO api_keys (id, name, key_hash, scopes, created_at) VALUES (?, ?, ?, ?, ?)",
        (key_id, body.name, key_hash, scopes_str, now),
    )
    await db.commit()

    return ApiKeyResponse(
        id=key_id,
        name=body.name,
        key=raw_key,
        scopes=body.scopes,
        created_at=now,
    )


@router.get("/settings/api-keys")
async def list_api_keys(db=Depends(get_db)):
    """List all agent API keys (no secret data exposed)."""
    cursor = await db.execute(
        "SELECT id, name, scopes, created_at, last_used_at FROM api_keys ORDER BY created_at DESC"
    )
    rows = []
    for row in await cursor.fetchall():
        d = dict(row)
        raw = d.pop("scopes", None)
        d["scopes"] = [s.strip() for s in raw.split(",") if s.strip()] if raw else None
        rows.append(d)
    return rows


@router.delete("/settings/api-keys/{key_id}", status_code=204)
async def delete_api_key(key_id: str, db=Depends(get_db)):
    """Revoke an agent API key."""
    cursor = await db.execute("DELETE FROM api_keys WHERE id = ?", (key_id,))
    await db.commit()
    if cursor.rowcount == 0:
        raise HTTPException(404, "API key not found")
    return Response(status_code=204)


_SKILL_MD_CANDIDATES = [
    Path(__file__).resolve().parent.parent / "SKILL.md",  # Docker: /app/SKILL.md
    Path(__file__).resolve().parent.parent / "openclaw-skill" / "echobridge" / "SKILL.md",  # Dev
]


def _find_skill_md() -> Path | None:
    for p in _SKILL_MD_CANDIDATES:
        if p.exists():
            return p
    return None


@router.get("/skill", response_class=PlainTextResponse)
async def get_skill_file():
    """Return SKILL.md content (unauthenticated) for the Settings UI."""
    path = _find_skill_md()
    if not path:
        raise HTTPException(404, "SKILL.md not found")
    return path.read_text(encoding="utf-8")


@router.get("/lenses")
async def list_lenses():
    from lenses.base import list_lenses as _list_lenses
    return _list_lenses()


@router.get("/search")
async def search_all(q: str, db=Depends(get_db)):
    from services.search_service import search
    results = await search(db, q)
    return {"query": q, "results": results, "total": len(results)}
