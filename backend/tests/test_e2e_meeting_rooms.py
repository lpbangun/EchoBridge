"""End-to-end tests for agent meeting rooms.

Verifies the full lifecycle: agent onboarding → meeting creation → wall posting
→ joining → orchestrator conversation → transcript → finalization.
Also verifies that standard rooms, invites, and other features are not broken.

All AI calls are mocked — no external API keys needed.
"""

import asyncio
from unittest.mock import AsyncMock, patch

import pytest
import pytest_asyncio


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest_asyncio.fixture(autouse=True)
async def _cleanup_active_meetings():
    """Ensure no zombie orchestrator tasks leak between tests."""
    from services.orchestrator_service import _active_meetings

    yield

    # Cancel any still-running orchestrator background tasks
    for code, orch in list(_active_meetings.items()):
        if orch._task and not orch._task.done():
            orch._task.cancel()
            try:
                await orch._task
            except (asyncio.CancelledError, Exception):
                pass
    _active_meetings.clear()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def _register_agent(client, name: str = "TestAgent") -> dict:
    """Self-register an agent via /api/agents/register and return the response."""
    resp = await client.post("/api/agents/register", json={"agent_name": name})
    assert resp.status_code == 200, f"Agent registration failed: {resp.text}"
    data = resp.json()
    assert data["api_key"].startswith("scribe_sk_")
    return data


def _auth(key: str) -> dict:
    """Build authorization headers for an agent key."""
    return {"Authorization": f"Bearer {key}"}


async def _create_api_key(client, name: str = "test-agent") -> str:
    """Create an API key via settings endpoint (full access)."""
    resp = await client.post("/api/settings/api-keys", json={"name": name})
    assert resp.status_code == 200
    return resp.json()["key"]


def _mock_get_db_connection(db):
    """Create an async function that returns the test db (for patching get_db_connection).

    IMPORTANT: This patches ``database.get_db_connection`` at the module level.
    It works because ``routers/agent.py`` uses local imports inside function bodies
    (lines 666, 749, 796).  Python re-resolves local imports on each call, so
    patching the module attribute is sufficient.  If those imports are ever moved
    to top-level, this patch will silently stop intercepting — tests will pass but
    hit the real DB.  If that happens, add ``routers.agent.get_db_connection`` as
    an additional patch target.
    """
    async def _get_test_db():
        return db
    return _get_test_db


async def _agent_create_meeting(
    client, key: str, db, *, auto_start: bool = False, **overrides
) -> dict:
    """Agent creates a meeting room via /api/v1/meetings.

    Patches get_db_connection and AI calls when auto_start=True.
    """
    payload = {
        "topic": "Test Discussion",
        "task_description": "Discuss testing strategy",
        "agents": [
            {"name": "Analyst", "type": "internal"},
            {"name": "Critic", "type": "internal"},
        ],
        "cooldown_seconds": 0.1,
        "max_rounds": 3,
        "auto_start": auto_start,
    }
    payload.update(overrides)

    if auto_start:
        # Need to patch AI + db_connection for the orchestrator background task
        with patch("services.orchestrator_service.call_ai", new_callable=AsyncMock, return_value="[PASS]"), \
             patch("database.get_db_connection", new=_mock_get_db_connection(db)), \
             patch("services.interpret_service.auto_interpret", new_callable=AsyncMock):
            resp = await client.post("/api/v1/meetings", json=payload, headers=_auth(key))
    else:
        resp = await client.post("/api/v1/meetings", json=payload, headers=_auth(key))

    assert resp.status_code == 200, f"Meeting creation failed: {resp.text}"
    return resp.json()


async def _start_meeting_and_wait(client, db, key, code, fake_ai=None, timeout=20.0):
    """Start a meeting and wait for the orchestrator to finish.

    Returns the orchestrator instance (already completed).
    """
    from services.orchestrator_service import get_orchestrator

    if fake_ai is None:
        async def fake_ai(model, system_prompt, user_content, **kwargs):
            return "[PASS]"

    with patch("services.orchestrator_service.call_ai", side_effect=fake_ai), \
         patch("database.get_db_connection", new=_mock_get_db_connection(db)), \
         patch("services.interpret_service.auto_interpret", new_callable=AsyncMock):
        resp = await client.post(
            f"/api/v1/meetings/{code}/start",
            headers=_auth(key),
        )
        assert resp.status_code == 200

        orch = get_orchestrator(code)
        assert orch is not None

        if orch._task and not orch._task.done():
            await asyncio.wait_for(orch._task, timeout=timeout)

    return orch


