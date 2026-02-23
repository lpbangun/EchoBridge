import aiosqlite
import os
from config import settings

_db: aiosqlite.Connection | None = None

SCHEMA = """
CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    title TEXT,
    context TEXT NOT NULL,
    context_metadata JSON DEFAULT '{}',
    room_id TEXT REFERENCES rooms(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    duration_seconds INTEGER,
    status TEXT DEFAULT 'created',
    transcript TEXT,
    stt_provider TEXT,
    audio_path TEXT,
    host_name TEXT,
    error_message TEXT
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
    settings JSON DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS room_participants (
    id TEXT PRIMARY KEY,
    room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    participant_type TEXT NOT NULL,
    connected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    agent_name TEXT
);

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
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_used_at TIMESTAMP
);

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
    return _db


async def close_db():
    """Close the database connection."""
    global _db
    if _db is not None:
        await _db.close()
        _db = None
