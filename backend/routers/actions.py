"""Action webhooks — CRUD and execution of allowlisted webhooks."""

from fastapi import APIRouter, Depends, HTTPException

from database import get_db
from models.schemas import WebhookConfig, WebhookExecuteRequest
from services.action_service import (
    get_webhook_allowlist,
    add_webhook,
    remove_webhook,
    execute_webhook,
)

router = APIRouter(prefix="/api/actions", tags=["actions"])


@router.get("")
async def list_webhooks(db=Depends(get_db)):
    """List all configured webhooks."""
    webhooks = await get_webhook_allowlist(db)
    return {"webhooks": webhooks, "count": len(webhooks)}


@router.post("", status_code=201)
async def create_webhook(config: WebhookConfig, db=Depends(get_db)):
    """Add a webhook to the allowlist."""
    try:
        webhook = await add_webhook(
            db,
            name=config.name,
            url=config.url,
            method=config.method,
            headers=config.headers,
            enabled=config.enabled,
        )
    except ValueError as e:
        raise HTTPException(400, str(e))
    return webhook


@router.delete("/{webhook_id}")
async def delete_webhook(webhook_id: str, db=Depends(get_db)):
    """Remove a webhook from the allowlist."""
    removed = await remove_webhook(db, webhook_id)
    if not removed:
        raise HTTPException(404, "Webhook not found")
    return {"ok": True}


@router.post("/execute")
async def execute_webhook_endpoint(
    body: WebhookExecuteRequest,
    db=Depends(get_db),
):
    """Execute a specific webhook with the given payload."""
    try:
        result = await execute_webhook(db, body.webhook_id, body.payload)
    except LookupError:
        raise HTTPException(404, "Webhook not found in allowlist")
    except ValueError as e:
        raise HTTPException(400, str(e))
    except Exception as e:
        raise HTTPException(502, f"Webhook execution failed: {e}")
    return result
