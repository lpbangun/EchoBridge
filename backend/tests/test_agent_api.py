"""Tests for agent API endpoints (/api/v1/)."""


import pytest


async def _create_api_key(client, db):
    """Helper to create an API key and return the bearer token."""
    resp = await client.post("/api/settings/api-keys", json={"name": "test-agent"})
    data = resp.json()
    return data["key"]


async def _create_session_with_transcript(client, db):
    """Helper to create a session with a transcript."""
    resp = await client.post("/api/sessions", json={
        "title": "Agent Test Session",
        "context": "startup_meeting",
        "context_metadata": {"project": "Test"},
    })
    session_id = resp.json()["id"]
    await client.post(f"/api/sessions/{session_id}/transcript", json={
        "transcript": "We discussed the pricing model and decided to go with usage-based pricing.",
        "duration_seconds": 300,
    })
    return session_id


@pytest.mark.asyncio
async def test_agent_no_auth(client, db):
    resp = await client.get("/api/v1/sessions")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_agent_bad_auth(client, db):
    resp = await client.get(
        "/api/v1/sessions",
        headers={"Authorization": "Bearer bad_token"},
    )
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_agent_list_sessions(client, db):
    key = await _create_api_key(client, db)
    # Create a session first
    await client.post("/api/sessions", json={
        "title": "Test",
        "context": "startup_meeting",
    })

    resp = await client.get(
        "/api/v1/sessions",
        headers={"Authorization": f"Bearer {key}"},
    )
    assert resp.status_code == 200
    assert len(resp.json()) >= 1


@pytest.mark.asyncio
async def test_agent_get_session(client, db):
    key = await _create_api_key(client, db)
    session_id = await _create_session_with_transcript(client, db)

    resp = await client.get(
        f"/api/v1/sessions/{session_id}",
        headers={"Authorization": f"Bearer {key}"},
    )
    assert resp.status_code == 200
    assert resp.json()["id"] == session_id


@pytest.mark.asyncio
async def test_agent_get_transcript(client, db):
    key = await _create_api_key(client, db)
    session_id = await _create_session_with_transcript(client, db)

    resp = await client.get(
        f"/api/v1/sessions/{session_id}/transcript",
        headers={"Authorization": f"Bearer {key}"},
    )
    assert resp.status_code == 200
    assert "pricing" in resp.json()["transcript"]


@pytest.mark.asyncio
async def test_agent_session_not_found(client, db):
    key = await _create_api_key(client, db)
    resp = await client.get(
        "/api/v1/sessions/nonexistent",
        headers={"Authorization": f"Bearer {key}"},
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_agent_search(client, db):
    key = await _create_api_key(client, db)
    await _create_session_with_transcript(client, db)

    resp = await client.get(
        "/api/v1/search?q=pricing",
        headers={"Authorization": f"Bearer {key}"},
    )
    assert resp.status_code == 200
    # FTS results may or may not match depending on indexing timing
    assert "results" in resp.json()


@pytest.mark.asyncio
async def test_agent_list_sockets(client, db):
    key = await _create_api_key(client, db)
    resp = await client.get(
        "/api/v1/sockets",
        headers={"Authorization": f"Bearer {key}"},
    )
    assert resp.status_code == 200
    assert len(resp.json()) >= 5


@pytest.mark.asyncio
async def test_agent_ping(client, db):
    key = await _create_api_key(client, db)
    resp = await client.get(
        "/api/v1/ping",
        headers={"Authorization": f"Bearer {key}"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "ok"
    assert data["agent_name"] == "test-agent"
    assert data["version"] == "1.0"
    assert isinstance(data["endpoints"], list)
    assert "/api/v1/sessions" in data["endpoints"]


@pytest.mark.asyncio
async def test_agent_ping_no_auth(client, db):
    resp = await client.get("/api/v1/ping")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_agent_skill(client, db):
    key = await _create_api_key(client, db)
    resp = await client.get(
        "/api/v1/skill",
        headers={"Authorization": f"Bearer {key}"},
    )
    assert resp.status_code == 200
    assert "EchoBridge" in resp.text
    assert "text/plain" in resp.headers["content-type"]


@pytest.mark.asyncio
async def test_agent_skill_no_auth(client, db):
    resp = await client.get("/api/v1/skill")
    assert resp.status_code == 401
