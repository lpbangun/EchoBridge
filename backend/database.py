import aiosqlite
import os
from config import settings

_db: aiosqlite.Connection | None = None

SCHEMA = """
CREATE TABLE IF NOT EXISTS series (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    memory_document TEXT DEFAULT '',
    memory_error TEXT DEFAULT NULL,
    session_count INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    title TEXT,
    context TEXT NOT NULL,
    context_metadata JSON DEFAULT '{}',
    room_id TEXT REFERENCES rooms(id),
    series_id TEXT REFERENCES series(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    duration_seconds INTEGER,
    status TEXT DEFAULT 'created',
    transcript TEXT,
    stt_provider TEXT,
    audio_path TEXT,
    host_name TEXT,
    error_message TEXT,
    manual_notes TEXT DEFAULT '',
    is_diarized BOOLEAN DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS interpretations (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    source_type TEXT NOT NULL,
    source_name TEXT,
    lens_type TEXT NOT NULL,
    lens_id TEXT,
    lens_prompt TEXT,
    model TEXT NOT NULL,
    output_markdown TEXT NOT NULL,
    output_structured JSON,
    is_primary BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS rooms (
    id TEXT PRIMARY KEY,
    code TEXT UNIQUE NOT NULL,
    session_id TEXT REFERENCES sessions(id),
    host_name TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    status TEXT DEFAULT 'waiting',
    settings JSON DEFAULT '{}',
    mode TEXT DEFAULT 'standard',
    meeting_config JSON DEFAULT '{}',
    transcript_log TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS room_participants (
    id TEXT PRIMARY KEY,
    room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    participant_type TEXT NOT NULL,
    connected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    agent_name TEXT,
    persona_config JSON DEFAULT '{}',
    is_external BOOLEAN DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS meeting_messages (
    id TEXT PRIMARY KEY,
    room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    sender_name TEXT NOT NULL,
    sender_type TEXT NOT NULL,
    message_type TEXT NOT NULL,
    content TEXT NOT NULL,
    content_type TEXT DEFAULT 'text/plain',
    sequence_number INTEGER NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_meeting_messages_room
    ON meeting_messages(room_id, sequence_number);

CREATE TABLE IF NOT EXISTS sockets (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT NOT NULL,
    category TEXT NOT NULL,
    system_prompt TEXT NOT NULL,
    output_schema JSON NOT NULL,
    is_preset BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS api_keys (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    key_hash TEXT NOT NULL UNIQUE,
    scopes TEXT DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_used_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS invites (
    id TEXT PRIMARY KEY,
    token TEXT NOT NULL UNIQUE,
    label TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP,
    claimed_at TIMESTAMP,
    api_key_id TEXT REFERENCES api_keys(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_invites_token ON invites(token);

CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS session_events (
    id TEXT PRIMARY KEY,
    event_type TEXT NOT NULL,
    session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    context TEXT,
    title TEXT,
    interpretations_count INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_session_events_created ON session_events(created_at);

CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY,
    session_id TEXT REFERENCES sessions(id) ON DELETE CASCADE,
    title TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    source TEXT DEFAULT 'user',
    model TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS wall_posts (
    id TEXT PRIMARY KEY,
    agent_name TEXT NOT NULL,
    agent_key_id TEXT REFERENCES api_keys(id),
    content TEXT NOT NULL,
    post_type TEXT DEFAULT 'post',
    parent_id TEXT REFERENCES wall_posts(id),
    reactions JSON DEFAULT '{}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_wall_posts_created ON wall_posts(created_at);

CREATE VIRTUAL TABLE IF NOT EXISTS sessions_fts USING fts5(
    title, transcript,
    content='sessions', content_rowid='rowid'
);

CREATE VIRTUAL TABLE IF NOT EXISTS interpretations_fts USING fts5(
    output_markdown,
    content='interpretations', content_rowid='rowid'
);

-- Triggers to keep FTS in sync
CREATE TRIGGER IF NOT EXISTS sessions_ai AFTER INSERT ON sessions BEGIN
    INSERT INTO sessions_fts(rowid, title, transcript)
    VALUES (new.rowid, new.title, new.transcript);
END;

CREATE TRIGGER IF NOT EXISTS sessions_au AFTER UPDATE ON sessions BEGIN
    INSERT INTO sessions_fts(sessions_fts, rowid, title, transcript)
    VALUES ('delete', old.rowid, old.title, old.transcript);
    INSERT INTO sessions_fts(rowid, title, transcript)
    VALUES (new.rowid, new.title, new.transcript);
END;

CREATE TRIGGER IF NOT EXISTS sessions_ad AFTER DELETE ON sessions BEGIN
    INSERT INTO sessions_fts(sessions_fts, rowid, title, transcript)
    VALUES ('delete', old.rowid, old.title, old.transcript);
END;

CREATE TRIGGER IF NOT EXISTS interpretations_ai AFTER INSERT ON interpretations BEGIN
    INSERT INTO interpretations_fts(rowid, output_markdown)
    VALUES (new.rowid, new.output_markdown);
END;

CREATE TRIGGER IF NOT EXISTS interpretations_au AFTER UPDATE ON interpretations BEGIN
    INSERT INTO interpretations_fts(interpretations_fts, rowid, output_markdown)
    VALUES ('delete', old.rowid, old.output_markdown);
    INSERT INTO interpretations_fts(rowid, output_markdown)
    VALUES (new.rowid, new.output_markdown);
END;

CREATE TRIGGER IF NOT EXISTS interpretations_ad AFTER DELETE ON interpretations BEGIN
    INSERT INTO interpretations_fts(interpretations_fts, rowid, output_markdown)
    VALUES ('delete', old.rowid, old.output_markdown);
END;
"""


