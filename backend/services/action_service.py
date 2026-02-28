"""Action service — allowlist-based webhook execution with SSRF protection.

Manages webhook configurations stored in the `app_settings` table and
executes HTTP requests only to pre-registered, non-private URLs.
"""

import ipaddress
import json
import uuid
from urllib.parse import urlparse

import httpx


# Private IP ranges that must be rejected (SSRF protection)
_PRIVATE_NETWORKS = [
    ipaddress.ip_network("127.0.0.0/8"),
    ipaddress.ip_network("10.0.0.0/8"),
    ipaddress.ip_network("172.16.0.0/12"),
    ipaddress.ip_network("169.254.0.0/16"),
    ipaddress.ip_network("192.168.0.0/16"),
    ipaddress.ip_network("0.0.0.0/8"),
    ipaddress.ip_network("::1/128"),
]

SETTINGS_KEY = "action_webhooks"


def _is_private_url(url: str) -> bool:
    """Check whether a URL resolves to a private/reserved IP range."""
    parsed = urlparse(url)
    hostname = parsed.hostname
    if not hostname:
        return True
    try:
        addr = ipaddress.ip_address(hostname)
        return any(addr in network for network in _PRIVATE_NETWORKS)
    except ValueError:
        # Not a raw IP — check common private hostnames
        lower = hostname.lower()
        if lower in ("localhost", "localhost.localdomain"):
            return True
    return False


async def get_webhook_allowlist(db) -> list[dict]:
    """Read the webhook allowlist from app_settings."""
    cursor = await db.execute(
        "SELECT value FROM app_settings WHERE key = ?", (SETTINGS_KEY,)
    )
    row = await cursor.fetchone()
    if not row:
        return []
    try:
        return json.loads(row["value"])
    except (json.JSONDecodeError, TypeError):
        return []


async def save_webhook_allowlist(db, webhooks: list[dict]) -> None:
    """Write the webhook allowlist to app_settings."""
    value = json.dumps(webhooks)
    await db.execute(
        """INSERT INTO app_settings (key, value) VALUES (?, ?)
           ON CONFLICT(key) DO UPDATE SET value = excluded.value""",
        (SETTINGS_KEY, value),
    )
    await db.commit()


async def add_webhook(db, name: str, url: str, method: str = "POST",
                      headers: dict[str, str] | None = None,
                      enabled: bool = True) -> dict:
    """Add a new webhook to the allowlist. Returns the created webhook config."""
    if _is_private_url(url):
        raise ValueError("Webhook URL points to a private/reserved IP range")

    webhooks = await get_webhook_allowlist(db)
    webhook = {
        "id": str(uuid.uuid4()),
        "name": name,
        "url": url,
        "method": method.upper(),
        "headers": headers or {},
        "enabled": enabled,
    }
    webhooks.append(webhook)
    await save_webhook_allowlist(db, webhooks)
    return webhook


async def remove_webhook(db, webhook_id: str) -> bool:
    """Remove a webhook from the allowlist. Returns True if found and removed."""
    webhooks = await get_webhook_allowlist(db)
    original_len = len(webhooks)
    webhooks = [w for w in webhooks if w["id"] != webhook_id]
    if len(webhooks) == original_len:
        return False
    await save_webhook_allowlist(db, webhooks)
    return True


async def execute_webhook(db, webhook_id: str, payload: dict) -> dict:
    """Execute a webhook by ID if it exists in the allowlist and is enabled.

    Returns a dict with keys: status_code, body, ok.
    Raises ValueError if the webhook is not found, disabled, or targets a private IP.
    """
    webhooks = await get_webhook_allowlist(db)
    webhook = next((w for w in webhooks if w["id"] == webhook_id), None)

    if webhook is None:
        raise LookupError(f"Webhook {webhook_id} not found in allowlist")

    if not webhook.get("enabled", True):
        raise ValueError(f"Webhook {webhook_id} is disabled")

    url = webhook["url"]
    if _is_private_url(url):
        raise ValueError("Webhook URL points to a private/reserved IP range")

    method = webhook.get("method", "POST").upper()
    headers = webhook.get("headers", {})

    async with httpx.AsyncClient(timeout=10.0) as client:
        response = await client.request(
            method=method,
            url=url,
            json=payload,
            headers=headers,
        )

    # Try to parse response as JSON, fall back to text
    try:
        body = response.json()
    except Exception:
        body = response.text

    return {
        "status_code": response.status_code,
        "body": body,
        "ok": 200 <= response.status_code < 300,
    }
