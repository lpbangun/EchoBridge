"""Tests for series and meeting memory endpoints."""

import pytest
from unittest.mock import AsyncMock, patch


# --- Series CRUD ---

@pytest.mark.asyncio
async def test_create_series(client):
    resp = await client.post("/api/series", json={
        "name": "Project X Standups",
        "description": "Weekly standup meetings for Project X",
    })
    assert resp.status_code == 201
    data = resp.json()
    assert data["name"] == "Project X Standups"
    assert data["description"] == "Weekly standup meetings for Project X"
    assert data["memory_document"] == ""
    assert data["session_count"] == 0
    assert data["id"]


@pytest.mark.asyncio
async def test_create_series_name_only(client):
    resp = await client.post("/api/series", json={"name": "Minimal"})
    assert resp.status_code == 201
    assert resp.json()["description"] == ""


@pytest.mark.asyncio
async def test_create_series_missing_name(client):
    resp = await client.post("/api/series", json={"description": "No name"})
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_list_series(client):
    await client.post("/api/series", json={"name": "Series A"})
    await client.post("/api/series", json={"name": "Series B"})

    resp = await client.get("/api/series")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) >= 2
    names = [s["name"] for s in data]
    assert "Series A" in names
    assert "Series B" in names


@pytest.mark.asyncio
async def test_get_series(client):
    create_resp = await client.post("/api/series", json={
        "name": "Test Series",
        "description": "For testing",
    })
    series_id = create_resp.json()["id"]

    resp = await client.get(f"/api/series/{series_id}")
    assert resp.status_code == 200
    assert resp.json()["name"] == "Test Series"


@pytest.mark.asyncio
async def test_get_series_not_found(client):
    resp = await client.get("/api/series/nonexistent-id")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_update_series(client):
    create_resp = await client.post("/api/series", json={"name": "Old Name"})
    series_id = create_resp.json()["id"]

    resp = await client.patch(f"/api/series/{series_id}", json={
        "name": "New Name",
        "description": "Updated description",
    })
    assert resp.status_code == 200
    assert resp.json()["name"] == "New Name"
    assert resp.json()["description"] == "Updated description"


@pytest.mark.asyncio
async def test_update_series_not_found(client):
    resp = await client.patch("/api/series/nonexistent", json={"name": "X"})
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_delete_series(client):
    create_resp = await client.post("/api/series", json={"name": "To Delete"})
    series_id = create_resp.json()["id"]

    resp = await client.delete(f"/api/series/{series_id}")
    assert resp.status_code == 200
    assert resp.json()["ok"] is True

    # Verify gone
    resp = await client.get(f"/api/series/{series_id}")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_delete_series_nulls_session_fk(client):
    # Create series and session
    series_resp = await client.post("/api/series", json={"name": "Will Delete"})
    series_id = series_resp.json()["id"]

    session_resp = await client.post("/api/sessions", json={
        "context": "startup_meeting",
        "title": "Linked Session",
        "series_id": series_id,
    })
    session_id = session_resp.json()["id"]

    # Delete series
    await client.delete(f"/api/series/{series_id}")

    # Session still exists but series_id is null
    resp = await client.get(f"/api/sessions/{session_id}")
    assert resp.status_code == 200
    assert resp.json()["series_id"] is None


@pytest.mark.asyncio
async def test_delete_series_not_found(client):
    resp = await client.delete("/api/series/nonexistent")
    assert resp.status_code == 404


# --- Memory ---

@pytest.mark.asyncio
async def test_get_memory_empty(client):
    create_resp = await client.post("/api/series", json={"name": "Empty Memory"})
    series_id = create_resp.json()["id"]

    resp = await client.get(f"/api/series/{series_id}/memory")
    assert resp.status_code == 200
    data = resp.json()
    assert data["series_id"] == series_id
    assert data["series_name"] == "Empty Memory"
    assert data["memory_document"] == ""
    assert data["session_count"] == 0


@pytest.mark.asyncio
async def test_get_memory_not_found(client):
    resp = await client.get("/api/series/nonexistent/memory")
    assert resp.status_code == 404


