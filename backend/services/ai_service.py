"""AI service supporting multiple providers (OpenRouter, OpenAI, Anthropic, Google, xAI)."""

import httpx
from config import settings

# Provider endpoint URLs
PROVIDER_ENDPOINTS = {
    "openrouter": "https://openrouter.ai/api/v1/chat/completions",
    "openai": "https://api.openai.com/v1/chat/completions",
    "anthropic": "https://api.anthropic.com/v1/messages",
    "google": "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
    "xai": "https://api.x.ai/v1/chat/completions",
}


def _get_api_key(provider: str | None = None) -> str:
    """Get the API key for the given provider."""
    p = provider or settings.ai_provider
    key_map = {
        "openrouter": settings.openrouter_api_key,
        "openai": settings.openai_api_key,
        "anthropic": settings.anthropic_api_key,
        "google": settings.google_api_key,
        "xai": settings.xai_api_key,
    }
    key = key_map.get(p, "")
    if not key:
        raise ValueError(f"API key for {p} is not set. Configure it in Settings.")
    return key


async def _call_openai_compatible(
    endpoint: str,
    api_key: str,
    model: str,
    system_prompt: str,
    user_content: str,
    temperature: float,
    max_tokens: int,
) -> str:
    """Call an OpenAI-compatible chat completions API."""
    async with httpx.AsyncClient() as client:
        response = await client.post(
            endpoint,
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json={
                "model": model,
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_content},
                ],
                "temperature": temperature,
                "max_tokens": max_tokens,
            },
            timeout=120.0,
        )
        response.raise_for_status()
        return response.json()["choices"][0]["message"]["content"]


async def _call_anthropic(
    api_key: str,
    model: str,
    system_prompt: str,
    user_content: str,
    temperature: float,
    max_tokens: int,
) -> str:
    """Call the Anthropic Messages API."""
    async with httpx.AsyncClient() as client:
        response = await client.post(
            PROVIDER_ENDPOINTS["anthropic"],
            headers={
                "x-api-key": api_key,
                "anthropic-version": "2023-06-01",
                "Content-Type": "application/json",
            },
            json={
                "model": model,
                "system": system_prompt,
                "messages": [
                    {"role": "user", "content": user_content},
                ],
                "temperature": temperature,
                "max_tokens": max_tokens,
            },
            timeout=120.0,
        )
        response.raise_for_status()
        return response.json()["content"][0]["text"]


async def call_ai(
    model: str,
    system_prompt: str,
    user_content: str,
    temperature: float = 0.3,
    max_tokens: int = 4096,
) -> str:
    """Route an AI call to the configured provider."""
    provider = settings.ai_provider
    api_key = _get_api_key(provider)

    if provider == "anthropic":
        return await _call_anthropic(
            api_key=api_key,
            model=model,
            system_prompt=system_prompt,
            user_content=user_content,
            temperature=temperature,
            max_tokens=max_tokens,
        )

    endpoint = PROVIDER_ENDPOINTS.get(provider)
    if not endpoint:
        raise ValueError(f"Unknown AI provider: {provider}")

    return await _call_openai_compatible(
        endpoint=endpoint,
        api_key=api_key,
        model=model,
        system_prompt=system_prompt,
        user_content=user_content,
        temperature=temperature,
        max_tokens=max_tokens,
    )


async def generate_title(transcript: str, model: str) -> str:
    """Generate a concise 3-8 word title from a transcript."""
    system_prompt = (
        "Generate a concise 3-8 word title for this meeting or recording "
        "based on the transcript. Return only the title, no quotes, no punctuation at the end."
    )
    try:
        title = await call_ai(
            model=model,
            system_prompt=system_prompt,
            user_content=f"TRANSCRIPT:\n{transcript[:3000]}",
            temperature=0.3,
            max_tokens=32,
        )
        return title.strip().strip('"\'')
    except Exception:
        return ""

