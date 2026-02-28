"""FTS5 search service across sessions and interpretations."""



async def search(db, query: str, limit: int = 20) -> list[dict]:
    """Search across sessions and interpretations using FTS5."""
    results = []

    # Search sessions
    cursor = await db.execute(
        """SELECT s.id, s.title, s.context, s.created_at,
                  snippet(sessions_fts, 1, '<mark>', '</mark>', '...', 32) as snippet
           FROM sessions_fts
           JOIN sessions s ON sessions_fts.rowid = s.rowid
           WHERE sessions_fts MATCH ?
           ORDER BY rank
           LIMIT ?""",
        (query, limit),
    )
    rows = await cursor.fetchall()
    for row in rows:
        results.append({
            "type": "session",
            "id": row["id"],
            "session_id": row["id"],
            "title": row["title"],
            "context": row["context"],
            "snippet": row["snippet"] or "",
            "created_at": row["created_at"],
        })

    # Search interpretations
    cursor = await db.execute(
        """SELECT i.id, i.session_id, i.created_at,
                  s.title, s.context,
                  snippet(interpretations_fts, 0, '<mark>', '</mark>', '...', 32) as snippet
           FROM interpretations_fts
           JOIN interpretations i ON interpretations_fts.rowid = i.rowid
           JOIN sessions s ON i.session_id = s.id
           WHERE interpretations_fts MATCH ?
           ORDER BY rank
           LIMIT ?""",
        (query, limit),
    )
    rows = await cursor.fetchall()
    for row in rows:
        results.append({
            "type": "interpretation",
            "id": row["id"],
            "session_id": row["session_id"],
            "title": row["title"],
            "context": row["context"],
            "snippet": row["snippet"] or "",
            "created_at": row["created_at"],
        })

    return results
