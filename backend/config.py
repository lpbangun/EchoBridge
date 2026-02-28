from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # AI Provider: "openrouter" | "openai" | "anthropic" | "google" | "xai"
    ai_provider: str = "openrouter"

    # Provider API keys
    openrouter_api_key: str = ""
    openai_api_key: str = ""
    anthropic_api_key: str = ""
    google_api_key: str = ""
    xai_api_key: str = ""

    # Display
    user_display_name: str = "User"

    # Export
    output_dir: str = "./output"
    auto_export: bool = True
    include_transcript_in_md: bool = True

    # STT
    stt_provider: str = "local"  # "local" (faster-whisper) | "openai"
    whisper_model: str = "small"
    whisper_device: str = "cpu"
    whisper_compute_type: str = "int8"
    openai_stt_model: str = "whisper-1"  # whisper-1 | gpt-4o-mini-transcribe | gpt-4o-transcribe

    # AI
    default_model: str = "x-ai/grok-4.1-fast"

    # Server
    host: str = "0.0.0.0"
    port: int = 8000
    database_path: str = "./data/echobridge.db"
    audio_dir: str = "./data/audio"

    # Agent API
    echobridge_agent_api_key: str = ""

    # Frontend URL (for constructing shareable join links)
    frontend_base_url: str = "http://localhost:5173"

    # Cloud Storage (S3-compatible)
    cloud_storage_enabled: bool = False
    s3_endpoint_url: str = ""  # For R2, B2, MinIO — leave empty for AWS S3
    s3_access_key_id: str = ""
    s3_secret_access_key: str = ""
    s3_bucket_name: str = ""
    s3_region: str = "auto"
    s3_prefix: str = "echobridge/"  # Key prefix in bucket
    cloud_sync_audio: bool = True  # Sync audio files
    cloud_sync_exports: bool = True  # Sync markdown exports

    # Onboarding
    onboarding_complete: bool = False

    # Auto-interpret
    auto_interpret: bool = True
    auto_interpret_model: str = ""  # empty = use default_model

    # Auto-sockets: comma-separated socket IDs to run after auto-interpret
    auto_sockets: str = "action_items,executive_brief"

    # Deepgram STT
    deepgram_api_key: str = ""
    deepgram_model: str = "nova-3"
    deepgram_diarize: bool = True

    # Wall auto-posting
    auto_post_summaries: bool = True

    # Models per provider — users can also paste custom model IDs
    provider_models: dict[str, dict[str, str]] = {
        "openrouter": {
            "anthropic/claude-opus-4.6": "Claude Opus 4.6",
            "anthropic/claude-sonnet-4.6": "Claude Sonnet 4.6",
            "openai/gpt-5.2-chat": "GPT-5.2",
            "google/gemini-3-flash-preview": "Gemini 3 Flash",
            "google/gemini-3-pro-preview": "Gemini 3 Pro",
            "deepseek/deepseek-v3.2": "DeepSeek V3.2",
            "x-ai/grok-4.1-fast": "Grok 4.1 Fast",
            "mistralai/mistral-large-2512": "Mistral Large 3",
        },
        "openai": {
            "gpt-4o": "GPT-4o",
            "gpt-4o-mini": "GPT-4o Mini",
            "o3-mini": "o3-mini",
        },
        "anthropic": {
            "claude-opus-4-6-latest": "Claude Opus 4.6",
            "claude-sonnet-4-6-latest": "Claude Sonnet 4.6",
            "claude-haiku-4-5-latest": "Claude Haiku 4.5",
        },
        "google": {
            "gemini-2.5-flash": "Gemini 2.5 Flash",
            "gemini-2.5-pro": "Gemini 2.5 Pro",
        },
        "xai": {
            "grok-4.1-fast": "Grok 4.1 Fast",
            "grok-3": "Grok 3",
            "grok-3-fast": "Grok 3 Fast",
        },
    }

    # Backward-compat: flat models dict for the current provider
    @property
    def models(self) -> dict[str, str]:
        return self.provider_models.get(self.ai_provider, {})

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


settings = Settings()
