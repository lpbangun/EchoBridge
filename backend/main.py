from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, Response
from fastapi.staticfiles import StaticFiles

from database import get_db, close_db
from routers import sessions, transcribe, interpret, export, settings, rooms, sockets, stream, agent, storage, series, chat


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: ensure DB is initialized
    await get_db()

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

# Cloud storage router
app.include_router(storage.router)

# MCP server (optional — only if mcp package is installed)
try:
    from mcp_server import create_mcp_app
    app.mount("/mcp", create_mcp_app())
except ImportError:
    pass


@app.get("/api/health")
async def health_check():
    return {"status": "ok", "service": "echobridge"}


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
