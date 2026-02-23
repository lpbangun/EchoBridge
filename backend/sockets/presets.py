"""Preset socket definitions."""

PRESET_SOCKETS = [
    {
        "id": "action_items",
        "name": "Action Items",
        "description": "Extracts every commitment, assigns owners, flags unassigned and missing deadlines",
        "category": "meeting",
        "system_prompt": """You are a meticulous meeting analyst focused on extracting every actionable commitment.

For each action item, identify:
- The specific task (be precise, not vague)
- Who committed to it (or mark as "unassigned" if unclear)
- Any deadline mentioned (or null if none)
- Current status (open by default)
- The context in which it was mentioned

Also flag items where:
- The task is vague and needs clarification
- No owner was explicitly assigned
- The deadline is unrealistic or missing""",
        "output_schema": {
            "type": "object",
            "properties": {
                "items": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "task": {"type": "string"},
                            "owner": {"type": "string"},
                            "due": {"type": ["string", "null"]},
                            "status": {"type": "string", "enum": ["open", "done", "blocked"]},
                            "context": {"type": "string"},
                        },
                        "required": ["task", "owner", "status"],
                    },
                }
            },
            "required": ["items"],
        },
    },
    {
        "id": "decisions",
        "name": "Decision Log",
        "description": "Maps every decision made, its rationale, alternatives considered, and who owns it",
        "category": "meeting",
        "system_prompt": """You are a decision analyst who meticulously tracks every decision made in a meeting.

For each decision, capture:
- The exact decision made
- The rationale behind it
- Alternatives that were considered and why they were rejected
- Who is responsible for executing the decision
- Whether the decision is reversible

Also track any decisions that were deferred for later discussion.""",
        "output_schema": {
            "type": "object",
            "properties": {
                "decisions": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "decision": {"type": "string"},
                            "rationale": {"type": "string"},
                            "alternatives_considered": {"type": "array", "items": {"type": "string"}},
                            "owner": {"type": "string"},
                            "reversible": {"type": "boolean"},
                        },
                        "required": ["decision", "rationale", "owner"],
                    },
                },
                "deferred": {"type": "array", "items": {"type": "string"}},
            },
            "required": ["decisions"],
        },
    },
    {
        "id": "devils_advocate",
        "name": "Devil's Advocate",
        "description": "Identifies weak arguments, unstated assumptions, logical gaps, and risks nobody mentioned",
        "category": "analysis",
        "system_prompt": """You are a critical thinker and devil's advocate. Your job is to find what's wrong, missing, or weak in the discussion.

Identify:
- Weak arguments: claims made without sufficient evidence or with logical flaws
- Unstated assumptions: things everyone seems to take for granted without examination
- Missing perspectives: viewpoints or stakeholders not represented in the discussion
- Risks not discussed: potential problems nobody mentioned

Be specific and constructive. For each weakness, explain why it matters and suggest what could strengthen the argument.""",
        "output_schema": {
            "type": "object",
            "properties": {
                "weak_arguments": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "claim": {"type": "string"},
                            "weakness": {"type": "string"},
                            "severity": {"type": "string", "enum": ["minor", "moderate", "critical"]},
                        },
                    },
                },
                "unstated_assumptions": {"type": "array", "items": {"type": "string"}},
                "missing_perspectives": {"type": "array", "items": {"type": "string"}},
                "risks_not_discussed": {"type": "array", "items": {"type": "string"}},
            },
            "required": ["weak_arguments", "unstated_assumptions"],
        },
    },
    {
        "id": "executive_brief",
        "name": "Executive Brief",
        "description": "Three-sentence summary + single key takeaway + recommended next action",
        "category": "meeting",
        "system_prompt": """You are an executive briefing specialist. Distill the entire meeting into:
1. A three-sentence summary (no more)
2. The single most important takeaway
3. One recommended next action

Be ruthlessly concise. Executives don't have time for details — give them the essence.""",
        "output_schema": {
            "type": "object",
            "properties": {
                "summary": {"type": "string", "description": "Three sentences maximum"},
                "key_takeaway": {"type": "string", "description": "One sentence"},
                "recommended_action": {"type": "string"},
            },
            "required": ["summary", "key_takeaway"],
        },
    },
    {
        "id": "concept_extractor",
        "name": "Concept Extractor",
        "description": "Pulls out concepts, frameworks, and terms with definitions and relationships",
        "category": "learning",
        "system_prompt": """You are a knowledge engineer who extracts and organizes conceptual knowledge.

For each concept, term, or framework mentioned:
- Provide a clear definition as used in context
- Identify its source (who mentioned it, or what it references)
- Map relationships to other concepts mentioned
- Note any frameworks or models discussed

Also identify open questions — concepts that were mentioned but not fully explained.""",
        "output_schema": {
            "type": "object",
            "properties": {
                "concepts": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "term": {"type": "string"},
                            "definition": {"type": "string"},
                            "source": {"type": "string"},
                            "related_to": {"type": "array", "items": {"type": "string"}},
                        },
                        "required": ["term", "definition"],
                    },
                },
                "frameworks": {"type": "array", "items": {"type": "string"}},
                "open_questions": {"type": "array", "items": {"type": "string"}},
            },
            "required": ["concepts"],
        },
    },
]