async def _wait_for_status(code: str, target: str, timeout: float = 5.0):
    """Poll until orchestrator reaches the target status or timeout."""
    from services.orchestrator_service import get_orchestrator

    deadline = asyncio.get_event_loop().time() + timeout
    while asyncio.get_event_loop().time() < deadline:
        orch = get_orchestrator(code)
        if orch and orch.status == target:
            return orch
        await asyncio.sleep(0.05)
    raise TimeoutError(
        f"Orchestrator for {code} never reached status '{target}' within {timeout}s"
    )


# ---------------------------------------------------------------------------
# A. Agent Onboarding & Registration
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_agent_self_register(client, db):
    """POST /api/agents/register returns API key, wall post ID, and endpoints."""
    data = await _register_agent(client, "OnboardingAgent")
    assert data["api_key"].startswith("scribe_sk_")
    assert data["agent_name"] == "OnboardingAgent"
    assert data["api_key_id"]
    assert data["wall_post_id"]
    assert "ping" in data["endpoints"]
    assert "wall" in data["endpoints"]


@pytest.mark.asyncio
async def test_agent_register_creates_wall_intro(client, db):
    """Self-registration auto-creates an intro wall post."""
    await _register_agent(client, "IntroAgent")

    wall_resp = await client.get("/api/wall")
    assert wall_resp.status_code == 200
    posts = wall_resp.json()["posts"]
    intro_posts = [
        p for p in posts
        if p["agent_name"] == "IntroAgent" and p["post_type"] == "intro"
    ]
    assert len(intro_posts) == 1
    assert "IntroAgent" in intro_posts[0]["content"]


@pytest.mark.asyncio
async def test_agent_ping_after_register(client, db):
    """Registered agent can immediately use their key to ping."""
    data = await _register_agent(client, "PingAgent")
    resp = await client.get("/api/v1/ping", headers=_auth(data["api_key"]))
    assert resp.status_code == 200
    assert resp.json()["agent_name"] == "PingAgent"
    assert resp.json()["status"] == "ok"


# ---------------------------------------------------------------------------
# B. Agent Creates Meeting Room
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_agent_creates_meeting_with_internal_agents(client, db):
    """Agent creates a meeting via /api/v1/meetings with internal agents."""
    key = await _create_api_key(client, "meeting-creator")
    data = await _agent_create_meeting(client, key, db, auto_start=False)

    assert data["room_id"]
    assert data["code"]
    assert data["session_id"]
    assert data["status"] == "waiting"
    assert len(data["agents"]) == 2
    assert data["agents"][0]["name"] == "Analyst"
    assert data["agents"][1]["name"] == "Critic"


@pytest.mark.asyncio
async def test_agent_creates_meeting_auto_wall_post(client, db):
    """Meeting creation auto-posts to the wall with join code and URL."""
    key = await _create_api_key(client, "wall-poster")
    data = await _agent_create_meeting(
        client, key, db, auto_start=False, topic="Wall Test Meeting"
    )

    wall_resp = await client.get("/api/wall")
    assert wall_resp.status_code == 200
    posts = wall_resp.json()["posts"]
    meeting_posts = [
        p for p in posts
        if data["code"] in p["content"] and "Wall Test Meeting" in p["content"]
    ]
    assert len(meeting_posts) >= 1, f"No wall post found with code {data['code']}"


@pytest.mark.asyncio
async def test_agent_creates_meeting_returns_join_url(client, db):
    """Meeting creation response includes a join_url."""
    key = await _create_api_key(client, "url-tester")
    data = await _agent_create_meeting(client, key, db, auto_start=False)

    assert "join_url" in data
    assert data["code"] in data["join_url"]
    assert "/meeting/" in data["join_url"]


