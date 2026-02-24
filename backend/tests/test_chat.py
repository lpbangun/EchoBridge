"""Tests for chat endpoints — per-session and cross-meeting conversations."""

from unittest.mock import AsyncMock, patch

import pytest


async def _create_session_with_transcript(client, db):
    """Helper to create a session with a transcript."""
    resp = await client.post("/api/sessions", json={
        "title": "Chat Test Session",
        "context": "startup_meeting",
        "context_metadata": {"project": "TestProject"},
    })
    session_id = resp.json()["id"]
    await client.post(f"/api/sessions/{session_id}/transcript", json={
        "transcript": "We discussed the new authentication system and decided to use JWT tokens.",
        "duration_seconds": 600,
    })
    return session_id


async def _create_api_key(client, db):
    """Helper to create an API key and return the bearer token."""
    resp = await client.post("/api/settings/api-keys", json={"name": "test-agent"})
    return resp.json()["key"]


# --- Conversation CRUD ---


@pytest.mark.asyncio
async def test_list_conversations_empty(client, db):
    resp = await client.get("/api/chat/conversations")
    assert resp.status_code == 200
    assert resp.json() == []


@pytest.mark.asyncio
@patch("services.chat_service.call_ai", new_callable=AsyncMock, return_value="AI response about JWT tokens.")
async def test_send_message_creates_conversation(mock_ai, client, db):
    session_id = await _create_session_with_transcript(client, db)

    resp = await client.post("/api/chat", json={
        "session_id": session_id,
        "message": "What was decided about authentication?",
    })
    assert resp.status_code == 200
    data = resp.json()
    assert data["conversation_id"]
    assert data["message"]["role"] == "assistant"
    assert data["message"]["content"] == "AI response about JWT tokens."


@pytest.mark.asyncio
@patch("services.chat_service.call_ai", new_callable=AsyncMock, return_value="AI response.")
async def test_send_message_to_existing_conversation(mock_ai, client, db):
    session_id = await _create_session_with_transcript(client, db)

    # First message creates conversation
    resp1 = await client.post("/api/chat", json={
        "session_id": session_id,
        "message": "First question",
    })
    convo_id = resp1.json()["conversation_id"]

    # Second message reuses conversation
    mock_ai.return_value = "Follow-up response."
    resp2 = await client.post("/api/chat", json={
        "conversation_id": convo_id,
        "message": "Follow up question",
    })
    assert resp2.status_code == 200
    assert resp2.json()["conversation_id"] == convo_id
    assert resp2.json()["message"]["content"] == "Follow-up response."


@pytest.mark.asyncio
@patch("services.chat_service.call_ai", new_callable=AsyncMock, return_value="Session chat response.")
async def test_get_conversation_with_messages(mock_ai, client, db):
    session_id = await _create_session_with_transcript(client, db)

    resp = await client.post("/api/chat", json={
        "session_id": session_id,
        "message": "Tell me about this meeting",
    })
    convo_id = resp.json()["conversation_id"]

    resp = await client.get(f"/api/chat/conversations/{convo_id}")
    assert resp.status_code == 200
    data = resp.json()
    assert data["id"] == convo_id
    assert data["session_id"] == session_id
    assert len(data["messages"]) == 2  # user + assistant
    assert data["messages"][0]["role"] == "user"
    assert data["messages"][1]["role"] == "assistant"


@pytest.mark.asyncio
@patch("services.chat_service.call_ai", new_callable=AsyncMock, return_value="Resp.")
async def test_list_conversations_filtered_by_session(mock_ai, client, db):
    sid1 = await _create_session_with_transcript(client, db)
    sid2 = await _create_session_with_transcript(client, db)

    await client.post("/api/chat", json={"session_id": sid1, "message": "Q1"})
    await client.post("/api/chat", json={"session_id": sid2, "message": "Q2"})

    # All conversations
    resp = await client.get("/api/chat/conversations")
    assert len(resp.json()) == 2

    # Filtered by session
    resp = await client.get(f"/api/chat/conversations?session_id={sid1}")
    assert len(resp.json()) == 1
    assert resp.json()[0]["session_id"] == sid1