@pytest.mark.asyncio
@patch("routers.series.refresh_memory_from_scratch")
async def test_refresh_memory(mock_refresh, client):
    create_resp = await client.post("/api/series", json={"name": "Refresh Test"})
    series_id = create_resp.json()["id"]

    mock_refresh.return_value = "# Refreshed memory"

    resp = await client.post(f"/api/series/{series_id}/memory/refresh")
    assert resp.status_code == 200
    mock_refresh.assert_called_once()


@pytest.mark.asyncio
async def test_refresh_memory_not_found(client):
    resp = await client.post("/api/series/nonexistent/memory/refresh")
    assert resp.status_code == 404


# --- Session grouping ---

@pytest.mark.asyncio
async def test_create_session_with_series_id(client):
    series_resp = await client.post("/api/series", json={"name": "My Series"})
    series_id = series_resp.json()["id"]

    session_resp = await client.post("/api/sessions", json={
        "context": "startup_meeting",
        "title": "Series Session",
        "series_id": series_id,
    })
    assert session_resp.status_code == 200
    data = session_resp.json()
    assert data["series_id"] == series_id
    assert data["series_name"] == "My Series"

    # Verify session count incremented
    series_resp = await client.get(f"/api/series/{series_id}")
    assert series_resp.json()["session_count"] == 1


@pytest.mark.asyncio
async def test_create_session_with_invalid_series(client):
    resp = await client.post("/api/sessions", json={
        "context": "startup_meeting",
        "title": "Bad Series",
        "series_id": "nonexistent",
    })
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_list_sessions_filter_by_series(client):
    series_resp = await client.post("/api/series", json={"name": "Filter Test"})
    series_id = series_resp.json()["id"]

    await client.post("/api/sessions", json={
        "context": "startup_meeting",
        "title": "In Series",
        "series_id": series_id,
    })
    await client.post("/api/sessions", json={
        "context": "startup_meeting",
        "title": "Not In Series",
    })

    resp = await client.get(f"/api/sessions?series_id={series_id}")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1
    assert data[0]["title"] == "In Series"


@pytest.mark.asyncio
async def test_add_session_to_series(client):
    series_resp = await client.post("/api/series", json={"name": "Add To"})
    series_id = series_resp.json()["id"]

    session_resp = await client.post("/api/sessions", json={
        "context": "startup_meeting",
        "title": "Orphan Session",
    })
    session_id = session_resp.json()["id"]

    resp = await client.post(f"/api/series/{series_id}/sessions/{session_id}")
    assert resp.status_code == 200
    assert resp.json()["ok"] is True

    # Verify session has series_id
    session_resp = await client.get(f"/api/sessions/{session_id}")
    assert session_resp.json()["series_id"] == series_id

    # Verify count
    series_resp = await client.get(f"/api/series/{series_id}")
    assert series_resp.json()["session_count"] == 1


@pytest.mark.asyncio
async def test_add_session_to_series_not_found(client):
    series_resp = await client.post("/api/series", json={"name": "Exists"})
    series_id = series_resp.json()["id"]

    resp = await client.post(f"/api/series/{series_id}/sessions/nonexistent")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_remove_session_from_series(client):
    series_resp = await client.post("/api/series", json={"name": "Remove From"})
    series_id = series_resp.json()["id"]

    session_resp = await client.post("/api/sessions", json={
        "context": "startup_meeting",
        "title": "To Remove",
        "series_id": series_id,
    })
    session_id = session_resp.json()["id"]

    resp = await client.delete(f"/api/series/{series_id}/sessions/{session_id}")
    assert resp.status_code == 200

    session_resp = await client.get(f"/api/sessions/{session_id}")
    assert session_resp.json()["series_id"] is None

    series_resp = await client.get(f"/api/series/{series_id}")
    assert series_resp.json()["session_count"] == 0


@pytest.mark.asyncio
async def test_remove_session_not_in_series(client):
    series_resp = await client.post("/api/series", json={"name": "Wrong"})
    series_id = series_resp.json()["id"]

    session_resp = await client.post("/api/sessions", json={
        "context": "startup_meeting",
        "title": "Not In Series",
    })
    session_id = session_resp.json()["id"]

    resp = await client.delete(f"/api/series/{series_id}/sessions/{session_id}")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_list_series_sessions(client):
    series_resp = await client.post("/api/series", json={"name": "List Sessions"})
    series_id = series_resp.json()["id"]

    await client.post("/api/sessions", json={
        "context": "startup_meeting",
        "title": "Session 1",
        "series_id": series_id,
    })
    await client.post("/api/sessions", json={
        "context": "startup_meeting",
        "title": "Session 2",
        "series_id": series_id,
    })

    resp = await client.get(f"/api/series/{series_id}/sessions")
    assert resp.status_code == 200
    assert len(resp.json()) == 2


