from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from database import get_db, close_db
from routers import sessions, transcribe, interpret, export, settings, rooms, sockets, stream, agent, storage


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

    yield

    # Shutdown: stop sync and close DB
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

# Cloud storage router
app.include_router(storage.router)


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

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        """SPA catch-all: serve static files or fall back to index.html."""
        if full_path:
            file_path = (_static_dir / full_path).resolve()
            # Serve exact file if it exists and is within static dir
            if file_path.is_file() and str(file_path).startswith(str(_static_dir)):
                return FileResponse(str(file_path))
        return FileResponse(str(_static_dir / "index.html"))
