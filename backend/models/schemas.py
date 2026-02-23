from pydantic import BaseModel, Field
from datetime import datetime
from enum import Enum


class SessionContext(str, Enum):
    CLASS_LECTURE = "class_lecture"
    STARTUP_MEETING = "startup_meeting"
    RESEARCH_DISCUSSION = "research_discussion"
    WORKING_SESSION = "working_session"
    TALK_SEMINAR = "talk_seminar"


class SessionStatus(str, Enum):
    CREATED = "created"
    RECORDING = "recording"
    TRANSCRIBING = "transcribing"
    PROCESSING = "processing"
    COMPLETE = "complete"
    ERROR = "error"


class RoomStatus(str, Enum):
    WAITING = "waiting"
    RECORDING = "recording"
    PROCESSING = "processing"
    CLOSED = "closed"


class LensType(str, Enum):
    PRESET = "preset"
    CUSTOM = "custom"
    SOCKET = "socket"


class SourceType(str, Enum):
    USER = "user"
    AGENT = "agent"
    ROOM_PARTICIPANT = "room_participant"


# --- Session schemas ---

class SessionCreate(BaseModel):
    title: str | None = None
    context: SessionContext
    context_metadata: dict = Field(default_factory=dict)
    host_name: str | None = None


class SessionUpdate(BaseModel):
    title: str | None = None
    context_metadata: dict | None = None


class SessionResponse(BaseModel):
    model_config = {"from_attributes": True}

    id: str
    title: str | None
    context: str
    context_metadata: dict
    room_id: str | None
    created_at: str
    duration_seconds: int | None
    status: str
    transcript: str | None
    stt_provider: str | None
    audio_path: str | None
    host_name: str | None
    error_message: str | None


class SessionListItem(BaseModel):
    id: str
    title: str | None
    context: str
    context_metadata: dict
    room_id: str | None
    created_at: str
    duration_seconds: int | None
    status: str
    host_name: str | None


# --- Interpretation schemas ---

class InterpretRequest(BaseModel):
    lens_type: LensType = LensType.PRESET
    lens_id: str | None = None
    system_prompt: str | None = None
    model: str | None = None
    source_name: str | None = None


class InterpretationResponse(BaseModel):
    id: str
    session_id: str
    source_type: str
    source_name: str | None
    lens_type: str
    lens_id: str | None
    model: str
    output_markdown: str
    output_structured: dict | None
    is_primary: bool
    created_at: str


# --- Room schemas ---

class RoomCreate(BaseModel):
    context: SessionContext
    title: str | None = None
    context_metadata: dict = Field(default_factory=dict)
    host_name: str


class RoomJoin(BaseModel):
    code: str
    name: str
    type: str = "human"  # "human" | "agent"


class RoomResponse(BaseModel):
    room_id: str
    code: str
    session_id: str
    status: str
    host_name: str
    created_at: str
    participants: list[dict] = Field(default_factory=list)


# --- Socket schemas ---

class SocketCreate(BaseModel):
    id: str
    name: str
    description: str
    category: str
    system_prompt: str
    output_schema: dict


class SocketResponse(BaseModel):
    id: str
    name: str
    description: str
    category: str
    system_prompt: str
    output_schema: dict
    is_preset: bool
    created_at: str


# --- Export schemas ---

class ExportResponse(BaseModel):
    markdown: str
    filename: str


# --- Search schemas ---

class SearchResult(BaseModel):
    type: str  # "session" | "interpretation"
    id: str
    session_id: str
    title: str | None
    context: str | None
    snippet: str
    created_at: str


class SearchResponse(BaseModel):
    query: str
    results: list[SearchResult]
    total: int


# --- Settings schemas ---

class SettingsResponse(BaseModel):
    openrouter_api_key_set: bool
    user_display_name: str
    output_dir: str
    auto_export: bool
    include_transcript_in_md: bool
    whisper_model: str
    default_model: str
    models: dict[str, str]


class SettingsUpdate(BaseModel):
    openrouter_api_key: str | None = None
    user_display_name: str | None = None
    output_dir: str | None = None
    auto_export: bool | None = None
    include_transcript_in_md: bool | None = None
    whisper_model: str | None = None
    default_model: str | None = None


# --- API Key schemas ---

class ApiKeyCreate(BaseModel):
    name: str


class ApiKeyResponse(BaseModel):
    id: str
    name: str
    key: str  # Only returned on creation
    created_at: str


# --- Lens schemas ---

class LensInfo(BaseModel):
    id: str
    name: str
    description: str
    context: str
