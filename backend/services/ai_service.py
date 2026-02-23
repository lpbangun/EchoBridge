"""OpenRouter AI service for generating interpretations."""

import httpx
from config import settings

OPENROUTER_BASE = "https://openrouter.ai/api/v1/chat/completions"


async def call_openrouter(
    model: str,
    system_prompt: str,
    user_content: str,
    temperature: float = 0.3,
    max_tokens: int = 4096,
) -> str:
    """Call OpenRouter API and return the response text."""
    api_key = settings.openrouter_api_key
    if not api_key:
        raise ValueError("OPENROUTER_API_KEY is not set")

    async with httpx.AsyncClient() as client:
        response = await client.post(
            OPENROUTER_BASE,
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
