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
    ACTIVE = "active"
    PAUSED = "paused"


class RoomMode(str, Enum):
    STANDARD = "standard"
    AGENT_MEETING = "agent_meeting"


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
    series_id: str | None = None


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
    series_id: str | None = None
    series_name: str | None = None


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
    series_id: str | None = None
    series_name: str | None = None
    summary_snippet: str | None = None


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


class InterpretationUpdate(BaseModel):
    output_markdown: str


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
    ai_provider: str
    openrouter_api_key_set: bool
    openai_api_key_set: bool
    anthropic_api_key_set: bool
    google_api_key_set: bool
    xai_api_key_set: bool
    user_display_name: str
    output_dir: str
    auto_export: bool
    include_transcript_in_md: bool
    stt_provider: str
    whisper_model: str
    openai_stt_model: str
    default_model: str
    models: dict[str, str]
    provider_models: dict[str, dict[str, str]]
    # Deepgram
    deepgram_api_key_set: bool
    deepgram_model: str
    # Auto-interpret
    auto_interpret: bool
    auto_sockets: list[str]
    # Cloud storage
    cloud_storage_enabled: bool
    s3_endpoint_url: str
    s3_access_key_id: str
    s3_secret_configured: bool
    s3_bucket_name: str
    s3_region: str
    s3_prefix: str
    cloud_sync_audio: bool
    cloud_sync_exports: bool
    # Onboarding
    onboarding_complete: bool


class SettingsUpdate(BaseModel):
    ai_provider: str | None = None
    openrouter_api_key: str | None = None
    openai_api_key: str | None = None
    anthropic_api_key: str | None = None
    google_api_key: str | None = None
    xai_api_key: str | None = None
    user_display_name: str | None = None
    output_dir: str | None = None
    auto_export: bool | None = None
    include_transcript_in_md: bool | None = None
    stt_provider: str | None = None
    whisper_model: str | None = None
    openai_stt_model: str | None = None
    default_model: str | None = None
    # Deepgram
    deepgram_api_key: str | None = None
    deepgram_model: str | None = None
    # Auto-interpret
    auto_interpret: bool | None = None
    auto_sockets: list[str] | None = None
    # Cloud storage
    cloud_storage_enabled: bool | None = None
    s3_endpoint_url: str | None = None
    s3_access_key_id: str | None = None
    s3_secret_access_key: str | None = None
    s3_bucket_name: str | None = None
    s3_region: str | None = None
    s3_prefix: str | None = None
    cloud_sync_audio: bool | None = None
    cloud_sync_exports: bool | None = None
    # Onboarding
    onboarding_complete: bool | None = None


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


# --- Series schemas ---

class SeriesCreate(BaseModel):
    name: str
    description: str = ""


class SeriesUpdate(BaseModel):
    name: str | None = None
    description: str | None = None


class SeriesResponse(BaseModel):
    id: str
    name: str
    description: str
    memory_document: str
    session_count: int
    created_at: str
    updated_at: str


class SeriesListItem(BaseModel):
    id: str
    name: str
    description: str
    session_count: int
    created_at: str
    updated_at: str


class MemoryDocumentResponse(BaseModel):
    series_id: str
    series_name: str
    memory_document: str
    updated_at: str
    session_count: int


# --- Agent Meeting schemas ---

class AgentPersonaConfig(BaseModel):
    name: str
    type: str = "internal"  # "internal" | "external"
    socket_id: str | None = None
    persona_prompt: str | None = None
    model: str | None = None


class AgentMeetingCreate(BaseModel):
    topic: str
    host_name: str
    agents: list[AgentPersonaConfig] = Field(min_length=2, max_length=4)
    task_description: str = ""
    cooldown_seconds: float = Field(default=3.0, ge=1.0, le=30.0)
    max_rounds: int = Field(default=20, ge=5, le=100)
    title: str | None = None


class DirectiveCreate(BaseModel):
    text: str
    from_name: str


class HumanMessageCreate(BaseModel):
    text: str
    from_name: str


class MeetingMessageResponse(BaseModel):
    id: str
    room_id: str
    sender_name: str
    sender_type: str
    message_type: str
    content: str
    sequence_number: int
    created_at: str


class AgentMeetingResponse(BaseModel):
    room_id: str
    code: str
    session_id: str
    status: str
    host_name: str
    topic: str
    agents: list[dict] = Field(default_factory=list)
    created_at: str


# --- Invite schemas ---

class InviteCreate(BaseModel):
    label: str = ""


class InviteResponse(BaseModel):
    id: str
    token: str
    label: str
    created_at: str
    expires_at: str | None
    claimed_at: str | None
    api_key_id: str | None
    invite_url: str | None = None


class InviteClaimRequest(BaseModel):
    agent_name: str


class InviteClaimResponse(BaseModel):
    api_key: str
    api_key_id: str
    agent_name: str
    skill_md: str