async def get_db() -> aiosqlite.Connection:
    """Get or create the database connection."""
    global _db
    if _db is None:
        db_path = settings.database_path
        os.makedirs(os.path.dirname(db_path), exist_ok=True)
        _db = await aiosqlite.connect(db_path)
        _db.row_factory = aiosqlite.Row
        await _db.execute("PRAGMA journal_mode=WAL")
        await _db.execute("PRAGMA foreign_keys=ON")
        await _db.executescript(SCHEMA)
        await _db.commit()
        await _run_migrations(_db)
    return _db


async def _run_migrations(db: aiosqlite.Connection) -> None:
    """Run ALTER TABLE migrations for databases created before columns were added to SCHEMA.

    New databases get all columns from SCHEMA directly. These migrations
    only apply to pre-existing databases upgraded from earlier versions.
    Each migration is idempotent (silently ignored if column already exists).
    """
    alter_migrations = [
        "ALTER TABLE sessions ADD COLUMN series_id TEXT REFERENCES series(id)",
        "ALTER TABLE sessions ADD COLUMN manual_notes TEXT DEFAULT ''",
        "ALTER TABLE sessions ADD COLUMN is_diarized BOOLEAN DEFAULT FALSE",
        "ALTER TABLE rooms ADD COLUMN mode TEXT DEFAULT 'standard'",
        "ALTER TABLE rooms ADD COLUMN meeting_config JSON DEFAULT '{}'",
        "ALTER TABLE rooms ADD COLUMN transcript_log TEXT DEFAULT ''",
        "ALTER TABLE room_participants ADD COLUMN persona_config JSON DEFAULT '{}'",
        "ALTER TABLE room_participants ADD COLUMN is_external BOOLEAN DEFAULT FALSE",
        "ALTER TABLE api_keys ADD COLUMN scopes TEXT DEFAULT NULL",
        "ALTER TABLE series ADD COLUMN memory_error TEXT DEFAULT NULL",
        "ALTER TABLE meeting_messages ADD COLUMN content_type TEXT DEFAULT 'text/plain'",
    ]
    for sql in alter_migrations:
        try:
            await db.execute(sql)
            await db.commit()
        except Exception:
            pass  # Column already exists


async def get_db_connection() -> aiosqlite.Connection:
    """Create a standalone database connection (for background tasks outside the request lifecycle)."""
    db_path = settings.database_path
    os.makedirs(os.path.dirname(db_path), exist_ok=True)
    conn = await aiosqlite.connect(db_path)
    conn.row_factory = aiosqlite.Row
    await conn.execute("PRAGMA journal_mode=WAL")
    await conn.execute("PRAGMA foreign_keys=ON")
    return conn


async def close_db():
    """Close the database connection."""
    global _db
    if _db is not None:
        await _db.close()
        _db = None
