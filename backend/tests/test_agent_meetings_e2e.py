"""E2E tests for the agent meeting system.

Tests multi-agent meeting creation, joining, wall interactions,
and human recording → agent access flows.
"""

import json
import uuid
from datetime import datetime, timezone
from unittest.mock import AsyncMock, patch

import pytest


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def _create_api_key(client, db, name="test-agent", scopes=None):
    """Create an API key and return the bearer token."""
    body = {"name": name}
    if scopes is not None:
        body["scopes"] = scopes
    resp = await client.post("/api/settings/api-keys", json=body)
    assert resp.status_code == 200, resp.text
    return resp.json()["key"]


async def _auth(client, key):
    """Return headers dict for bearer auth."""
    return {"Authorization": f"Bearer {key}"}


async def _create_session_with_transcript(client, db, transcript=None):
    """Create a session and submit a transcript."""
    resp = await client.post("/api/sessions", json={
        "title": "Agent E2E Test Session",
        "context": "startup_meeting",
        "context_metadata": {"project": "TestProject"},
    })
    session_id = resp.json()["id"]
    await client.post(f"/api/sessions/{session_id}/transcript", json={
        "transcript": transcript or "We discussed the pricing model and decided to go with usage-based pricing.",
        "duration_seconds": 300,
    })
    return session_id


# ---------------------------------------------------------------------------
# Group A: Multi-Agent Meeting Creation & Joining
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@patch("database.get_db_connection", new_callable=AsyncMock)
@patch("services.orchestrator_service.MeetingOrchestrator.start", new_callable=AsyncMock)
@patch("services.orchestrator_service.call_ai", new_callable=AsyncMock)
async def test_create_meeting_with_multiple_agents(mock_ai, mock_start, mock_db_conn, client, db):
    """Creating a meeting with multiple agents auto-starts and posts to wall."""
    mock_ai.return_value = "[PASS]"
    mock_db_conn.return_value = db

    key = await _create_api_key(client, db, name="agent-alpha")
    headers = await _auth(client, key)

    resp = await client.post("/api/v1/meetings", headers=headers, json={
        "topic": "Q3 Planning",
        "agents": [
            {"name": "Strategist", "type": "internal"},
            {"name": "Analyst", "type": "internal"},
            {"name": "ExternalBot", "type": "external"},
        ],
        "task_description": "Decide top priorities",
        "max_rounds": 2,
        "auto_start": True,
    })
    assert resp.status_code == 200, resp.text
    data = resp.json()

    assert "code" in data
    assert data["session_id"]
    assert data["status"] == "active"
    mock_start.assert_called_once()

    # Verify wall post was auto-created announcing the meeting
    wall_resp = await client.get("/api/wall")
    assert wall_resp.status_code == 200
    posts = wall_resp.json()["posts"]
    meeting_posts = [p for p in posts if "Q3 Planning" in p["content"]]
    assert len(meeting_posts) >= 1
    assert data["code"] in meeting_posts[0]["content"]


@pytest.mark.asyncio
async def test_external_agent_joins_active_meeting(client, db):
    """An external agent can join a meeting in waiting status."""
    key_alpha = await _create_api_key(client, db, name="agent-alpha")
    key_beta = await _create_api_key(client, db, name="agent-beta")
    headers_alpha = await _auth(client, key_alpha)
    headers_beta = await _auth(client, key_beta)

    # Create meeting without auto_start → status=waiting
    resp = await client.post("/api/v1/meetings", headers=headers_alpha, json={
        "topic": "Join Test",
        "agents": [{"name": "agent-alpha", "type": "external"}],
        "auto_start": False,
    })
    assert resp.status_code == 200
    code = resp.json()["code"]

    # Agent-beta joins
    join_resp = await client.post(
        f"/api/v1/meetings/{code}/join",
        headers=headers_beta,
        json={},
    )
    assert join_resp.status_code == 200
    assert join_resp.json()["status"] == "joined"
    assert join_resp.json()["agent_name"] == "agent-beta"

    # Verify both agents listed
    meeting_resp = await client.get(f"/api/v1/meetings/{code}", headers=headers_alpha)
    assert meeting_resp.status_code == 200
    participant_names = [p["name"] for p in meeting_resp.json()["participants"]]
    assert "agent-alpha" in participant_names
    assert "agent-beta" in participant_names


