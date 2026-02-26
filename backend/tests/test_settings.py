"""Tests for settings, API keys, lenses, and search endpoints."""

import json

import pytest


# ---------------------------------------------------------------------------
# GET /api/settings — Read current settings
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_get_settings(client):
    """GET /api/settings returns the current configuration."""
    res = await client.get("/api/settings")
    assert res.status_code == 200
    data = res.json()
    assert "openrouter_api_key_set" in data
    assert "user_display_name" in data
    assert "output_dir" in data
    assert "auto_export" in data
    assert "include_transcript_in_md" in data
    assert "whisper_model" in data
    assert "default_model" in data
    assert "models" in data
    assert isinstance(data["models"], dict)
    assert "ai_provider" in data
    assert "provider_models" in data
    assert "onboarding_complete" in data


@pytest.mark.asyncio
async def test_get_settings_api_key_masked(client):
    """The settings response indicates whether the API key is set, not the key itself."""
    res = await client.get("/api/settings")
    data = res.json()
    # We set OPENROUTER_API_KEY="test-key" in conftest, so it should be True
    assert data["openrouter_api_key_set"] is True
    # The raw key should never appear in the response
    assert "test-key" not in str(data)


@pytest.mark.asyncio
async def test_get_settings_default_values(client):
    """Default settings have sensible values."""
    res = await client.get("/api/settings")
    data = res.json()
    assert isinstance(data["auto_export"], bool)
    assert isinstance(data["include_transcript_in_md"], bool)
    assert len(data["models"]) > 0


# ---------------------------------------------------------------------------
# PUT /api/settings — Update settings
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_update_display_name(client):
    """Updating the display name is reflected in the response."""
    res = await client.put(
        "/api/settings",
        json={"user_display_name": "NewTestUser"},
    )
    assert res.status_code == 200
    assert res.json()["user_display_name"] == "NewTestUser"

    # Verify it persists across reads
    res = await client.get("/api/settings")
    assert res.json()["user_display_name"] == "NewTestUser"


@pytest.mark.asyncio
async def test_update_default_model(client):
    """Updating the default model is reflected in settings."""
    res = await client.put(
        "/api/settings",
        json={"default_model": "google/gemini-2.5-flash-preview"},
    )
    assert res.status_code == 200
    assert res.json()["default_model"] == "google/gemini-2.5-flash-preview"


@pytest.mark.asyncio
async def test_update_auto_export(client):
    """Toggling auto_export works."""
    res = await client.put(
        "/api/settings",
        json={"auto_export": False},
    )
    assert res.status_code == 200
    assert res.json()["auto_export"] is False


@pytest.mark.asyncio
async def test_update_partial(client):
    """Partial updates leave other fields unchanged."""
    # Read initial settings
    initial = (await client.get("/api/settings")).json()

    # Only update one field
    res = await client.put(
        "/api/settings",
        json={"whisper_model": "large-v3"},
    )
    assert res.status_code == 200
    data = res.json()
    assert data["whisper_model"] == "large-v3"
    # Other fields unchanged
    assert data["auto_export"] == initial["auto_export"]
    assert data["include_transcript_in_md"] == initial["include_transcript_in_md"]


@pytest.mark.asyncio
async def test_update_settings_empty_body(client):
    """An empty update body changes nothing and succeeds."""
    initial = (await client.get("/api/settings")).json()
    res = await client.put("/api/settings", json={})
    assert res.status_code == 200
    assert res.json()["user_display_name"] == initial["user_display_name"]


# ---------------------------------------------------------------------------
# POST /api/settings/api-keys — Generate agent API key
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_create_api_key(client):
    """Generating an API key returns a key with the correct prefix."""
    res = await client.post(
        "/api/settings/api-keys",
        json={"name": "Test Agent Key"},
    )
    assert res.status_code == 200
    data = res.json()
    assert data["name"] == "Test Agent Key"
    assert data["key"].startswith("scribe_sk_")
    assert "id" in data
    assert "created_at" in data


