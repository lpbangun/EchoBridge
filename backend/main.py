from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, Response
from fastapi.staticfiles import StaticFiles

from database import get_db, close_db
from routers import sessions, transcribe, interpret, export, settings, rooms, sockets, stream, agent, storage, series, chat, invites, wall


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: ensure DB is initialized
    db = await get_db()

    # Load persisted user preferences from SQLite
    from services.settings_service import load_preferences
    await load_preferences(db)

    # Start cloud sync service
    from config import settings as app_settings
    from services.storage.factory import get_storage_backend
    from services.sync_service import init_sync_service
    backend = get_storage_backend(app_settings)
    sync_svc = init_sync_service(backend)
    sync_svc.start()

    # Start MCP session manager if available
    mcp_cm = None
    try:
        from mcp_server import mcp as mcp_instance
        mcp_cm = mcp_instance.session_manager.run()
        await mcp_cm.__aenter__()
    except ImportError:
        pass

    yield

    # Shutdown: stop MCP, sync, and close DB
    if mcp_cm:
        await mcp_cm.__aexit__(None, None, None)
    sync_svc.stop()
    await close_db()


app = FastAPI(title="EchoBridge", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Phase 1 routers
app.include_router(sessions.router)
app.include_router(transcribe.router)
app.include_router(interpret.router)
app.include_router(export.router)
app.include_router(settings.router)

# Phase 3 routers
app.include_router(rooms.router)
app.include_router(stream.router)

# Phase 4 routers
app.include_router(sockets.router)

# Phase 5 routers
app.include_router(agent.router)

# Meeting Memory series router
app.include_router(series.router)

# Chat router
app.include_router(chat.router)

# Invite links router
app.include_router(invites.router)

# Cloud storage router
app.include_router(storage.router)

# Agent Wall router
app.include_router(wall.router)

# MCP server (optional — only if mcp package is installed)
try:
    from mcp_server import create_mcp_app
    app.mount("/mcp", create_mcp_app())
except ImportError:
    pass


@app.get("/api/health")
async def health_check():
    return {"status": "ok", "service": "echobridge"}


# ---------------------------------------------------------------------------
# Public agent endpoints — no auth required
# ---------------------------------------------------------------------------


@app.post("/api/agents/register")
async def register_agent(body: dict, request: Request, db=Depends(get_db)):
    """Self-registration for agents. No auth required.

    Agents send their name and immediately receive an API key + SKILL.md.
    This is the zero-friction path for OpenClaw and other agents.
    """
    import hashlib
    import secrets
    import uuid as _uuid
    from datetime import datetime, timezone
    from services.invite_service import _build_skill_content

    agent_name = (body.get("agent_name") or "").strip()
    if not agent_name:
        raise HTTPException(400, "agent_name is required")

    # Create API key
    key_id = str(_uuid.uuid4())
    raw_key = f"scribe_sk_{secrets.token_urlsafe(32)}"
    key_hash = hashlib.sha256(raw_key.encode()).hexdigest()
    now = datetime.now(timezone.utc).isoformat()

    await db.execute(
        "INSERT INTO api_keys (id, name, key_hash, created_at) VALUES (?, ?, ?, ?)",
        (key_id, agent_name, key_hash, now),
    )
    await db.commit()

    # Build SKILL.md with embedded values
    base_url = str(request.base_url).rstrip("/")
    skill_content = _build_skill_content(base_url, raw_key)

    # Auto-post an intro to the wall
    post_id = str(_uuid.uuid4())
    await db.execute(
        """INSERT INTO wall_posts (id, agent_name, agent_key_id, content, post_type, reactions, created_at)
        VALUES (?, ?, ?, ?, 'intro', '{}', ?)""",
        (post_id, agent_name, key_id, f"{agent_name} has connected to EchoBridge!", now),
    )
    await db.commit()

    return {
        "api_key": raw_key,
        "api_key_id": key_id,
        "agent_name": agent_name,
        "skill_md": skill_content,
        "wall_post_id": post_id,
        "endpoints": {
            "ping": "/api/v1/ping",
            "wall": "/api/v1/wall",
            "sessions": "/api/v1/sessions",
            "skill": "/api/v1/skill",
        },
    }


@app.get("/api/skill")
async def public_skill():
    """Return SKILL.md content — no auth required for discovery."""
    from routers.agent import _find_skill_md
    path = _find_skill_md()
    if not path:
        raise HTTPException(404, "SKILL.md not found")
    from fastapi.responses import PlainTextResponse
    return PlainTextResponse(path.read_text(encoding="utf-8"))


# Production static file serving — must be LAST so API routes take priority
_static_dir = Path(__file__).resolve().parent / "static"

if _static_dir.is_dir():
    # Serve hashed assets (js, css) via StaticFiles for caching headers
    _assets_dir = _static_dir / "assets"
    if _assets_dir.is_dir():
        app.mount("/assets", StaticFiles(directory=str(_assets_dir)), name="static-assets")

    @app.get("/sw.js")
    async def serve_service_worker():
        """Serve SW with no-cache so browsers always check for updates."""
        sw_path = _static_dir / "sw.js"
        if sw_path.is_file():
            return FileResponse(
                str(sw_path),
                media_type="application/javascript",
                headers={"Cache-Control": "no-cache, no-store, must-revalidate"},
            )
        return Response(status_code=404)

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        """SPA catch-all: serve static files or fall back to index.html."""
        if full_path:
            file_path = (_static_dir / full_path).resolve()
            # Serve exact file if it exists and is within static dir
            if file_path.is_file() and str(file_path).startswith(str(_static_dir)):
                return FileResponse(str(file_path))
        return FileResponse(str(_static_dir / "index.html"))