@pytest.mark.asyncio
async def test_multiple_external_agents_join(client, db):
    """Multiple external agents can join the same meeting."""
    keys = {}
    for name in ["agent-a", "agent-b", "agent-c"]:
        keys[name] = await _create_api_key(client, db, name=name)

    # Creator creates meeting
    creator_key = await _create_api_key(client, db, name="creator")
    creator_headers = await _auth(client, creator_key)

    resp = await client.post("/api/v1/meetings", headers=creator_headers, json={
        "topic": "Multi-Join Test",
        "agents": [{"name": "creator", "type": "external"}],
        "auto_start": False,
    })
    code = resp.json()["code"]

    # All 3 agents join
    for name, key in keys.items():
        join_resp = await client.post(
            f"/api/v1/meetings/{code}/join",
            headers=await _auth(client, key),
            json={},
        )
        assert join_resp.status_code == 200, f"{name} failed to join: {join_resp.text}"

    # Verify all 3 + creator in participants
    meeting_resp = await client.get(f"/api/v1/meetings/{code}", headers=creator_headers)
    participant_names = [p["name"] for p in meeting_resp.json()["participants"]]
    for name in ["creator", "agent-a", "agent-b", "agent-c"]:
        assert name in participant_names, f"{name} not in participants: {participant_names}"


@pytest.mark.asyncio
async def test_duplicate_join_rejected(client, db):
    """Joining the same meeting twice is rejected."""
    key = await _create_api_key(client, db, name="agent-dup")
    headers = await _auth(client, key)

    resp = await client.post("/api/v1/meetings", headers=headers, json={
        "topic": "Dup Test",
        "agents": [{"name": "agent-dup", "type": "external"}],
        "auto_start": False,
    })
    code = resp.json()["code"]

    # Already a participant from creation, joining again should fail
    join_resp = await client.post(
        f"/api/v1/meetings/{code}/join",
        headers=headers,
        json={},
    )
    assert join_resp.status_code == 400
    assert "Already" in join_resp.json()["detail"]


@pytest.mark.asyncio
async def test_join_closed_meeting_rejected(client, db):
    """Cannot join a meeting that has been closed."""
    key = await _create_api_key(client, db, name="agent-close")
    headers = await _auth(client, key)

    resp = await client.post("/api/v1/meetings", headers=headers, json={
        "topic": "Close Test",
        "agents": [{"name": "agent-close", "type": "external"}],
        "auto_start": False,
    })
    code = resp.json()["code"]

    # Manually close the meeting room
    cursor = await db.execute("SELECT id FROM rooms WHERE code = ?", (code,))
    room = await cursor.fetchone()
    await db.execute("UPDATE rooms SET status = 'closed' WHERE id = ?", (room["id"],))
    await db.commit()

    # Try joining with another agent
    key2 = await _create_api_key(client, db, name="agent-late")
    join_resp = await client.post(
        f"/api/v1/meetings/{code}/join",
        headers=await _auth(client, key2),
        json={},
    )
    assert join_resp.status_code == 400
    assert "closed" in join_resp.json()["detail"].lower()


@pytest.mark.asyncio
async def test_list_active_meetings(client, db):
    """Listing meetings filters by status correctly."""
    key = await _create_api_key(client, db, name="agent-list")
    headers = await _auth(client, key)

    # Create 2 meetings in waiting state
    codes = []
    for i in range(2):
        resp = await client.post("/api/v1/meetings", headers=headers, json={
            "topic": f"List Test {i}",
            "agents": [{"name": "agent-list", "type": "external"}],
            "auto_start": False,
        })
        assert resp.status_code == 200
        codes.append(resp.json()["code"])

    # List with status=waiting
    list_resp = await client.get("/api/v1/meetings?status=waiting", headers=headers)
    assert list_resp.status_code == 200
    meeting_codes = [m["code"] for m in list_resp.json()["meetings"]]
    for code in codes:
        assert code in meeting_codes

    # Default listing (open meetings) also shows them
    list_resp = await client.get("/api/v1/meetings", headers=headers)
    assert list_resp.status_code == 200
    assert list_resp.json()["count"] >= 2


# ---------------------------------------------------------------------------
# Group B: Wall Interactions (Multiple Agents)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_multiple_agents_post_on_wall(client, db):
    """Multiple agents can post and all posts show correct attribution."""
    agents = {}
    for name in ["agent-x", "agent-y", "agent-z"]:
        agents[name] = await _create_api_key(client, db, name=name)

    # Each agent posts
    for name, key in agents.items():
        resp = await client.post(
            "/api/v1/wall",
            headers=await _auth(client, key),
            json={"content": f"Hello from {name}!"},
        )
        assert resp.status_code == 201, f"{name} post failed: {resp.text}"
        assert resp.json()["agent_name"] == name

    # Read wall and verify all posts
    wall_resp = await client.get("/api/wall")
    assert wall_resp.status_code == 200
    posts = wall_resp.json()["posts"]
    post_agents = {p["agent_name"] for p in posts if p["content"].startswith("Hello from")}
    assert post_agents == {"agent-x", "agent-y", "agent-z"}


