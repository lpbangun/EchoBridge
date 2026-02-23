"""Interpretation engine — runs lenses and sockets against transcripts."""

import json
import uuid
from datetime import datetime, timezone

import jsonschema

from config import settings
from lenses.base import get_lens
from services.ai_service import call_openrouter


async def interpret_with_lens(
    session_id: str,
    transcript: str,
    lens_id: str,
    model: str | None,
    context_metadata: dict,
    source_type: str = "user",
    source_name: str | None = None,
    db=None,
    memory_context: str | None = None,
) -> dict:
    """Run a preset lens against a transcript and store the interpretation."""
    lens = get_lens(lens_id)
    if not lens:
        raise ValueError(f"Unknown lens: {lens_id}")

    model = model or settings.default_model
    source_name = source_name or settings.user_display_name

    # Fill context metadata into prompt
    metadata_str = json.dumps(context_metadata, indent=2) if context_metadata else "{}"
    prompt = lens["system_prompt"].replace("{context_metadata}", metadata_str)

    if memory_context:
        prompt += "\n\nYou have access to a Meeting Memory document from previous sessions in this series. Use it for context — reference prior decisions, note action item progress, and connect themes across meetings."

    user_content = ""
    if memory_context:
        user_content += f"MEETING MEMORY (context from previous meetings):\n{memory_context}\n\n---\n\n"
    user_content += f"TRANSCRIPT:\n{transcript}"

    output = await call_openrouter(
        model=model,
        system_prompt=prompt,
        user_content=user_content,
    )

    interpretation_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()

    if db:
        await db.execute(
            """INSERT INTO interpretations
            (id, session_id, source_type, source_name, lens_type, lens_id,
             model, output_markdown, is_primary, created_at)
            VALUES (?, ?, ?, ?, 'preset', ?, ?, ?, ?, ?)""",
            (interpretation_id, session_id, source_type, source_name,
             lens_id, model, output, True, now),
        )
        await db.commit()

    return {
        "id": interpretation_id,
        "session_id": session_id,
        "source_type": source_type,
        "source_name": source_name,
        "lens_type": "preset",
        "lens_id": lens_id,
        "model": model,
        "output_markdown": output,
        "output_structured": None,
        "is_primary": True,
        "created_at": now,
    }


async def interpret_with_custom(
    session_id: str,
    transcript: str,
    system_prompt: str,
    model: str | None,
    source_type: str = "user",
    source_name: str | None = None,
    db=None,
    memory_context: str | None = None,
) -> dict:
    """Run a custom prompt against a transcript."""
    model = model or settings.default_model
    source_name = source_name or settings.user_display_name

    if memory_context:
        system_prompt += "\n\nYou have access to a Meeting Memory document from previous sessions in this series. Use it for context — reference prior decisions, note action item progress, and connect themes across meetings."

    user_content = ""
    if memory_context:
        user_content += f"MEETING MEMORY (context from previous meetings):\n{memory_context}\n\n---\n\n"
    user_content += f"TRANSCRIPT:\n{transcript}"

    output = await call_openrouter(
        model=model,
        system_prompt=system_prompt,
        user_content=user_content,
    )

    interpretation_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()

    if db:
        await db.execute(
            """INSERT INTO interpretations
            (id, session_id, source_type, source_name, lens_type, lens_prompt,
             model, output_markdown, is_primary, created_at)
            VALUES (?, ?, ?, ?, 'custom', ?, ?, ?, ?, ?)""",
            (interpretation_id, session_id, source_type, source_name,
             system_prompt, model, output, False, now),
        )
        await db.commit()

    return {
        "id": interpretation_id,
        "session_id": session_id,
        "source_type": source_type,
        "source_name": source_name,
        "lens_type": "custom",
        "lens_id": None,
        "lens_prompt": system_prompt,
        "model": model,
        "output_markdown": output,
        "output_structured": None,
        "is_primary": False,
        "created_at": now,
    }


async def interpret_with_socket(
    session_id: str,
    transcript: str,
    socket_data: dict,
    model: str | None,
    source_type: str = "user",
    source_name: str | None = None,
    db=None,
    memory_context: str | None = None,
) -> dict:
    """Run a socket interpretation with structured output."""
    model = model or settings.default_model
    source_name = source_name or settings.user_display_name

    prompt = f"""{socket_data['system_prompt']}

Respond in two sections separated by ---STRUCTURED---

SECTION 1: A brief markdown summary of your analysis.
SECTION 2: A JSON object conforming exactly to this schema:
{json.dumps(socket_data['output_schema'], indent=2)}
"""

    if memory_context:
        prompt += "\n\nYou have access to a Meeting Memory document from previous sessions in this series. Use it for context."

    user_content = ""
    if memory_context:
        user_content += f"MEETING MEMORY (context from previous meetings):\n{memory_context}\n\n---\n\n"
    user_content += f"TRANSCRIPT:\n{transcript}"

    output = await call_openrouter(
        model=model,
        system_prompt=prompt,
        user_content=user_content,
    )

    # Parse structured output
    markdown_part = output
    structured = None
    if "---STRUCTURED---" in output:
        parts = output.split("---STRUCTURED---", 1)
        markdown_part = parts[0].strip()
        json_str = parts[1].strip()
        # Strip markdown code fences if present
        if json_str.startswith("```"):
            json_str = json_str.split("\n", 1)[1] if "\n" in json_str else json_str[3:]
        if json_str.endswith("```"):
            json_str = json_str[:-3]
        json_str = json_str.strip()
        structured = json.loads(json_str)
        jsonschema.validate(structured, socket_data["output_schema"])

    interpretation_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()

    if db:
        await db.execute(
            """INSERT INTO interpretations
            (id, session_id, source_type, source_name, lens_type, lens_id,
             model, output_markdown, output_structured, is_primary, created_at)
            VALUES (?, ?, ?, ?, 'socket', ?, ?, ?, ?, ?, ?)""",
            (interpretation_id, session_id, source_type, source_name,
             socket_data["id"], model, markdown_part,
             json.dumps(structured) if structured else None,
             False, now),
        )
        await db.commit()

    return {
        "id": interpretation_id,
        "session_id": session_id,
        "source_type": source_type,
        "source_name": source_name,
        "lens_type": "socket",
        "lens_id": socket_data["id"],
        "model": model,
        "output_markdown": markdown_part,
        "output_structured": structured,
        "is_primary": False,
        "created_at": now,
    }