@pytest.mark.asyncio
async def test_list_series_sessions_not_found(client):
    resp = await client.get("/api/series/nonexistent/sessions")
    assert resp.status_code == 404


# --- Interpretation with memory context (mocked AI) ---

@pytest.mark.asyncio
@patch("services.interpret_service.call_openrouter")
async def test_interpret_with_memory_context(mock_ai, client, db):
    mock_ai.return_value = "# Meeting Notes\n\nSummary of the meeting."

    # Create series
    series_resp = await client.post("/api/series", json={"name": "Memory Series"})
    series_id = series_resp.json()["id"]

    # Set a memory document on the series
    await db.execute(
        "UPDATE series SET memory_document = ? WHERE id = ?",
        ("# Meeting Memory\n\n## Decisions Log\n- Decided to use React", series_id),
    )
    await db.commit()

    # Create session in series with transcript
    session_resp = await client.post("/api/sessions", json={
        "context": "startup_meeting",
        "title": "Memory Test Session",
        "series_id": series_id,
    })
    session_id = session_resp.json()["id"]
    await db.execute(
        "UPDATE sessions SET transcript = ?, status = 'complete' WHERE id = ?",
        ("Test transcript about React components", session_id),
    )
    await db.commit()

    # Interpret — should include memory context in the AI call
    resp = await client.post(f"/api/sessions/{session_id}/interpret", json={
        "lens_type": "preset",
        "lens_id": "startup_meeting",
    })
    assert resp.status_code == 200

    # Verify AI was called with memory context
    call_args = mock_ai.call_args
    user_content = call_args.kwargs.get("user_content", "") or call_args[1].get("user_content", "")
    assert "MEETING MEMORY" in user_content
    assert "Decided to use React" in user_content


# --- Agent API series endpoints ---

async def _create_api_key(client):
    """Helper to create an API key and return the bearer token."""
    resp = await client.post("/api/settings/api-keys", json={"name": "test-agent"})
    return resp.json()["key"]


@pytest.mark.asyncio
async def test_agent_list_series(client, db):
    key = await _create_api_key(client)
    await client.post("/api/series", json={"name": "Agent Series"})

    resp = await client.get("/api/v1/series", headers={
        "Authorization": f"Bearer {key}",
    })
    assert resp.status_code == 200
    assert len(resp.json()) >= 1


@pytest.mark.asyncio
async def test_agent_get_series(client, db):
    key = await _create_api_key(client)

    series_resp = await client.post("/api/series", json={"name": "Agent Get"})
    series_id = series_resp.json()["id"]

    resp = await client.get(f"/api/v1/series/{series_id}", headers={
        "Authorization": f"Bearer {key}",
    })
    assert resp.status_code == 200
    assert resp.json()["name"] == "Agent Get"


@pytest.mark.asyncio
async def test_agent_get_series_memory(client, db):
    key = await _create_api_key(client)

    series_resp = await client.post("/api/series", json={"name": "Agent Memory"})
    series_id = series_resp.json()["id"]

    resp = await client.get(f"/api/v1/series/{series_id}/memory", headers={
        "Authorization": f"Bearer {key}",
    })
    assert resp.status_code == 200
    assert resp.json()["series_name"] == "Agent Memory"


@pytest.mark.asyncio
async def test_agent_series_unauthorized(client):
    resp = await client.get("/api/v1/series")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_agent_list_sessions_by_series(client, db):
    key = await _create_api_key(client)

    series_resp = await client.post("/api/series", json={"name": "Filter Series"})
    series_id = series_resp.json()["id"]

    await client.post("/api/sessions", json={
        "context": "startup_meeting",
        "title": "In Filter Series",
        "series_id": series_id,
    })

    resp = await client.get(f"/api/v1/sessions?series_id={series_id}", headers={
        "Authorization": f"Bearer {key}",
    })
    assert resp.status_code == 200
    assert len(resp.json()) == 1
    assert resp.json()[0]["title"] == "In Filter Series"
