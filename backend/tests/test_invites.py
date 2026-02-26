"""Tests for invite link endpoints (/api/invites)."""

import pytest


@pytest.mark.asyncio
async def test_create_invite(client, db):
    resp = await client.post("/api/invites", json={"label": "test-agent"})
    assert resp.status_code == 201
    data = resp.json()
    assert data["label"] == "test-agent"
    assert data["token"].startswith("echobridge_invite_")
    assert data["invite_url"].endswith(f"/invite/{data['token']}")
    assert data["claimed_at"] is None
    assert data["api_key_id"] is None
    assert data["expires_at"] is not None


@pytest.mark.asyncio
async def test_create_invite_empty_label(client, db):
    resp = await client.post("/api/invites", json={})
    assert resp.status_code == 201
    assert resp.json()["label"] == ""


@pytest.mark.asyncio
async def test_list_invites(client, db):
    await client.post("/api/invites", json={"label": "inv-1"})
    await client.post("/api/invites", json={"label": "inv-2"})

    resp = await client.get("/api/invites")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) >= 2
    # Newest first
    assert data[0]["label"] == "inv-2"


@pytest.mark.asyncio
async def test_preview_invite_valid(client, db):
    create_resp = await client.post("/api/invites", json={"label": "preview-test"})
    token = create_resp.json()["token"]

    resp = await client.get(f"/api/invites/{token}/preview")
    assert resp.status_code == 200
    data = resp.json()
    assert data["label"] == "preview-test"
    assert data["claimed_at"] is None


@pytest.mark.asyncio
async def test_preview_invite_not_found(client, db):
    resp = await client.get("/api/invites/nonexistent_token/preview")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_preview_invite_already_claimed(client, db):
    create_resp = await client.post("/api/invites", json={"label": "claim-preview"})
    token = create_resp.json()["token"]

    # Claim it first
    await client.post(
        f"/api/invites/{token}/claim",
        json={"agent_name": "test-agent"},
    )

    # Preview should return 410
    resp = await client.get(f"/api/invites/{token}/preview")
    assert resp.status_code == 410


@pytest.mark.asyncio
async def test_claim_invite_happy_path(client, db):
    create_resp = await client.post("/api/invites", json={"label": "claim-test"})
    token = create_resp.json()["token"]

    resp = await client.post(
        f"/api/invites/{token}/claim",
        json={"agent_name": "my-agent"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["api_key"].startswith("scribe_sk_")
    assert data["agent_name"] == "my-agent"
    assert data["api_key_id"]
    # SKILL.md should have no remaining placeholders
    assert "$ECHOBRIDGE_API_URL" not in data["skill_md"]
    assert "$ECHOBRIDGE_API_KEY" not in data["skill_md"]
    # Should contain the actual key
    assert data["api_key"] in data["skill_md"]


@pytest.mark.asyncio
async def test_claim_invite_twice(client, db):
    create_resp = await client.post("/api/invites", json={"label": "double-claim"})
    token = create_resp.json()["token"]

    # First claim succeeds
    resp1 = await client.post(
        f"/api/invites/{token}/claim",
        json={"agent_name": "agent-1"},
    )
    assert resp1.status_code == 200

    # Second claim fails with 410
    resp2 = await client.post(
        f"/api/invites/{token}/claim",
        json={"agent_name": "agent-2"},
    )
    assert resp2.status_code == 410


@pytest.mark.asyncio
async def test_claim_invite_blank_agent_name(client, db):
    create_resp = await client.post("/api/invites", json={"label": "blank-name"})
    token = create_resp.json()["token"]

    resp = await client.post(
        f"/api/invites/{token}/claim",
        json={"agent_name": "   "},
    )
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_revoke_unclaimed_invite(client, db):
    create_resp = await client.post("/api/invites", json={"label": "revoke-test"})
    invite_id = create_resp.json()["id"]

    resp = await client.delete(f"/api/invites/{invite_id}")
    assert resp.status_code == 204

    # Verify it's gone
    list_resp = await client.get("/api/invites")
    ids = [i["id"] for i in list_resp.json()]
    assert invite_id not in ids


@pytest.mark.asyncio
async def test_revoke_claimed_invite(client, db):
    create_resp = await client.post("/api/invites", json={"label": "revoke-claimed"})
    invite_id = create_resp.json()["id"]
    token = create_resp.json()["token"]

    # Claim it
    await client.post(
        f"/api/invites/{token}/claim",
        json={"agent_name": "test-agent"},
    )

    # Revoke should fail (already claimed)
    resp = await client.delete(f"/api/invites/{invite_id}")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_revoke_nonexistent_invite(client, db):
    resp = await client.delete("/api/invites/nonexistent-id")
    assert resp.status_code == 404
