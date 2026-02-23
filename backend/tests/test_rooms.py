"""Tests for room endpoints."""

import pytest


@pytest.mark.asyncio
async def test_create_room(client):
    resp = await client.post("/api/rooms", json={
        "context": "startup_meeting",
        "title": "Probixio Weekly",
        "host_name": "Logani",
        "context_metadata": {"project": "Probixio"},
    })
    assert resp.status_code == 200
    data = resp.json()
    assert data["code"].startswith("PROB")
    assert data["status"] == "waiting"
    assert data["session_id"]


@pytest.mark.asyncio
async def test_join_room(client):
    create_resp = await client.post("/api/rooms", json={
        "context": "startup_meeting",
        "title": "Test Room",
        "host_name": "Host",
    })
    code = create_resp.json()["code"]

    join_resp = await client.post("/api/rooms/join", json={
        "code": code,
        "name": "Sarah",
        "type": "human",
    })
    assert join_resp.status_code == 200
    assert join_resp.json()["code"] == code


@pytest.mark.asyncio
async def test_join_room_not_found(client):
    resp = await client.post("/api/rooms/join", json={
        "code": "NONE-0000",
        "name": "Nobody",
    })
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_get_room(client):
    create_resp = await client.post("/api/rooms", json={
        "context": "class_lecture",
        "title": "HGSE T550",
        "host_name": "Professor",
    })
    code = create_resp.json()["code"]

    resp = await client.get(f"/api/rooms/{code}")
    assert resp.status_code == 200
    assert resp.json()["host_name"] == "Professor"
    assert len(resp.json()["participants"]) == 1


@pytest.mark.asyncio
async def test_room_start_stop(client):
    create_resp = await client.post("/api/rooms", json={
        "context": "startup_meeting",
        "title": "Test",
        "host_name": "Host",
    })
    code = create_resp.json()["code"]

    # Start recording
    resp = await client.post(f"/api/rooms/{code}/start")
    assert resp.status_code == 200
    assert resp.json()["status"] == "recording"

    # Stop recording
    resp = await client.post(f"/api/rooms/{code}/stop")
    assert resp.status_code == 200
    assert resp.json()["status"] == "processing"


@pytest.mark.asyncio
async def test_get_room_not_found(client):
    resp = await client.get("/api/rooms/NOPE-0000")
    assert resp.status_code == 404