@pytest.mark.asyncio
async def test_agent_replies_to_wall_post(client, db):
    """An agent can reply to another agent's wall post."""
    key_x = await _create_api_key(client, db, name="agent-x")
    key_y = await _create_api_key(client, db, name="agent-y")

    # Agent-x creates a post
    post_resp = await client.post(
        "/api/v1/wall",
        headers=await _auth(client, key_x),
        json={"content": "Anyone want to discuss the roadmap?"},
    )
    assert post_resp.status_code == 201
    post_id = post_resp.json()["id"]

    # Agent-y replies
    reply_resp = await client.post(
        "/api/v1/wall",
        headers=await _auth(client, key_y),
        json={
            "content": "Yes, let's set up a meeting!",
            "post_type": "reply",
            "parent_id": post_id,
        },
    )
    assert reply_resp.status_code == 201
    assert reply_resp.json()["parent_id"] == post_id

    # Get replies for the post
    replies_resp = await client.get(f"/api/wall/{post_id}/replies")
    assert replies_resp.status_code == 200
    replies = replies_resp.json()["replies"]
    assert len(replies) == 1
    assert replies[0]["agent_name"] == "agent-y"
    assert "meeting" in replies[0]["content"]


@pytest.mark.asyncio
async def test_agent_reacts_to_wall_post(client, db):
    """Multiple agents can react to the same wall post with emojis."""
    key_x = await _create_api_key(client, db, name="agent-x")
    key_y = await _create_api_key(client, db, name="agent-y")
    key_z = await _create_api_key(client, db, name="agent-z")

    # Agent-x creates a post
    post_resp = await client.post(
        "/api/v1/wall",
        headers=await _auth(client, key_x),
        json={"content": "Great meeting today!"},
    )
    post_id = post_resp.json()["id"]

    # Agent-y reacts
    react_resp = await client.post(
        f"/api/v1/wall/{post_id}/react",
        headers=await _auth(client, key_y),
        json={"emoji": "thumbsup"},
    )
    assert react_resp.status_code == 200
    assert "agent-y" in react_resp.json()["reactions"]["thumbsup"]

    # Agent-z reacts with same emoji
    react_resp = await client.post(
        f"/api/v1/wall/{post_id}/react",
        headers=await _auth(client, key_z),
        json={"emoji": "thumbsup"},
    )
    assert react_resp.status_code == 200
    reactions = react_resp.json()["reactions"]
    assert "agent-y" in reactions["thumbsup"]
    assert "agent-z" in reactions["thumbsup"]


@pytest.mark.asyncio
@patch("services.orchestrator_service.call_ai", new_callable=AsyncMock)
async def test_meeting_creation_auto_posts_to_wall(mock_ai, client, db):
    """Creating a meeting automatically posts to the wall with topic and join code."""
    mock_ai.return_value = "[PASS]"

    key = await _create_api_key(client, db, name="wall-poster")
    headers = await _auth(client, key)

    resp = await client.post("/api/v1/meetings", headers=headers, json={
        "topic": "Auto Wall Post Test",
        "agents": [{"name": "wall-poster", "type": "external"}],
        "task_description": "Test wall auto-post",
        "auto_start": False,
    })
    assert resp.status_code == 200
    code = resp.json()["code"]

    # Check the wall
    wall_resp = await client.get("/api/wall")
    posts = wall_resp.json()["posts"]
    auto_posts = [p for p in posts if "Auto Wall Post Test" in p["content"]]
    assert len(auto_posts) >= 1
    assert code in auto_posts[0]["content"]
    assert auto_posts[0]["agent_name"] == "wall-poster"


@pytest.mark.asyncio
async def test_wall_scope_enforcement(client, db):
    """An API key without wall:write scope cannot post to the wall."""
    key = await _create_api_key(
        client, db, name="read-only", scopes=["sessions:read"]
    )
    headers = await _auth(client, key)

    resp = await client.post(
        "/api/v1/wall",
        headers=headers,
        json={"content": "Should not work"},
    )
    assert resp.status_code == 403


# ---------------------------------------------------------------------------
# Group C: Human Recording → Agent Access to Transcript & Summary
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_agent_sees_transcript_after_recording(client, db):
    """After a human records a session, an agent can read the transcript."""
    session_id = await _create_session_with_transcript(client, db)
    key = await _create_api_key(client, db, name="reader-agent")
    headers = await _auth(client, key)

    # Agent reads transcript
    resp = await client.get(
        f"/api/v1/sessions/{session_id}/transcript",
        headers=headers,
    )
    assert resp.status_code == 200
    assert "pricing" in resp.json()["transcript"]

    # Agent reads session details
    resp = await client.get(
        f"/api/v1/sessions/{session_id}",
        headers=headers,
    )
    assert resp.status_code == 200
    assert resp.json()["id"] == session_id


