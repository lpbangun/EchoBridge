"""Invite link endpoints for agent onboarding."""

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import Response

from database import get_db
from models.schemas import (
    InviteCreate,
    InviteClaimRequest,
    InviteClaimResponse,
    InviteResponse,
)
from services.invite_service import (
    claim_invite,
    create_invite,
    get_invite_by_token,
    list_invites,
    revoke_invite,
)

router = APIRouter(prefix="/api/invites", tags=["invites"])


def _base_url(request: Request) -> str:
    """Derive the public base URL from the request (respects X-Forwarded-* in production)."""
    url = str(request.base_url).rstrip("/")
    return url


@router.post("", response_model=InviteResponse, status_code=201)
async def create_invite_endpoint(
    body: InviteCreate,
    request: Request,
    db=Depends(get_db),
):
    """Generate a new single-use invite link."""
    invite = await create_invite(db, body.label)
    invite["invite_url"] = f"{_base_url(request)}/invite/{invite['token']}"
    return invite


@router.get("", response_model=list[InviteResponse])
async def list_invites_endpoint(request: Request, db=Depends(get_db)):
    """List all invites with their URLs."""
    invites = await list_invites(db)
    base = _base_url(request)
    for inv in invites:
        inv["invite_url"] = f"{base}/invite/{inv['token']}"
    return invites


@router.delete("/{invite_id}", status_code=204)
async def revoke_invite_endpoint(invite_id: str, db=Depends(get_db)):
    """Revoke an unclaimed invite."""
    deleted = await revoke_invite(db, invite_id)
    if not deleted:
        raise HTTPException(404, "Invite not found or already claimed")
    return Response(status_code=204)


@router.get("/{token}/preview", response_model=InviteResponse)
async def preview_invite_endpoint(token: str, request: Request, db=Depends(get_db)):
    """Check invite validity before claiming (public endpoint)."""
    invite = await get_invite_by_token(db, token)
    if not invite:
        raise HTTPException(404, "Invite not found")
    if invite["claimed_at"]:
        raise HTTPException(410, "Invite already claimed")
    invite["invite_url"] = f"{_base_url(request)}/invite/{invite['token']}"
    return invite


@router.post("/{token}/claim", response_model=InviteClaimResponse)
async def claim_invite_endpoint(
    token: str,
    body: InviteClaimRequest,
    request: Request,
    db=Depends(get_db),
):
    """Consume an invite — returns API key and pre-configured SKILL.md."""
    if not body.agent_name.strip():
        raise HTTPException(400, "agent_name must not be blank")

    base = _base_url(request)
    try:
        result = await claim_invite(db, token, body.agent_name.strip(), base)
    except ValueError as e:
        msg = str(e)
        if "not found" in msg:
            raise HTTPException(404, msg)
        # expired or already claimed
        raise HTTPException(410, msg)
    return result
