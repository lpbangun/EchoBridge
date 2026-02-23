from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # Required
    openrouter_api_key: str = ""

    # Display
    user_display_name: str = "User"

    # Export
    output_dir: str = "./output"
    auto_export: bool = True
    include_transcript_in_md: bool = True

    # STT
    whisper_model: str = "small"
    whisper_device: str = "cpu"
    whisper_compute_type: str = "int8"

    # AI
    default_model: str = "anthropic/claude-sonnet-4-20250514"

    # Server
    host: str = "0.0.0.0"
    port: int = 8000
    database_path: str = "./data/echobridge.db"
    audio_dir: str = "./data/audio"

    # Agent API
    echobridge_agent_api_key: str = ""

    # Models available via OpenRouter
    models: dict[str, str] = {
        "anthropic/claude-sonnet-4-20250514": "Claude Sonnet 4",
        "google/gemini-2.5-flash-preview": "Gemini 2.5 Flash",
        "deepseek/deepseek-chat-v3-0324": "DeepSeek V3",
    }

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


settings = Settings()