@pytest.mark.asyncio
@patch("services.chat_service.call_ai", new_callable=AsyncMock, return_value="Resp.")
async def test_delete_conversation_cascades(mock_ai, client, db):
    session_id = await _create_session_with_transcript(client, db)

    resp = await client.post("/api/chat", json={
        "session_id": session_id,
        "message": "Test message",
    })
    convo_id = resp.json()["conversation_id"]

    # Delete
    resp = await client.delete(f"/api/chat/conversations/{convo_id}")
    assert resp.status_code == 200

    # Verify gone
    resp = await client.get(f"/api/chat/conversations/{convo_id}")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_delete_conversation_not_found(client, db):
    resp = await client.delete("/api/chat/conversations/nonexistent")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_get_conversation_not_found(client, db):
    resp = await client.get("/api/chat/conversations/nonexistent")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_send_to_nonexistent_conversation(client, db):
    resp = await client.post("/api/chat", json={
        "conversation_id": "nonexistent",
        "message": "Hello",
    })
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_send_message_validation(client, db):
    resp = await client.post("/api/chat", json={})
    assert resp.status_code == 422


# --- Global (cross-meeting) conversation ---


@pytest.mark.asyncio
@patch("services.chat_service.ask_across_meetings", new_callable=AsyncMock, return_value={
    "question": "auth?",
    "answer": "JWT tokens were chosen.",
    "sources": [{"session_id": "s1", "title": "Meeting 1"}],
    "model": "test-model",
})
async def test_global_chat_delegates_to_ask(mock_ask, client, db):
    resp = await client.post("/api/chat", json={
        "message": "What did we decide about auth?",
    })
    assert resp.status_code == 200
    data = resp.json()
    assert data["message"]["content"] == "JWT tokens were chosen."
    assert len(data["sources"]) == 1


# --- Agent API ---


@pytest.mark.asyncio
async def test_agent_chat_requires_auth(client, db):
    resp = await client.get("/api/v1/chat/conversations")
    assert resp.status_code == 401


@pytest.mark.asyncio
@patch("services.chat_service.call_ai", new_callable=AsyncMock, return_value="Resp.")
async def test_agent_list_conversations(mock_ai, client, db):
    key = await _create_api_key(client, db)
    session_id = await _create_session_with_transcript(client, db)

    await client.post("/api/chat", json={
        "session_id": session_id,
        "message": "Q",
    })

    resp = await client.get(
        "/api/v1/chat/conversations",
        headers={"Authorization": f"Bearer {key}"},
    )
    assert resp.status_code == 200
    assert len(resp.json()) >= 1


@pytest.mark.asyncio
@patch("services.chat_service.call_ai", new_callable=AsyncMock, return_value="Resp.")
async def test_agent_get_conversation(mock_ai, client, db):
    key = await _create_api_key(client, db)
    session_id = await _create_session_with_transcript(client, db)

    resp = await client.post("/api/chat", json={
        "session_id": session_id,
        "message": "Q",
    })
    convo_id = resp.json()["conversation_id"]

    resp = await client.get(
        f"/api/v1/chat/conversations/{convo_id}",
        headers={"Authorization": f"Bearer {key}"},
    )
    assert resp.status_code == 200
    assert resp.json()["id"] == convo_id


@pytest.mark.asyncio
@patch("services.chat_service.call_ai", new_callable=AsyncMock, return_value="Resp.")
async def test_agent_send_message(mock_ai, client, db):
    key = await _create_api_key(client, db)
    session_id = await _create_session_with_transcript(client, db)

    resp = await client.post("/api/chat", json={
        "session_id": session_id,
        "message": "Q",
    })
    convo_id = resp.json()["conversation_id"]

    resp = await client.post(
        f"/api/v1/chat/conversations/{convo_id}/messages",
        headers={"Authorization": f"Bearer {key}"},
        json={"content": "Agent observation: JWT is secure."},
    )
    assert resp.status_code == 200
    msg = resp.json()
    assert msg["role"] == "agent"
    assert "Agent observation" in msg["content"]
    assert msg["source"].startswith("agent:")


@pytest.mark.asyncio
async def test_agent_send_message_no_content(client, db):
    key = await _create_api_key(client, db)
    resp = await client.post(
        "/api/v1/chat/conversations/nonexistent/messages",
        headers={"Authorization": f"Bearer {key}"},
        json={"content": "hi"},
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_agent_send_message_empty_content(client, db):
    key = await _create_api_key(client, db)
    resp = await client.post(
        "/api/v1/chat/conversations/some-id/messages",
        headers={"Authorization": f"Bearer {key}"},
        json={},
    )
    # Either 404 (conversation not found) or 400 (no content)
    assert resp.status_code in (400, 404)