@pytest.mark.asyncio
@patch("services.interpret_service.call_openrouter", new_callable=AsyncMock)
async def test_agent_sees_interpretations_after_recording(mock_ai, client, db):
    """Agent can list interpretations created after a human recording."""
    mock_ai.return_value = "## Meeting Notes\n- Discussed pricing model"

    session_id = await _create_session_with_transcript(client, db)
    key = await _create_api_key(client, db, name="interpret-reader")
    headers = await _auth(client, key)

    # Human triggers interpretation (via non-agent endpoint)
    interp_resp = await client.post(
        f"/api/sessions/{session_id}/interpret",
        json={"lens_id": "startup_meeting"},
    )
    assert interp_resp.status_code == 200

    # Agent reads interpretations
    resp = await client.get(
        f"/api/v1/sessions/{session_id}/interpretations",
        headers=headers,
    )
    assert resp.status_code == 200
    interpretations = resp.json()
    assert len(interpretations) >= 1
    assert "pricing" in interpretations[0]["output_markdown"].lower() or "meeting" in interpretations[0]["output_markdown"].lower()


@pytest.mark.asyncio
@patch("services.interpret_service.call_openrouter", new_callable=AsyncMock)
async def test_agent_creates_own_interpretation(mock_ai, client, db):
    """An agent can create its own interpretation with a custom prompt."""
    mock_ai.return_value = "## Agent Analysis\n- Revenue model looks promising"

    session_id = await _create_session_with_transcript(client, db)
    key = await _create_api_key(client, db, name="analyst-agent")
    headers = await _auth(client, key)

    resp = await client.post(
        f"/api/v1/sessions/{session_id}/interpret",
        headers=headers,
        json={"system_prompt": "Analyze this meeting for business insights."},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["source_type"] == "agent"
    assert data["source_name"] == "analyst-agent"
    assert "Agent Analysis" in data["output_markdown"]


@pytest.mark.asyncio
async def test_agent_discovers_session_via_events(client, db):
    """Agent can discover completed sessions via the events endpoint."""
    session_id = await _create_session_with_transcript(client, db)
    key = await _create_api_key(client, db, name="event-watcher")
    headers = await _auth(client, key)

    # Insert a session.complete event
    event_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    await db.execute(
        """INSERT INTO session_events (id, event_type, session_id, context, title, interpretations_count, created_at)
        VALUES (?, 'session.complete', ?, 'startup_meeting', 'Test', 0, ?)""",
        (event_id, session_id, now),
    )
    await db.commit()

    # Agent polls events
    resp = await client.get("/api/v1/events", headers=headers)
    assert resp.status_code == 200
    events = resp.json()["events"]
    found = [e for e in events if e["session_id"] == session_id]
    assert len(found) >= 1
    assert found[0]["event_type"] == "session.complete"

    # Agent uses the session_id from the event to access the transcript
    transcript_resp = await client.get(
        f"/api/v1/sessions/{session_id}/transcript",
        headers=headers,
    )
    assert transcript_resp.status_code == 200
    assert "pricing" in transcript_resp.json()["transcript"]


@pytest.mark.asyncio
@patch("services.interpret_service.call_openrouter", new_callable=AsyncMock)
async def test_multiple_agents_interpret_same_session(mock_ai, client, db):
    """Two different agents can each create their own interpretation of the same session."""
    session_id = await _create_session_with_transcript(client, db)

    key_a = await _create_api_key(client, db, name="agent-a")
    key_b = await _create_api_key(client, db, name="agent-b")

    # Agent-a interprets
    mock_ai.return_value = "## Analysis A\n- First agent's perspective"
    resp_a = await client.post(
        f"/api/v1/sessions/{session_id}/interpret",
        headers=await _auth(client, key_a),
        json={"system_prompt": "Analyze for strategic insights."},
    )
    assert resp_a.status_code == 200
    assert resp_a.json()["source_name"] == "agent-a"

    # Agent-b interprets
    mock_ai.return_value = "## Analysis B\n- Second agent's perspective"
    resp_b = await client.post(
        f"/api/v1/sessions/{session_id}/interpret",
        headers=await _auth(client, key_b),
        json={"system_prompt": "Analyze for risk factors."},
    )
    assert resp_b.status_code == 200
    assert resp_b.json()["source_name"] == "agent-b"

    # Both interpretations visible
    key_reader = await _create_api_key(client, db, name="reader")
    resp = await client.get(
        f"/api/v1/sessions/{session_id}/interpretations",
        headers=await _auth(client, key_reader),
    )
    assert resp.status_code == 200
    interps = resp.json()
    source_names = {i["source_name"] for i in interps}
    assert "agent-a" in source_names
    assert "agent-b" in source_names
    assert len(interps) >= 2
