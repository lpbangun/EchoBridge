"""Tests for action webhook CRUD and execution endpoints."""

import socket
from unittest.mock import AsyncMock, patch, MagicMock

import pytest


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture(autouse=True)
def _mock_dns():
    """Mock DNS resolution so SSRF checks don't fail on test hostnames."""
    _original = socket.getaddrinfo

    def _fake_getaddrinfo(host, port, *args, **kwargs):
        # Return a public IP for any hostname used in tests
        if host in ("hooks.example.com",):
            return [(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("93.184.216.34", 0))]
        return _original(host, port, *args, **kwargs)

    with patch("socket.getaddrinfo", side_effect=_fake_getaddrinfo):
        yield


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

VALID_WEBHOOK = {
    "name": "Test Webhook",
    "url": "https://hooks.example.com/callback",
    "method": "POST",
    "headers": {"X-Custom": "value"},
    "enabled": True,
}


async def _create_webhook(client, data=None):
    """Helper to create a webhook and return the response data."""
    payload = data or VALID_WEBHOOK
    resp = await client.post("/api/actions", json=payload)
    assert resp.status_code == 201
    return resp.json()


# ---------------------------------------------------------------------------
# CRUD Tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_list_webhooks_empty(client):
    resp = await client.get("/api/actions")
    assert resp.status_code == 200
    data = resp.json()
    assert data["webhooks"] == []
    assert data["count"] == 0


@pytest.mark.asyncio
async def test_create_webhook(client):
    data = await _create_webhook(client)
    assert data["name"] == "Test Webhook"
    assert data["url"] == "https://hooks.example.com/callback"
    assert data["method"] == "POST"
    assert data["headers"] == {"X-Custom": "value"}
    assert data["enabled"] is True
    assert "id" in data
    assert data["id"]  # non-empty


@pytest.mark.asyncio
async def test_list_webhooks_after_create(client):
    await _create_webhook(client)
    await _create_webhook(client, {**VALID_WEBHOOK, "name": "Second Hook"})

    resp = await client.get("/api/actions")
    assert resp.status_code == 200
    data = resp.json()
    assert data["count"] == 2
    names = {w["name"] for w in data["webhooks"]}
    assert names == {"Test Webhook", "Second Hook"}


@pytest.mark.asyncio
async def test_delete_webhook(client):
    created = await _create_webhook(client)
    webhook_id = created["id"]

    resp = await client.delete(f"/api/actions/{webhook_id}")
    assert resp.status_code == 200
    assert resp.json()["ok"] is True

    # Verify deleted
    resp = await client.get("/api/actions")
    assert resp.json()["count"] == 0


@pytest.mark.asyncio
async def test_delete_webhook_not_found(client):
    resp = await client.delete("/api/actions/nonexistent-id")
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# SSRF Protection Tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_ssrf_localhost_rejected(client):
    resp = await client.post("/api/actions", json={
        **VALID_WEBHOOK,
        "url": "http://127.0.0.1:8080/admin",
    })
    assert resp.status_code == 400
    assert "private" in resp.json()["detail"].lower()


@pytest.mark.asyncio
async def test_ssrf_private_10_rejected(client):
    resp = await client.post("/api/actions", json={
        **VALID_WEBHOOK,
        "url": "http://10.0.0.1/internal",
    })
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_ssrf_private_172_rejected(client):
    resp = await client.post("/api/actions", json={
        **VALID_WEBHOOK,
        "url": "http://172.16.0.1/secret",
    })
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_ssrf_link_local_rejected(client):
    resp = await client.post("/api/actions", json={
        **VALID_WEBHOOK,
        "url": "http://169.254.169.254/latest/meta-data",
    })
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_ssrf_localhost_hostname_rejected(client):
    resp = await client.post("/api/actions", json={
        **VALID_WEBHOOK,
        "url": "http://localhost:9090/api",
    })
    assert resp.status_code == 400


# ---------------------------------------------------------------------------
# Execution Tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_execute_nonexistent_webhook(client):
    resp = await client.post("/api/actions/execute", json={
        "webhook_id": "nonexistent-id",
        "payload": {"test": True},
    })
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_execute_disabled_webhook(client):
    created = await _create_webhook(client, {**VALID_WEBHOOK, "enabled": False})
    webhook_id = created["id"]

    resp = await client.post("/api/actions/execute", json={
        "webhook_id": webhook_id,
        "payload": {"test": True},
    })
    assert resp.status_code == 400
    assert "disabled" in resp.json()["detail"].lower()


@pytest.mark.asyncio
async def test_execute_webhook_success(client):
    """Test executing a valid webhook with a mocked HTTP response."""
    created = await _create_webhook(client)
    webhook_id = created["id"]

    # Mock httpx.AsyncClient to return a successful response
    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.json.return_value = {"received": True}

    mock_client_instance = AsyncMock()
    mock_client_instance.request = AsyncMock(return_value=mock_response)
    mock_client_instance.__aenter__ = AsyncMock(return_value=mock_client_instance)
    mock_client_instance.__aexit__ = AsyncMock(return_value=False)

    with patch("services.action_service.httpx.AsyncClient", return_value=mock_client_instance):
        resp = await client.post("/api/actions/execute", json={
            "webhook_id": webhook_id,
            "payload": {"action": "create_task", "title": "Follow up"},
        })

    assert resp.status_code == 200
    data = resp.json()
    assert data["ok"] is True
    assert data["status_code"] == 200
    assert data["body"] == {"received": True}


@pytest.mark.asyncio
async def test_execute_webhook_with_interpretation_id(client):
    """Test that interpretation_id is accepted in the request body."""
    created = await _create_webhook(client)
    webhook_id = created["id"]

    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.json.return_value = {"ok": True}

    mock_client_instance = AsyncMock()
    mock_client_instance.request = AsyncMock(return_value=mock_response)
    mock_client_instance.__aenter__ = AsyncMock(return_value=mock_client_instance)
    mock_client_instance.__aexit__ = AsyncMock(return_value=False)

    with patch("services.action_service.httpx.AsyncClient", return_value=mock_client_instance):
        resp = await client.post("/api/actions/execute", json={
            "webhook_id": webhook_id,
            "payload": {"data": "value"},
            "interpretation_id": "interp-123",
        })

    assert resp.status_code == 200
    assert resp.json()["ok"] is True
