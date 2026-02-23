"""Tests for session CRUD endpoints."""

import pytest


@pytest.mark.asyncio
async def test_create_session(client, sample_session):
    resp = await client.post("/api/sessions", json=sample_session)
    assert resp.status_code == 200
    data = resp.json()
    assert data["title"] == "Test Meeting"
    assert data["context"] == "startup_meeting"
    assert data["status"] == "created"
    assert data["id"]


@pytest.mark.asyncio
async def test_list_sessions(client, sample_session):
    await client.post("/api/sessions", json=sample_session)
    await client.post("/api/sessions", json=sample_session)
    resp = await client.get("/api/sessions")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 2


@pytest.mark.asyncio
async def test_list_sessions_filter_context(client, sample_session):
    await client.post("/api/sessions", json=sample_session)
    await client.post("/api/sessions", json={**sample_session, "context": "class_lecture"})
    resp = await client.get("/api/sessions?context=class_lecture")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1
    assert data[0]["context"] == "class_lecture"


@pytest.mark.asyncio
async def test_get_session(client, sample_session):
    create_resp = await client.post("/api/sessions", json=sample_session)
    session_id = create_resp.json()["id"]
    resp = await client.get(f"/api/sessions/{session_id}")
    assert resp.status_code == 200
    assert resp.json()["id"] == session_id


@pytest.mark.asyncio
async def test_get_session_not_found(client):
    resp = await client.get("/api/sessions/nonexistent")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_update_session(client, sample_session):
    create_resp = await client.post("/api/sessions", json=sample_session)
    session_id = create_resp.json()["id"]
    resp = await client.patch(
        f"/api/sessions/{session_id}",
        json={"title": "Updated Title"},
    )
    assert resp.status_code == 200
    assert resp.json()["title"] == "Updated Title"


@pytest.mark.asyncio
async def test_update_session_not_found(client):
    resp = await client.patch(
        "/api/sessions/nonexistent",
        json={"title": "Nope"},
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_delete_session(client, sample_session):
    create_resp = await client.post("/api/sessions", json=sample_session)
    session_id = create_resp.json()["id"]
    resp = await client.delete(f"/api/sessions/{session_id}")
    assert resp.status_code == 200
    # Verify deleted
    resp = await client.get(f"/api/sessions/{session_id}")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_delete_session_not_found(client):
    resp = await client.delete("/api/sessions/nonexistent")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_create_session_bad_context(client):
    resp = await client.post("/api/sessions", json={
        "title": "Bad",
        "context": "invalid_context",
    })
    assert resp.status_code == 422
