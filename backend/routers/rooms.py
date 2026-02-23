"""Room management router."""

from fastapi import APIRouter, Depends, HTTPException

from database import get_db
from models.schemas import RoomCreate, RoomJoin, RoomResponse
from services.room_service import create_room, join_room, get_room, update_room_status

router = APIRouter(prefix="/api/rooms", tags=["rooms"])


@router.post("", response_model=RoomResponse)
async def create_room_endpoint(body: RoomCreate, db=Depends(get_db)):
    result = await create_room(
        db=db,
        context=body.context.value,
        host_name=body.host_name,
        title=body.title,
        context_metadata=body.context_metadata,
    )
    return result


@router.post("/join")
async def join_room_endpoint(body: RoomJoin, db=Depends(get_db)):
    try:
        result = await join_room(db, body.code, body.name, body.type)
        return result
    except ValueError as e:
        raise HTTPException(404, str(e))


@router.get("/{code}", response_model=RoomResponse)
async def get_room_endpoint(code: str, db=Depends(get_db)):
    room = await get_room(db, code)
    if not room:
        raise HTTPException(404, "Room not found")
    return RoomResponse(
        room_id=room["id"],
        code=room["code"],
        session_id=room["session_id"],
        status=room["status"],
        host_name=room["host_name"],
        created_at=room["created_at"],
        participants=[
            {"name": p["name"], "type": p["participant_type"]}
            for p in room.get("participants", [])
        ],
    )


@router.post("/{code}/start")
async def start_recording(code: str, db=Depends(get_db)):
    try:
        result = await update_room_status(db, code, "recording")
        return result
    except ValueError as e:
        raise HTTPException(404, str(e))


@router.post("/{code}/stop")
async def stop_recording(code: str, db=Depends(get_db)):
    try:
        result = await update_room_status(db, code, "processing")
        return result
    except ValueError as e:
        raise HTTPException(404, str(e))
