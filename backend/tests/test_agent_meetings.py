"""Tests for agent meeting endpoints (/api/rooms/meeting)."""

import pytest


# --- Helper ---

def _meeting_payload(**overrides) -> dict:
    """Return a valid agent meeting creation payload, with optional overrides."""
    base = {
        "topic": "Microservices vs Monolith",
        "host_name": "Logani",
        "agents": [
            {"name": "Architect", "type": "internal"},
            {"name": "DevOps Lead", "type": "internal"},
        ],
        "task_description": "Debate the pros and cons",
        "cooldown_seconds": 3.0,
        "max_rounds": 10,
    }
    base.update(overrides)
    return base


async def _create_meeting(client) -> dict:
    """Helper to create a meeting and return the response data."""
    resp = await client.post("/api/rooms/meeting", json=_meeting_payload())
    assert resp.status_code == 200
    return resp.json()


async def _create_standard_room(client) -> dict:
    """Helper to create a standard (non-meeting) room."""
    resp = await client.post("/api/rooms", json={
        "context": "startup_meeting",
        "title": "Standard Room",
        "host_name": "Host",
    })
    assert resp.status_code == 200
    return resp.json()


# --- Tests ---


@pytest.mark.asyncio
async def test_create_agent_meeting(client):
    """POST /api/rooms/meeting with valid payload returns all expected fields."""
    resp = await client.post("/api/rooms/meeting", json=_meeting_payload())
    assert resp.status_code == 200
    data = resp.json()

    assert "room_id" in data
    assert "code" in data
    assert "session_id" in data
    assert data["status"] == "waiting"
    assert data["host_name"] == "Logani"
    assert data["topic"] == "Microservices vs Monolith"
    assert isinstance(data["agents"], list)
    assert len(data["agents"]) == 2
    assert data["agents"][0]["name"] == "Architect"
    assert data["agents"][1]["name"] == "DevOps Lead"
    assert "created_at" in data


@pytest.mark.asyncio
async def test_create_agent_meeting_validation_too_few_agents(client):
    """POST /api/rooms/meeting with <2 agents should return 422."""
    payload = _meeting_payload(agents=[
        {"name": "Solo Agent", "type": "internal"},
    ])
    resp = await client.post("/api/rooms/meeting", json=payload)
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_create_agent_meeting_max_agents(client):
    """POST /api/rooms/meeting with >4 agents should return 422."""
    payload = _meeting_payload(agents=[
        {"name": f"Agent {i}", "type": "internal"} for i in range(5)
    ])
    resp = await client.post("/api/rooms/meeting", json=payload)
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_get_agent_meeting(client):
    """Create a meeting, then GET /api/rooms/{code}/meeting returns its details."""
    create_data = await _create_meeting(client)
    code = create_data["code"]

    resp = await client.get(f"/api/rooms/{code}/meeting")
    assert resp.status_code == 200
    data = resp.json()

    assert data["room_id"] == create_data["room_id"]
    assert data["code"] == code
    assert data["session_id"] == create_data["session_id"]
    assert data["status"] == "waiting"
    assert data["host_name"] == "Logani"
    assert data["topic"] == "Microservices vs Monolith"
    assert len(data["agents"]) == 2


@pytest.mark.asyncio
async def test_get_meeting_standard_room_rejects(client):
    """GET /api/rooms/{code}/meeting on a standard room should return 400."""
    room_data = await _create_standard_room(client)
    code = room_data["code"]

    resp = await client.get(f"/api/rooms/{code}/meeting")
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_get_meeting_messages_empty(client):
    """GET /api/rooms/{code}/meeting/messages returns empty list for new meeting."""
    create_data = await _create_meeting(client)
    code = create_data["code"]

    resp = await client.get(f"/api/rooms/{code}/meeting/messages?after_sequence=0")
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, list)
    assert len(data) == 0


@pytest.mark.asyncio
async def test_meeting_lifecycle_no_start(client):
    """Create a meeting (status=waiting), pause without starting returns 404."""
    create_data = await _create_meeting(client)
    code = create_data["code"]

    # Verify initial status is waiting
    assert create_data["status"] == "waiting"

    # Pause without starting -- no orchestrator exists, so 404
    resp = await client.post(f"/api/rooms/{code}/meeting/pause")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_send_directive_no_meeting(client):
    """POST /api/rooms/{code}/meeting/directive without starting returns 404."""
    create_data = await _create_meeting(client)
    code = create_data["code"]

    resp = await client.post(f"/api/rooms/{code}/meeting/directive", json={
        "text": "Focus on security implications",
        "from_name": "Logani",
    })
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_send_human_message_no_meeting(client):
    """POST /api/rooms/{code}/meeting/message without starting returns 404."""
    create_data = await _create_meeting(client)
    code = create_data["code"]

    resp = await client.post(f"/api/rooms/{code}/meeting/message", json={
        "text": "What about hybrid approaches?",
        "from_name": "Logani",
    })
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_meeting_state_no_meeting(client):
    """GET /api/rooms/{code}/meeting/state without starting returns 404."""
    create_data = await _create_meeting(client)
    code = create_data["code"]

    resp = await client.get(f"/api/rooms/{code}/meeting/state")
    assert resp.status_code == 404
