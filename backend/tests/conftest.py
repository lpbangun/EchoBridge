"""Test fixtures for EchoBridge backend tests."""

import os
import sys
import asyncio

import pytest
import pytest_asyncio

# Ensure backend is on the path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

# Override settings before importing anything else
os.environ["DATABASE_PATH"] = ":memory:"
os.environ["AUDIO_DIR"] = "./test_audio"
os.environ["OUTPUT_DIR"] = "./test_output"
os.environ["OPENROUTER_API_KEY"] = "test-key"

from httpx import ASGITransport, AsyncClient
from main import app
from database import get_db, close_db, SCHEMA

import aiosqlite


@pytest_asyncio.fixture
async def db():
    """Create an in-memory test database."""
    conn = await aiosqlite.connect(":memory:")
    conn.row_factory = aiosqlite.Row
    await conn.execute("PRAGMA foreign_keys=ON")
    await conn.executescript(SCHEMA)
    await conn.commit()

    async def override_get_db():
        return conn

    app.dependency_overrides[get_db] = override_get_db
    yield conn
    app.dependency_overrides.clear()
    await conn.close()


@pytest_asyncio.fixture
async def client(db):
    """Create an async test client."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest.fixture
def sample_session():
    """Sample session creation payload."""
    return {
        "title": "Test Meeting",
        "context": "startup_meeting",
        "context_metadata": {"project": "TestProject"},
        "host_name": "TestUser",
    }
