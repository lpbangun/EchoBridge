"""Tests for scoped API key enforcement."""

import pytest


async def _create_api_key(client, name="test-agent", scopes=None):
    """Helper to create an API key and return the bearer token."""
    payload = {"name": name}
    if scopes is not None:
        payload["scopes"] = scopes
    resp = await client.post("/api/settings/api-keys", json=payload)
    assert resp.status_code == 200
    return resp.json()["key"]


@pytest.mark.asyncio
async def test_key_no_scopes_full_access(client, db):
    """Legacy keys (NULL scopes) can access everything."""
    key = await _create_api_key(client, "legacy")
    r = await client.get("/api/v1/sessions", headers={"Authorization": f"Bearer {key}"})
    assert r.status_code == 200


@pytest.mark.asyncio
async def test_scoped_key_sessions_read_allowed(client, db):
    key = await _create_api_key(client, "reader", scopes=["sessions:read"])
    r = await client.get("/api/v1/sessions", headers={"Authorization": f"Bearer {key}"})
    assert r.status_code == 200


@pytest.mark.asyncio
async def test_scoped_key_missing_scope_blocked(client, db):
    key = await _create_api_key(client, "rooms-only", scopes=["rooms:write"])
    r = await client.get("/api/v1/sessions", headers={"Authorization": f"Bearer {key}"})
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_scoped_key_always_allowed_endpoints(client, db):
    """Ping/skill/sockets work with any scope (uses verify_api_key, not require_scope)."""
    key = await _create_api_key(client, "minimal", scopes=["wall:read"])
    r = await client.get("/api/v1/ping", headers={"Authorization": f"Bearer {key}"})
    assert r.status_code == 200


@pytest.mark.asyncio
async def test_scoped_key_wall_read(client, db):
    """wall:read scope allows GET /api/v1/wall."""
    key = await _create_api_key(client, "wall-reader", scopes=["wall:read"])
    r = await client.get("/api/v1/wall", headers={"Authorization": f"Bearer {key}"})
    assert r.status_code == 200


@pytest.mark.asyncio
async def test_scoped_key_wall_write_blocked_without_scope(client, db):
    """wall:read scope does NOT allow POST /api/v1/wall."""
    key = await _create_api_key(client, "reader-only", scopes=["wall:read"])
    r = await client.post(
        "/api/v1/wall",
        json={"content": "hello"},
        headers={"Authorization": f"Bearer {key}"},
    )
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_scoped_key_wall_write_allowed(client, db):
    """wall:write scope allows POST /api/v1/wall."""
    key = await _create_api_key(client, "writer", scopes=["wall:write"])
    r = await client.post(
        "/api/v1/wall",
        json={"content": "hello from writer"},
        headers={"Authorization": f"Bearer {key}"},
    )
    assert r.status_code == 201


@pytest.mark.asyncio
async def test_create_api_key_with_scopes(client, db):
    """Creating an API key with scopes returns them in the response."""
    resp = await client.post("/api/settings/api-keys", json={
        "name": "scoped-agent",
        "scopes": ["sessions:read", "wall:read"],
    })
    assert resp.status_code == 200
    data = resp.json()
    assert set(data["scopes"]) == {"sessions:read", "wall:read"}


@pytest.mark.asyncio
async def test_create_api_key_invalid_scope(client, db):
    """Invalid scopes are rejected."""
    resp = await client.post("/api/settings/api-keys", json={
        "name": "bad-scopes",
        "scopes": ["sessions:read", "invalid:scope"],
    })
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_list_api_keys_shows_scopes(client, db):
    """Listing API keys includes scopes."""
    await client.post("/api/settings/api-keys", json={
        "name": "listed",
        "scopes": ["rooms:write", "wall:read"],
    })
    resp = await client.get("/api/settings/api-keys")
    assert resp.status_code == 200
    keys = resp.json()
    listed = [k for k in keys if k["name"] == "listed"]
    assert len(listed) == 1
    assert set(listed[0]["scopes"]) == {"rooms:write", "wall:read"}


@pytest.mark.asyncio
async def test_list_api_keys_null_scopes(client, db):
    """Legacy keys show scopes as None."""
    await client.post("/api/settings/api-keys", json={"name": "legacy-listed"})
    resp = await client.get("/api/settings/api-keys")
    keys = resp.json()
    legacy = [k for k in keys if k["name"] == "legacy-listed"]
    assert len(legacy) == 1
    assert legacy[0]["scopes"] is None