@pytest.mark.asyncio
async def test_agent_creates_meeting_with_only_self(client, db):
    """When no agents specified, creating agent is auto-added as external."""
    reg = await _register_agent(client, "SoloAgent")
    key = reg["api_key"]

    resp = await client.post(
        "/api/v1/meetings",
        json={"topic": "Solo Agent Meeting", "auto_start": False},
        headers=_auth(key),
    )
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["agents"]) >= 1
    agent_names = [a["name"] for a in data["agents"]]
    assert "SoloAgent" in agent_names


# ---------------------------------------------------------------------------
# C. Meeting Sharing & Joining
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_second_agent_joins_meeting(client, db):
    """A second agent can join an existing meeting."""
    key1 = await _create_api_key(client, "host-agent")
    meeting = await _agent_create_meeting(client, key1, db, auto_start=False)

    key2 = await _create_api_key(client, "joiner-agent")
    resp = await client.post(
        f"/api/v1/meetings/{meeting['code']}/join",
        headers=_auth(key2),
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "joined"
    assert data["agent_name"] == "joiner-agent"
    assert data["code"] == meeting["code"]


@pytest.mark.asyncio
async def test_join_meeting_updates_participants(client, db):
    """Joining a meeting increases the participant count."""
    key1 = await _create_api_key(client, "host-p")
    meeting = await _agent_create_meeting(client, key1, db, auto_start=False)

    resp = await client.get(
        f"/api/v1/meetings/{meeting['code']}",
        headers=_auth(key1),
    )
    initial_count = len(resp.json()["participants"])

    key2 = await _create_api_key(client, "joiner-p")
    await client.post(
        f"/api/v1/meetings/{meeting['code']}/join",
        headers=_auth(key2),
    )

    resp = await client.get(
        f"/api/v1/meetings/{meeting['code']}",
        headers=_auth(key1),
    )
    assert len(resp.json()["participants"]) == initial_count + 1


@pytest.mark.asyncio
async def test_join_meeting_already_joined_rejects(client, db):
    """Duplicate join returns 400."""
    key1 = await _create_api_key(client, "host-dup")
    meeting = await _agent_create_meeting(client, key1, db, auto_start=False)

    key2 = await _create_api_key(client, "dup-joiner")
    resp1 = await client.post(
        f"/api/v1/meetings/{meeting['code']}/join",
        headers=_auth(key2),
    )
    assert resp1.status_code == 200

    resp2 = await client.post(
        f"/api/v1/meetings/{meeting['code']}/join",
        headers=_auth(key2),
    )
    assert resp2.status_code == 400


@pytest.mark.asyncio
async def test_join_closed_meeting_rejects(client, db):
    """Joining a closed meeting returns 400."""
    key = await _create_api_key(client, "host-closed")
    meeting = await _agent_create_meeting(client, key, db, auto_start=False)

    await db.execute(
        "UPDATE rooms SET status = 'closed' WHERE code = ?",
        (meeting["code"],),
    )
    await db.commit()

    key2 = await _create_api_key(client, "late-joiner")
    resp = await client.post(
        f"/api/v1/meetings/{meeting['code']}/join",
        headers=_auth(key2),
    )
    assert resp.status_code == 400


# ---------------------------------------------------------------------------
# D. Wall Interactions (Multiple Models/Agents)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_multiple_agents_post_to_wall(client, db):
    """Two different agents can each post to the wall."""
    key1 = await _create_api_key(client, "agent-alpha")
    key2 = await _create_api_key(client, "agent-beta")

    resp1 = await client.post(
        "/api/v1/wall",
        json={"content": "Hello from Alpha!", "post_type": "post"},
        headers=_auth(key1),
    )
    assert resp1.status_code == 201
    assert resp1.json()["agent_name"] == "agent-alpha"

    resp2 = await client.post(
        "/api/v1/wall",
        json={"content": "Hello from Beta!", "post_type": "post"},
        headers=_auth(key2),
    )
    assert resp2.status_code == 201
    assert resp2.json()["agent_name"] == "agent-beta"

    feed = await client.get("/api/wall")
    assert feed.status_code == 200
    contents = [p["content"] for p in feed.json()["posts"]]
    assert "Hello from Alpha!" in contents
    assert "Hello from Beta!" in contents


@pytest.mark.asyncio
async def test_agent_reacts_to_wall_post(client, db):
    """An agent can add an emoji reaction to another agent's post."""
    key1 = await _create_api_key(client, "poster-react")
    key2 = await _create_api_key(client, "reactor")

    post_resp = await client.post(
        "/api/v1/wall",
        json={"content": "React to this!", "post_type": "post"},
        headers=_auth(key1),
    )
    post_id = post_resp.json()["id"]

    react_resp = await client.post(
        f"/api/v1/wall/{post_id}/react",
        json={"emoji": "fire"},
        headers=_auth(key2),
    )
    assert react_resp.status_code == 200
    reactions = react_resp.json()["reactions"]
    assert "fire" in reactions
    assert "reactor" in reactions["fire"]


@pytest.mark.asyncio
async def test_wall_reply_thread(client, db):
    """An agent can reply to another agent's post."""
    key1 = await _create_api_key(client, "thread-starter")
    key2 = await _create_api_key(client, "replier")

    parent_resp = await client.post(
        "/api/v1/wall",
        json={"content": "Discuss this topic.", "post_type": "post"},
        headers=_auth(key1),
    )
    parent_id = parent_resp.json()["id"]

    reply_resp = await client.post(
        "/api/v1/wall",
        json={
            "content": "Great point!",
            "post_type": "reply",
            "parent_id": parent_id,
        },
        headers=_auth(key2),
    )
    assert reply_resp.status_code == 201
    assert reply_resp.json()["parent_id"] == parent_id

    replies_resp = await client.get(f"/api/wall/{parent_id}/replies")
    assert replies_resp.status_code == 200
    replies = replies_resp.json()["replies"]
    assert len(replies) == 1
    assert replies[0]["content"] == "Great point!"
    assert replies[0]["agent_name"] == "replier"


@pytest.mark.asyncio
async def test_wall_feed_shows_meeting_and_manual_posts(client, db):
    """GET /api/wall returns posts from multiple sources."""
    key = await _create_api_key(client, "feed-tester")

    await _agent_create_meeting(
        client, key, db, auto_start=False, topic="Feed Test"
    )

    await client.post(
        "/api/v1/wall",
        json={"content": "Manual post from feed-tester", "post_type": "post"},
        headers=_auth(key),
    )

    feed = await client.get("/api/wall")
    assert feed.status_code == 200
    posts = feed.json()["posts"]
    assert len(posts) >= 2

    contents = " ".join(p["content"] for p in posts)
    assert "Feed Test" in contents
    assert "Manual post from feed-tester" in contents


# ---------------------------------------------------------------------------
# E. Meeting Orchestrator & Conversations (Mocked AI)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_meeting_start_creates_orchestrator(client, db):
    """Starting a meeting creates an active orchestrator that runs to completion."""
    from services.orchestrator_service import get_orchestrator

    key = await _create_api_key(client, "start-tester")
    meeting = await _agent_create_meeting(client, key, db, auto_start=False)
    code = meeting["code"]

    assert get_orchestrator(code) is None

    orch = await _start_meeting_and_wait(client, db, key, code)
    # After completion, orchestrator is cleaned up from the registry
    assert orch.status == "closed"


@pytest.mark.asyncio
async def test_meeting_context_available(client, db):
    """Polling /meetings/{code}/context returns topic and conversation while running."""
    key = await _create_api_key(client, "context-tester")
    meeting = await _agent_create_meeting(client, key, db, auto_start=False)
    code = meeting["code"]

    call_count = {"n": 0}

    async def slow_ai(model, system_prompt, user_content, **kwargs):
        call_count["n"] += 1
        if call_count["n"] <= 2:
            await asyncio.sleep(0.3)
            return "This is my response."
        return "[PASS]"

    with patch("services.orchestrator_service.call_ai", side_effect=slow_ai), \
         patch("database.get_db_connection", new=_mock_get_db_connection(db)), \
         patch("services.interpret_service.auto_interpret", new_callable=AsyncMock):

        await client.post(
            f"/api/v1/meetings/{code}/start",
            headers=_auth(key),
        )

        # Poll until orchestrator is active instead of brittle sleep
        orch = await _wait_for_status(code, "active", timeout=5.0)

        resp = await client.get(
            f"/api/v1/meetings/{code}/context",
            headers=_auth(key),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["topic"] == "Test Discussion"
        assert "state" in data

        if orch._task and not orch._task.done():
            await asyncio.wait_for(orch._task, timeout=15.0)


@pytest.mark.asyncio
async def test_meeting_with_mocked_ai_completes(client, db):
    """Full meeting lifecycle: create → start → AI converses → finalize."""
    key = await _create_api_key(client, "full-lifecycle")
    meeting = await _agent_create_meeting(client, key, db, auto_start=False)
    code = meeting["code"]

    call_count = {"n": 0}

    async def fake_ai(model, system_prompt, user_content, **kwargs):
        call_count["n"] += 1
        if "Analyst" in system_prompt and call_count["n"] <= 3:
            return "We should analyze the data thoroughly."
        if "Critic" in system_prompt and call_count["n"] <= 4:
            return "I disagree — we need more evidence."
        return "[PASS]"

    await _start_meeting_and_wait(client, db, key, code, fake_ai=fake_ai)

    # Session should have transcript
    cursor = await db.execute(
        "SELECT transcript, status FROM sessions WHERE id = ?",
        (meeting["session_id"],),
    )
    session = dict(await cursor.fetchone())
    assert session["status"] == "complete"
    assert session["transcript"]
    assert "[Analyst]" in session["transcript"]
    assert "[Critic]" in session["transcript"]

    # Meeting messages should be in DB
    cursor = await db.execute(
        "SELECT COUNT(*) as cnt FROM meeting_messages WHERE room_id = ?",
        (meeting["room_id"],),
    )
    assert (await cursor.fetchone())["cnt"] > 0


@pytest.mark.asyncio
async def test_external_agent_responds_to_turn(client, db):
    """External agent responds to its turn via the respond endpoint."""
    from services.orchestrator_service import get_orchestrator

    key = await _create_api_key(client, "ext-host")
    meeting = await _agent_create_meeting(
        client, key, db, auto_start=False,
        agents=[
            {"name": "Analyst", "type": "internal"},
            {"name": "ext-host", "type": "external"},
        ],
        max_rounds=2,
    )
    code = meeting["code"]

    async def fake_ai(model, system_prompt, user_content, **kwargs):
        return "[PASS]"

    respond_count = {"n": 0}

    async def _respond_when_turn():
        """Background task that submits external responses whenever turn arrives."""
        orch = get_orchestrator(code)
        if not orch:
            return
        while not orch._task.done():
            if "ext-host" in orch._external_responses:
                respond_count["n"] += 1
                await client.post(
                    f"/api/v1/meetings/{code}/respond",
                    headers=_auth(key),
                    json={
                        "agent_name": "ext-host",
                        "response": "External agent input on the topic.",
                    },
                )
            await asyncio.sleep(0.05)

    with patch("services.orchestrator_service.call_ai", side_effect=fake_ai), \
         patch("database.get_db_connection", new=_mock_get_db_connection(db)), \
         patch("services.interpret_service.auto_interpret", new_callable=AsyncMock):

        await client.post(
            f"/api/v1/meetings/{code}/start",
            headers=_auth(key),
        )

        orch = get_orchestrator(code)
        assert orch is not None

        # Run the responder concurrently so it catches the turn request
        responder = asyncio.create_task(_respond_when_turn())

        try:
            await asyncio.wait_for(orch._task, timeout=30.0)
        except (asyncio.TimeoutError, asyncio.CancelledError):
            pass
        finally:
            responder.cancel()
            try:
                await responder
            except asyncio.CancelledError:
                pass

    assert respond_count["n"] >= 1, "External agent never got a turn request"

    cursor = await db.execute(
        "SELECT transcript FROM sessions WHERE id = ?",
        (meeting["session_id"],),
    )
    transcript = (await cursor.fetchone())["transcript"]
    assert "[ext-host]" in transcript


@pytest.mark.asyncio
async def test_self_registered_agent_creates_and_runs_meeting(client, db):
    """Self-registered agent (via /api/agents/register) can create and complete a meeting.

    This covers the 'seamless onboarding' E2E path: register -> create meeting
    -> start -> finish.  Previous tests use _create_api_key (settings-level keys)
    which bypass self-registration.
    """
    # Self-register (the onboarding path)
    reg = await _register_agent(client, "OnboardAgent")
    key = reg["api_key"]

    # Create meeting using the self-registration key (internal agents only —
    # external agent flow is covered by test_external_agent_responds_to_turn)
    meeting = await _agent_create_meeting(
        client, key, db, auto_start=False,
        topic="Onboarding Test",
        agents=[
            {"name": "Reviewer", "type": "internal"},
            {"name": "Summarizer", "type": "internal"},
        ],
        max_rounds=2,
    )
    code = meeting["code"]

    async def fake_ai(model, system_prompt, user_content, **kwargs):
        if "Reviewer" in system_prompt:
            return "Reviewed and approved."
        if "Summarizer" in system_prompt:
            return "Summary complete."
        return "[PASS]"

    await _start_meeting_and_wait(client, db, key, code, fake_ai=fake_ai)

    # Verify meeting completed with self-registration key
    cursor = await db.execute(
        "SELECT transcript, status FROM sessions WHERE id = ?",
        (meeting["session_id"],),
    )
    session = dict(await cursor.fetchone())
    assert session["status"] == "complete"
    assert session["transcript"]
    assert "[Reviewer]" in session["transcript"]


# ---------------------------------------------------------------------------
# F. Transcript & Finalization
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_meeting_transcript_has_speaker_attribution(client, db):
    """Transcript uses [SpeakerName]: format."""
    key = await _create_api_key(client, "speaker-attr")
    meeting = await _agent_create_meeting(client, key, db, auto_start=False)

    async def fake_ai(model, system_prompt, user_content, **kwargs):
        if "Analyst" in system_prompt:
            return "Analysis point here."
        return "[PASS]"

    await _start_meeting_and_wait(
        client, db, key, meeting["code"], fake_ai=fake_ai
    )

    cursor = await db.execute(
        "SELECT transcript FROM sessions WHERE id = ?",
        (meeting["session_id"],),
    )
    transcript = (await cursor.fetchone())["transcript"]
    assert "[Analyst]: Analysis point here." in transcript
    assert "[System]:" in transcript  # System messages like "Meeting started"


@pytest.mark.asyncio
async def test_meeting_creates_session_complete_event(client, db):
    """Meeting finalization inserts a session.complete event."""
    key = await _create_api_key(client, "event-checker")
    meeting = await _agent_create_meeting(client, key, db, auto_start=False)

    await _start_meeting_and_wait(client, db, key, meeting["code"])

    cursor = await db.execute(
        "SELECT * FROM session_events WHERE session_id = ? AND event_type = 'session.complete'",
        (meeting["session_id"],),
    )
    event = await cursor.fetchone()
    assert event is not None


@pytest.mark.asyncio
async def test_meeting_room_status_closed_after_finish(client, db):
    """After meeting finishes, room status is 'closed'."""
    key = await _create_api_key(client, "status-checker")
    meeting = await _agent_create_meeting(client, key, db, auto_start=False)

    await _start_meeting_and_wait(client, db, key, meeting["code"])

    cursor = await db.execute(
        "SELECT status FROM rooms WHERE code = ?",
        (meeting["code"],),
    )
    row = await cursor.fetchone()
    assert row["status"] == "closed"


# ---------------------------------------------------------------------------
# G. Standard Room Features Still Work
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_standard_room_create_still_works(client, db):
    """POST /api/rooms creates a standard room."""
    resp = await client.post("/api/rooms", json={
        "context": "startup_meeting",
        "title": "Regression Test Room",
        "host_name": "TestHost",
        "context_metadata": {"project": "TestProject"},
    })
    assert resp.status_code == 200
    data = resp.json()
    assert data["code"].startswith("REGR")
    assert data["status"] == "waiting"
    assert data["session_id"]


@pytest.mark.asyncio
async def test_standard_room_join_still_works(client, db):
    """POST /api/rooms/join adds a participant to a standard room."""
    create_resp = await client.post("/api/rooms", json={
        "context": "startup_meeting",
        "title": "Join Regression",
        "host_name": "Host",
    })
    code = create_resp.json()["code"]

    join_resp = await client.post("/api/rooms/join", json={
        "code": code,
        "name": "Joiner",
        "type": "human",
    })
    assert join_resp.status_code == 200
    assert join_resp.json()["code"] == code


@pytest.mark.asyncio
async def test_standard_room_lifecycle_still_works(client, db):
    """Start and stop recording on a standard room."""
    create_resp = await client.post("/api/rooms", json={
        "context": "startup_meeting",
        "title": "Lifecycle Regression",
        "host_name": "Host",
    })
    code = create_resp.json()["code"]

    start_resp = await client.post(f"/api/rooms/{code}/start")
    assert start_resp.status_code == 200
    assert start_resp.json()["status"] == "recording"

    stop_resp = await client.post(f"/api/rooms/{code}/stop")
    assert stop_resp.status_code == 200
    assert stop_resp.json()["status"] == "processing"


# ---------------------------------------------------------------------------
# H. Onboarding & Invite Flow Not Broken
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_invite_create_claim_still_works(client, db):
    """Full invite flow: create → claim → use key to ping."""
    create_resp = await client.post("/api/invites", json={"label": "e2e-test"})
    assert create_resp.status_code == 201
    token = create_resp.json()["token"]

    claim_resp = await client.post(
        f"/api/invites/{token}/claim",
        json={"agent_name": "InvitedAgent"},
    )
    assert claim_resp.status_code == 200
    claim_data = claim_resp.json()
    assert claim_data["api_key"].startswith("scribe_sk_")

    ping_resp = await client.get(
        "/api/v1/ping",
        headers=_auth(claim_data["api_key"]),
    )
    assert ping_resp.status_code == 200
    assert ping_resp.json()["agent_name"] == "InvitedAgent"


@pytest.mark.asyncio
async def test_settings_api_key_creation_still_works(client, db):
    """POST /api/settings/api-keys creates a usable key."""
    resp = await client.post("/api/settings/api-keys", json={"name": "settings-agent"})
    assert resp.status_code == 200
    key = resp.json()["key"]
    assert key.startswith("scribe_sk_")

    ping = await client.get("/api/v1/ping", headers=_auth(key))
    assert ping.status_code == 200
    assert ping.json()["agent_name"] == "settings-agent"


# ---------------------------------------------------------------------------
# I. Error Cases & Auth
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_meeting_not_found_errors(client, db):
    """API returns 404 for nonexistent meeting operations."""
    key = await _create_api_key(client, "error-tester")

    resp = await client.post(
        "/api/v1/meetings/FAKE-0000/join", headers=_auth(key)
    )
    assert resp.status_code == 404

    resp = await client.get(
        "/api/v1/meetings/FAKE-0000/context", headers=_auth(key)
    )
    assert resp.status_code == 404

    resp = await client.post(
        "/api/v1/meetings/FAKE-0000/respond",
        headers=_auth(key),
        json={"response": "hello"},
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_unauthenticated_meeting_api_rejected(client, db):
    """Meeting endpoints require authentication."""
    resp = await client.get("/api/v1/meetings")
    assert resp.status_code == 401

    resp = await client.post("/api/v1/meetings", json={"topic": "test"})
    assert resp.status_code == 401

    resp = await client.post("/api/v1/wall", json={"content": "hello"})
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_meeting_topic_required(client, db):
    """Meeting creation requires a topic."""
    key = await _create_api_key(client, "no-topic")
    resp = await client.post(
        "/api/v1/meetings",
        json={"agents": [{"name": "A1", "type": "internal"}]},
        headers=_auth(key),
    )
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_list_meetings(client, db):
    """Agent can list open meetings."""
    key = await _create_api_key(client, "lister")
    await _agent_create_meeting(client, key, db, auto_start=False)

    resp = await client.get("/api/v1/meetings", headers=_auth(key))
    assert resp.status_code == 200
    assert resp.json()["count"] >= 1

    resp = await client.get(
        "/api/v1/meetings?status=waiting", headers=_auth(key)
    )
    assert resp.status_code == 200
    for m in resp.json()["meetings"]:
        assert m["status"] == "waiting"
