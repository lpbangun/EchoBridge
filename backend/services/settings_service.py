"""Persist user preferences to SQLite so they survive restarts."""

import json
import os

import aiosqlite

from config import settings

# Fields that persist to SQLite. Secrets and infrastructure stay in .env only.
PREFERENCE_FIELDS = {
    "ai_provider",
    "user_display_name",
    "output_dir",
    "auto_export",
    "include_transcript_in_md",
    "stt_provider",
    "whisper_model",
    "openai_stt_model",
    "default_model",
    "deepgram_model",
    "auto_interpret",
    "auto_interpret_model",
    "auto_sockets",
    "cloud_storage_enabled",
    "s3_endpoint_url",
    "s3_access_key_id",
    "s3_bucket_name",
    "s3_region",
    "s3_prefix",
    "cloud_sync_audio",
    "cloud_sync_exports",
    "onboarding_complete",
}


async def load_preferences(db: aiosqlite.Connection) -> None:
    """Load saved preferences from SQLite onto the settings singleton.

    Environment variables always win — if a field has an explicit env var set,
    the SQLite value is ignored for that field.
    """
    cursor = await db.execute("SELECT key, value FROM app_settings")
    rows = await cursor.fetchall()

    for row in rows:
        key = row[0]
        raw_value = row[1]

        if key not in PREFERENCE_FIELDS:
            continue

        # Env vars take precedence: if the user set e.g. USER_DISPLAY_NAME in
        # .env, don't let the SQLite value override it.
        env_name = key.upper()
        if env_name in os.environ:
            continue

        value = json.loads(raw_value)
        setattr(settings, key, value)


async def save_preferences(db: aiosqlite.Connection, updates: dict) -> None:
    """UPSERT preference fields into the app_settings table."""
    for key, value in updates.items():
        if key not in PREFERENCE_FIELDS:
            continue
        encoded = json.dumps(value)
        await db.execute(
            "INSERT INTO app_settings (key, value) VALUES (?, ?) "
            "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            (key, encoded),
        )
    await db.commit()