@pytest.mark.asyncio
async def test_create_api_key_unique(client):
    """Each generated key is unique."""
    res1 = await client.post(
        "/api/settings/api-keys",
        json={"name": "Key 1"},
    )
    res2 = await client.post(
        "/api/settings/api-keys",
        json={"name": "Key 2"},
    )
    assert res1.json()["key"] != res2.json()["key"]
    assert res1.json()["id"] != res2.json()["id"]


@pytest.mark.asyncio
async def test_create_api_key_missing_name(client):
    """Creating an API key without a name returns 422."""
    res = await client.post("/api/settings/api-keys", json={})
    assert res.status_code == 422


# ---------------------------------------------------------------------------
# GET /api/lenses — List preset lenses
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_list_lenses(client):
    """Returns the list of preset lenses."""
    res = await client.get("/api/lenses")
    assert res.status_code == 200
    data = res.json()
    assert isinstance(data, list)
    assert len(data) == 6  # 6 preset lenses (including smart_notes)

    # Each lens has the expected shape
    for lens in data:
        assert "id" in lens
        assert "name" in lens
        assert "description" in lens
        assert "context" in lens


@pytest.mark.asyncio
async def test_list_lenses_contains_expected_ids(client):
    """The preset lenses include the 6 known lens types."""
    res = await client.get("/api/lenses")
    ids = {lens["id"] for lens in res.json()}
    expected = {
        "class_lecture",
        "startup_meeting",
        "research_discussion",
        "working_session",
        "talk_seminar",
        "smart_notes",
    }
    assert ids == expected


# ---------------------------------------------------------------------------
# GET /api/search?q=... — Full-text search
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_search_no_results(client):
    """Searching with no matching content returns empty results."""
    res = await client.get("/api/search?q=xyznonexistent")
    assert res.status_code == 200
    data = res.json()
    assert data["query"] == "xyznonexistent"
    assert data["results"] == []
    assert data["total"] == 0


@pytest.mark.asyncio
async def test_search_missing_query(client):
    """Searching without a query parameter returns 422."""
    res = await client.get("/api/search")
    assert res.status_code == 422


# ---------------------------------------------------------------------------
# Settings persistence (SQLite hybrid)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_settings_persist_after_save(client, db):
    """PUT a preference → verify the row exists in app_settings."""
    await client.put("/api/settings", json={"user_display_name": "Persisted"})

    cursor = await db.execute(
        "SELECT value FROM app_settings WHERE key = ?", ("user_display_name",)
    )
    row = await cursor.fetchone()
    assert row is not None
    assert json.loads(row[0]) == "Persisted"


@pytest.mark.asyncio
async def test_settings_secrets_not_persisted(client, db):
    """API keys must NOT be written to the app_settings table."""
    await client.put(
        "/api/settings",
        json={"openrouter_api_key": "sk-secret-value", "user_display_name": "OK"},
    )

    cursor = await db.execute(
        "SELECT key FROM app_settings WHERE key = ?", ("openrouter_api_key",)
    )
    row = await cursor.fetchone()
    assert row is None  # Secret must not be persisted

    # But the preference should be there
    cursor = await db.execute(
        "SELECT value FROM app_settings WHERE key = ?", ("user_display_name",)
    )
    row = await cursor.fetchone()
    assert row is not None


@pytest.mark.asyncio
async def test_settings_load_on_startup(db):
    """Insert a row into app_settings directly, call load_preferences, verify singleton."""
    from config import settings
    from services.settings_service import load_preferences

    original = settings.user_display_name

    # Directly insert a preference into the DB
    await db.execute(
        "INSERT INTO app_settings (key, value) VALUES (?, ?)",
        ("user_display_name", json.dumps("LoadedFromDB")),
    )
    await db.commit()

    await load_preferences(db)
    assert settings.user_display_name == "LoadedFromDB"

    # Restore original to avoid polluting other tests
    settings.user_display_name = original


