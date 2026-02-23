"""Tests for socket endpoints."""

import pytest


@pytest.mark.asyncio
async def test_list_sockets(client):
    resp = await client.get("/api/sockets")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) >= 5  # 5 preset sockets
    ids = [s["id"] for s in data]
    assert "action_items" in ids
    assert "decisions" in ids
    assert "devils_advocate" in ids
    assert "executive_brief" in ids
    assert "concept_extractor" in ids


@pytest.mark.asyncio
async def test_get_socket(client):
    # Ensure presets are loaded
    await client.get("/api/sockets")

    resp = await client.get("/api/sockets/action_items")
    assert resp.status_code == 200
    data = resp.json()
    assert data["name"] == "Action Items"
    assert data["is_preset"] is True
    assert "items" in data["output_schema"]["properties"]


@pytest.mark.asyncio
async def test_get_socket_not_found(client):
    resp = await client.get("/api/sockets/nonexistent")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_create_custom_socket(client):
    resp = await client.post("/api/sockets", json={
        "id": "test_socket",
        "name": "Test Socket",
        "description": "A test socket",
        "category": "meta",
        "system_prompt": "Test prompt",
        "output_schema": {
            "type": "object",
            "properties": {"result": {"type": "string"}},
            "required": ["result"],
        },
    })
    assert resp.status_code == 200
    data = resp.json()
    assert data["id"] == "test_socket"
    assert data["is_preset"] is False
