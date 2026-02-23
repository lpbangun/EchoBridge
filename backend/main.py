from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from database import get_db, close_db
from routers import sessions, transcribe, interpret, export, settings, rooms, sockets, stream, agent


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: ensure DB is initialized
    await get_db()
    yield
    # Shutdown: close DB
    await close_db()


app = FastAPI(title="EchoBridge", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
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


@app.get("/api/health")
async def health_check():
    return {"status": "ok", "service": "echobridge"}