@pytest.mark.asyncio
async def test_onboarding_complete_persists(client, db):
    """PUT onboarding_complete=true → persisted and returned in settings."""
    res = await client.put("/api/settings", json={"onboarding_complete": True})
    assert res.status_code == 200
    assert res.json()["onboarding_complete"] is True

    # Verify it persisted to the DB
    cursor = await db.execute(
        "SELECT value FROM app_settings WHERE key = ?", ("onboarding_complete",)
    )
    row = await cursor.fetchone()
    assert row is not None
    assert json.loads(row[0]) is True

    # Verify GET also returns it
    res = await client.get("/api/settings")
    assert res.json()["onboarding_complete"] is True


# ---------------------------------------------------------------------------
# GET /api/settings/api-keys — List agent API keys
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_list_api_keys_empty(client):
    """Listing API keys when none exist returns an empty list."""
    res = await client.get("/api/settings/api-keys")
    assert res.status_code == 200
    assert res.json() == []


@pytest.mark.asyncio
async def test_list_api_keys_returns_created_keys(client):
    """Created keys appear in the list with name and dates, but no secret."""
    await client.post("/api/settings/api-keys", json={"name": "Agent Alpha"})
    await client.post("/api/settings/api-keys", json={"name": "Agent Beta"})

    res = await client.get("/api/settings/api-keys")
    assert res.status_code == 200
    data = res.json()
    assert len(data) == 2
    names = {k["name"] for k in data}
    assert names == {"Agent Alpha", "Agent Beta"}

    # Each item has expected fields
    for item in data:
        assert "id" in item
        assert "name" in item
        assert "created_at" in item
        assert "last_used_at" in item
        # Secret key must not be exposed
        assert "key" not in item
        assert "key_hash" not in item


# ---------------------------------------------------------------------------
# DELETE /api/settings/api-keys/{id} — Revoke an agent API key
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_delete_api_key(client):
    """Revoking a key removes it from the list."""
    res = await client.post("/api/settings/api-keys", json={"name": "Temp Agent"})
    key_id = res.json()["id"]

    # Delete it
    res = await client.delete(f"/api/settings/api-keys/{key_id}")
    assert res.status_code == 204

    # Verify it's gone
    res = await client.get("/api/settings/api-keys")
    ids = [k["id"] for k in res.json()]
    assert key_id not in ids


@pytest.mark.asyncio
async def test_delete_api_key_not_found(client):
    """Deleting a non-existent key returns 404."""
    res = await client.delete("/api/settings/api-keys/nonexistent-id")
    assert res.status_code == 404


@pytest.mark.asyncio
async def test_search_matches_session_transcript(client, sample_session):
    """Search finds a session by transcript content."""
    res = await client.post("/api/sessions", json=sample_session)
    sid = res.json()["id"]
    await client.post(
        f"/api/sessions/{sid}/transcript",
        json={
            "transcript": "The quantum entanglement experiment yielded surprising results.",
            "duration_seconds": 90,
        },
    )

    res = await client.get("/api/search?q=quantum+entanglement")
    assert res.status_code == 200
    data = res.json()
    assert data["total"] >= 1
    found_ids = [r["session_id"] for r in data["results"]]
    assert sid in found_ids


@pytest.mark.asyncio
async def test_search_matches_session_title(client, sample_session):
    """Search finds a session by its title."""
    custom_session = {**sample_session, "title": "Bioinformatics Workshop"}
    res = await client.post("/api/sessions", json=custom_session)
    sid = res.json()["id"]

    res = await client.get("/api/search?q=Bioinformatics")
    assert res.status_code == 200
    data = res.json()
    assert data["total"] >= 1
    found_ids = [r["session_id"] for r in data["results"]]
    assert sid in found_ids


@pytest.mark.asyncio
async def test_search_result_shape(client, sample_session):
    """Each search result has the expected fields."""
    res = await client.post("/api/sessions", json=sample_session)
    sid = res.json()["id"]
    await client.post(
        f"/api/sessions/{sid}/transcript",
        json={"transcript": "Unique searchable content here.", "duration_seconds": 10},
    )

    res = await client.get("/api/search?q=searchable")
    data = res.json()
    assert data["total"] >= 1
    result = data["results"][0]
    assert "type" in result
    assert "id" in result
    assert "session_id" in result
    assert "snippet" in result
    assert "created_at" in result
