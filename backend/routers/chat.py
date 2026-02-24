"""Chat router — per-session and cross-meeting conversational AI."""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from database import get_db
from services.chat_service import (
    chat,
    create_conversation,
    delete_conversation,
    get_conversation,
    list_conversations,
)

router = APIRouter(prefix="/api/chat", tags=["chat"])


class ChatRequest(BaseModel):
    message: str
    conversation_id: str | None = None
    session_id: str | None = None
    model: str | None = None


class ChatResponse(BaseModel):
    conversation_id: str
    message: dict
    sources: list[dict] = []


@router.post("", response_model=ChatResponse)
async def send_chat_message(body: ChatRequest, db=Depends(get_db)):
    """Send a chat message. Creates a new conversation if conversation_id is not provided."""
    conversation_id = body.conversation_id

    if not conversation_id:
        conversation = await create_conversation(db, session_id=body.session_id)
        conversation_id = conversation["id"]
    else:
        # Verify conversation exists
        existing = await get_conversation(db, conversation_id)
        if not existing:
            raise HTTPException(404, "Conversation not found")

    try:
        result = await chat(
            db=db,
            conversation_id=conversation_id,
            user_message=body.message,
            model=body.model,
        )
    except ValueError as e:
        raise HTTPException(404, str(e))

    return ChatResponse(
        conversation_id=conversation_id,
        message=result["message"],
        sources=result.get("sources", []),
    )


@router.get("/conversations")
async def list_conversations_endpoint(
    session_id: str | None = None,
    db=Depends(get_db),
):
    """List conversations, optionally filtered by session_id."""
    return await list_conversations(db, session_id=session_id)


@router.get("/conversations/{conversation_id}")
async def get_conversation_endpoint(
    conversation_id: str,
    db=Depends(get_db),
):
    """Get a conversation with all messages."""
    conversation = await get_conversation(db, conversation_id)
    if not conversation:
        raise HTTPException(404, "Conversation not found")
    return conversation


@router.delete("/conversations/{conversation_id}")
async def delete_conversation_endpoint(
    conversation_id: str,
    db=Depends(get_db),
):
    """Delete a conversation and all its messages."""
    deleted = await delete_conversation(db, conversation_id)
    if not deleted:
        raise HTTPException(404, "Conversation not found")
    return {"status": "deleted"}
