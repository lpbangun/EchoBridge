# EchoBridge — The Meeting Bridge for Humans and Agents

## SPEC.md v1.0 | Definitive Implementation Spec

---

## 1. What EchoBridge Is

EchoBridge bridges the physical world — conversations, meetings, lectures — and the digital world where AI agents operate. It captures audio, transcribes it, and makes the transcript available to multiple interpreters: you (as structured notes) and any number of AI agents (each with their own lens).

**The gap**: Your AI agent can read your email, Slack, calendar, code, and documents. It cannot hear your in-person conversations, phone calls, lectures, or brainstorms. EchoBridge is the ears.

**Core abstraction**: One transcript, many interpretations.

```
Audio → Transcript → Your notes (preset lens)
                   → Agent A interpretation (its own prompt)
                   → Agent B interpretation (socket: action_items)
                   → Agent N interpretation (any lens)
```

**Three modes of use:**
1. **Solo**: Record your own meetings/lectures → get `.md` notes
2. **Room**: Share a live transcript with other people + their agents
3. **Agent-direct**: Agents query transcripts and request interpretations via API

---

## 2. Core Concepts

### Session
A single recording event. Has audio, transcript, and one or more interpretations.

### Room
A shared session that others can join via a room code. One host records. Everyone gets the same transcript. Each participant (human or agent) creates their own interpretation.

### Interpretation
An AI-generated analysis of a transcript through a specific lens. Your meeting notes are one interpretation. An agent's analysis is another. Each interpretation is independent.

### Lens
The system prompt that shapes an interpretation. Two types:
- **Preset lens**: Ships with EchoBridge. Context-aware (class_lecture, startup_meeting, etc.)
- **Custom lens**: Any prompt submitted by a user or agent

### Socket
A formalized lens with a guaranteed output schema. Agents plug into sockets to get structured, parseable output. Sockets are the typed API for meeting intelligence.

```
Lens    = "here's a prompt, give me markdown"
Socket  = "here's a prompt + output schema, give me validated JSON + markdown"
```

---

## 3. Architecture

```
┌──────────────────────────────────────────────────────────┐
│                     React + Tailwind                      │
│              Browser Web Speech API (live STT)            │
└────────────────────────┬─────────────────────────────────┘
                         │ REST + WebSocket
┌────────────────────────▼─────────────────────────────────┐
│                    Python FastAPI                          │
│                                                           │
│  ┌──────────┐  ┌──────────────┐  ┌─────────────────────┐│
│  │ STT      │  │ Interpret    │  │ Room Manager        ││
│  │ browser  │  │ Engine       │  │ (create, join,      ││
│  │ whisper  │  │ lenses +     │  │  broadcast)         ││
│  └──────────┘  │ sockets      │  └─────────────────────┘│
│                └──────────────┘                           │
│  ┌──────────┐  ┌──────────────┐  ┌─────────────────────┐│
│  │ SQLite   │  │ .md Export   │  │ WebSocket Stream    ││
│  │ (data)   │  │              │  │ (live transcript    ││
│  └──────────┘  └──────────────┘  │  broadcast)         ││
│                                   └─────────────────────┘│
│  ┌──────────────────────────────────────────────────────┐│
│  │ Agent API  /api/v1/  (sessions, search, interpret,   ││
│  │            stream, sockets)                           ││
│  └──────────────────────────────────────────────────────┘│
└──────────────────────────────────────────────────────────┘
         │                 │                    │
    ┌────▼────┐    ┌───────▼──────┐    ┌───────▼────────┐
    │ SQLite  │    │ Output Dir   │    │ Agents         │
    │ .db     │    │ .md files    │    │ (OpenClaw etc) │
    └─────────┘    └───────┬──────┘    │ via API / WS   │
                           │           └────────────────┘
                    ┌──────▼──────┐
                    │ OpenClaw    │
                    │ extraPaths  │
                    │ (native .md │
                    │  indexing)  │
                    └─────────────┘
```

### Key decisions:

| Decision | Choice | Why |
|---|---|---|
| Database | SQLite (single file) | Zero infra. Works self-hosted and dockerized. |
| STT live | Browser Web Speech API | Zero config, free, works in hosted version. |
| STT upload | faster-whisper (local) | Free, private, fast on CPU. |
| AI | OpenRouter (BYO key) | Model flexibility. User owns their key. |
| Agent integration | REST API + WebSocket + file-based | Three paths for different deployment contexts. |
| Primary data store | SQLite | The source of truth for sessions, interpretations, rooms. |
| .md files | Export (canonical for OpenClaw) | Written on session complete. OpenClaw indexes these natively via `extraPaths`. |
| Rooms | Room code join (no accounts for guests) | Simplest multi-user model. |
| Sockets | Prompt + output JSON schema | Agents get structured, parseable output. |

---

## 4. Data Model

### SQLite Schema

```sql
-- Sessions (one per recording)
CREATE TABLE sessions (
    id TEXT PRIMARY KEY,
    title TEXT,
    context TEXT NOT NULL,              -- class_lecture | startup_meeting | research_discussion | working_session | talk_seminar
    context_metadata JSON DEFAULT '{}', -- course, project, etc.
    room_id TEXT REFERENCES rooms(id),  -- NULL if solo session
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    duration_seconds INTEGER,
    status TEXT DEFAULT 'created',      -- created | recording | transcribing | processing | complete | error
    transcript TEXT,
    stt_provider TEXT,
    audio_path TEXT,
    host_name TEXT,                     -- display name of person who recorded
    error_message TEXT
);

-- Interpretations (N per session)
CREATE TABLE interpretations (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    source_type TEXT NOT NULL,          -- "user" | "agent" | "room_participant"
    source_name TEXT,                   -- display name or agent name
    lens_type TEXT NOT NULL,            -- "preset" | "custom" | "socket"
    lens_id TEXT,                       -- preset lens ID or socket ID
    lens_prompt TEXT,                   -- stored for custom lenses
    model TEXT NOT NULL,
    output_markdown TEXT NOT NULL,      -- human-readable output
    output_structured JSON,            -- populated only for socket interpretations
    is_primary BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Rooms (shared sessions)
CREATE TABLE rooms (
    id TEXT PRIMARY KEY,               -- UUID
    code TEXT UNIQUE NOT NULL,         -- short join code: "PROB-0219"
    session_id TEXT REFERENCES sessions(id),
    host_name TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    status TEXT DEFAULT 'waiting',     -- waiting | recording | processing | closed
    settings JSON DEFAULT '{}'         -- available sockets, model override, etc.
);

-- Room participants (who joined)
CREATE TABLE room_participants (
    id TEXT PRIMARY KEY,
    room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    name TEXT NOT NULL,                -- display name
    participant_type TEXT NOT NULL,    -- "human" | "agent"
    connected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    agent_name TEXT                    -- if type=agent
);

-- Sockets (interpretation templates with output schemas)
CREATE TABLE sockets (
    id TEXT PRIMARY KEY,               -- "action_items_tracker"
    name TEXT NOT NULL,                -- "Action Items Tracker"
    description TEXT NOT NULL,
    category TEXT NOT NULL,            -- "meeting" | "learning" | "analysis" | "meta"
    system_prompt TEXT NOT NULL,
    output_schema JSON NOT NULL,       -- JSON Schema the output must conform to
    is_preset BOOLEAN DEFAULT FALSE,   -- ships with app vs user-created
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Agent API keys
CREATE TABLE api_keys (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    key_hash TEXT NOT NULL UNIQUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_used_at TIMESTAMP
);

-- Full-text search
CREATE VIRTUAL TABLE sessions_fts USING fts5(
    title, transcript,
    content='sessions', content_rowid='rowid'
);

CREATE VIRTUAL TABLE interpretations_fts USING fts5(
    output_markdown,
    content='interpretations', content_rowid='rowid'
);
```

---

## 5. Session Types (Preset Lenses)

| Context | Lens ID | Optimizes for |
|---|---|---|
| 📚 Class Lecture | `class_lecture` | Concepts, frameworks, quotes, open questions, wikilinks |
| 🚀 Startup Meeting | `startup_meeting` | Decisions, action items (owner/due), blockers, next steps |
| 🔬 Research Discussion | `research_discussion` | Claims, methodology, contradictions, citations |
| 💡 Working Session | `working_session` | Ideas, convergence, divergence, next steps |
| 🎤 Talk / Seminar | `talk_seminar` | Core argument, evidence, counterarguments |

Each preset lens lives in `backend/lenses/{lens_id}.py` and contains:
- `SYSTEM_PROMPT`: the full prompt template with `{context_metadata}` placeholder
- `FRONTMATTER_FIELDS`: which YAML fields this lens generates
- `DESCRIPTION`: human-readable description

### Prompt structure (all lenses share this pattern):

```python
SYSTEM_PROMPT = """[Role definition]

CONTEXT: {context_metadata}

Produce your output in this exact format:

First, a YAML frontmatter block between --- markers containing:
[structured fields specific to this lens]

Then the markdown body:
[sections specific to this lens]

RULES:
[precision and completeness rules]
"""
```

Full prompt text for each lens is implemented during Phase 1. See v3 spec conversation history for starter prompts for `startup_meeting` and `class_lecture`.

---

## 6. Sockets

Sockets are formalized lenses with guaranteed output schemas. They enable agents to get structured, parseable JSON rather than freeform markdown.

### Preset sockets (ship with app):

```python
PRESET_SOCKETS = [
    {
        "id": "action_items",
        "name": "Action Items",
        "description": "Extracts every commitment, assigns owners, flags unassigned and missing deadlines",
        "category": "meeting",
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
                            "context": {"type": "string"}
                        },
                        "required": ["task", "owner", "status"]
                    }
                }
            },
            "required": ["items"]
        }
    },
    {
        "id": "decisions",
        "name": "Decision Log",
        "description": "Maps every decision made, its rationale, alternatives considered, and who owns it",
        "category": "meeting",
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
                            "reversible": {"type": "boolean"}
                        },
                        "required": ["decision", "rationale", "owner"]
                    }
                },
                "deferred": {"type": "array", "items": {"type": "string"}}
            },
            "required": ["decisions"]
        }
    },
    {
        "id": "devils_advocate",
        "name": "Devil's Advocate",
        "description": "Identifies weak arguments, unstated assumptions, logical gaps, and risks nobody mentioned",
        "category": "analysis",
        "output_schema": {
            "type": "object",
            "properties": {
                "weak_arguments": {"type": "array", "items": {"type": "object", "properties": {"claim": {"type": "string"}, "weakness": {"type": "string"}, "severity": {"type": "string", "enum": ["minor", "moderate", "critical"]}}}},
                "unstated_assumptions": {"type": "array", "items": {"type": "string"}},
                "missing_perspectives": {"type": "array", "items": {"type": "string"}},
                "risks_not_discussed": {"type": "array", "items": {"type": "string"}}
            },
            "required": ["weak_arguments", "unstated_assumptions"]
        }
    },
    {
        "id": "executive_brief",
        "name": "Executive Brief",
        "description": "Three-sentence summary + single key takeaway + recommended next action",
        "category": "meeting",
        "output_schema": {
            "type": "object",
            "properties": {
                "summary": {"type": "string", "description": "Three sentences maximum"},
                "key_takeaway": {"type": "string", "description": "One sentence"},
                "recommended_action": {"type": "string"}
            },
            "required": ["summary", "key_takeaway"]
        }
    },
    {
        "id": "concept_extractor",
        "name": "Concept Extractor",
        "description": "Pulls out concepts, frameworks, and terms with definitions and relationships",
        "category": "learning",
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
                            "related_to": {"type": "array", "items": {"type": "string"}}
                        },
                        "required": ["term", "definition"]
                    }
                },
                "frameworks": {"type": "array", "items": {"type": "string"}},
                "open_questions": {"type": "array", "items": {"type": "string"}}
            },
            "required": ["concepts"]
        }
    }
]
```

### Socket interpretation flow:

```python
async def interpret_with_socket(session_id: str, socket_id: str, model: str):
    socket = get_socket(socket_id)
    session = get_session(session_id)

    prompt = f"""{socket.system_prompt}

TRANSCRIPT:
{session.transcript}

Respond in two sections separated by ---STRUCTURED---

SECTION 1: A brief markdown summary of your analysis.
SECTION 2: A JSON object conforming exactly to this schema:
{json.dumps(socket.output_schema, indent=2)}
"""

    response = await call_openrouter(model, prompt)
    markdown_part, json_part = response.split("---STRUCTURED---")

    # Validate JSON against schema
    structured = json.loads(json_part.strip())
    jsonschema.validate(structured, socket.output_schema)

    return Interpretation(
        output_markdown=markdown_part.strip(),
        output_structured=structured,
        lens_type="socket",
        lens_id=socket_id
    )
```

---

## 7. Meeting Rooms

### Creating a room:

Host opens EchoBridge → "New Session" → fills in context → clicks "Create Room" instead of "Record" or "Upload." Gets a 4-8 character room code.

```
POST /api/rooms
{
    "context": "startup_meeting",
    "title": "Probixio — Weekly Sync",
    "context_metadata": {"project": "Probixio"},
    "host_name": "Logani"
}

→ {
    "room_id": "...",
    "code": "PROB-0219",
    "session_id": "...",
    "status": "waiting"
}
```

### Joining a room:

Participants (human or agent) join with the room code. No account needed.

**Human**: Opens EchoBridge → "Join Room" → enters code → sees live transcript + socket selector.

```
POST /api/rooms/join
{
    "code": "PROB-0219",
    "name": "Sarah",
    "type": "human"
}
```

**Agent**: Connects via WebSocket with room code.

```
WS /api/v1/stream/room/{code}
Authorization: Bearer scribe_sk_...
```

### Room lifecycle:

```
waiting → recording → processing → closed
```

1. **Waiting**: Host created room, waiting to start recording. Participants can join.
2. **Recording**: Host is recording. Live transcript streams to all participants.
3. **Processing**: Recording stopped. Primary interpretation is being generated.
4. **Closed**: Complete. All participants can request their own interpretations.

### Who records:

Only the host records. One microphone, one transcript. This avoids audio sync, echo cancellation, and conflicting STT results.

### Room code format:

Generated from context + date: `{PREFIX}-{MMDD}` or random 6-char alphanumeric if no context.

```python
def generate_room_code(context: str, title: str) -> str:
    prefix = title[:4].upper().replace(" ", "")
    date = datetime.now().strftime("%m%d")
    return f"{prefix}-{date}"  # e.g., "PROB-0219"
    # Collision check: append random char if taken
```

---

## 8. WebSocket Live Stream

### For solo sessions:

Agents connect to stream real-time transcript chunks during recording.

```
WS /api/v1/stream/session/{session_id}
Authorization: Bearer scribe_sk_...
```

### For rooms:

All participants (human and agent) receive the live stream.

```
WS /api/v1/stream/room/{room_code}
Authorization: Bearer scribe_sk_...  (for agents)
```

Human participants connect via the frontend WebSocket client (no API key needed — session-based).

### Message protocol:

**Server → Client:**

```json
{"type": "transcript_chunk", "text": "...", "is_final": true, "timestamp_ms": 45200}
{"type": "status", "status": "recording"}
{"type": "participant_joined", "name": "Sarah", "type": "human"}
{"type": "participant_joined", "name": "openclaw-main", "type": "agent"}
{"type": "session_complete", "session_id": "...", "duration_seconds": 2700}
```

**Client → Server:**

```json
{"type": "identify", "name": "openclaw-main", "participant_type": "agent"}
```

### Backend implementation:

```python
# Room/session WebSocket manager
class StreamManager:
    def __init__(self):
        self.rooms: dict[str, set[WebSocket]] = {}

    async def subscribe(self, room_key: str, ws: WebSocket):
        if room_key not in self.rooms:
            self.rooms[room_key] = set()
        self.rooms[room_key].add(ws)

    async def broadcast(self, room_key: str, message: dict):
        if room_key in self.rooms:
            dead = set()
            for ws in self.rooms[room_key]:
                try:
                    await ws.send_json(message)
                except:
                    dead.add(ws)
            self.rooms[room_key] -= dead

    async def unsubscribe(self, room_key: str, ws: WebSocket):
        if room_key in self.rooms:
            self.rooms[room_key].discard(ws)
```

---

## 9. STT Configuration

### Browser Web Speech API (live recording):

```javascript
// Frontend: speechRecognition.js
const recognition = new (window.SpeechRecognition || window.webkitSpeechRecognition)();
recognition.continuous = true;
recognition.interimResults = true;
recognition.lang = 'en-US';

recognition.onresult = (event) => {
    for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        sendToBackend({
            type: 'transcript_chunk',
            text: result[0].transcript,
            is_final: result.isFinal,
            timestamp_ms: Date.now() - recordingStartTime
        });
    }
};
```

Frontend sends chunks to backend via WebSocket. Backend stores + broadcasts to room/session subscribers.

### faster-whisper (file upload):

```python
from faster_whisper import WhisperModel

model = WhisperModel(
    settings.whisper_model,      # "small" default
    device=settings.whisper_device,
    compute_type=settings.whisper_compute_type,
)

async def transcribe_file(audio_path: str) -> TranscriptResult:
    segments, info = model.transcribe(
        audio_path,
        language="en",
        beam_size=5,
        vad_filter=True,
        vad_parameters={"min_silence_duration_ms": 500},
    )
    text = " ".join([seg.text for seg in segments])
    return TranscriptResult(text=text, duration_seconds=info.duration)
```

Accepted formats: `.mp3`, `.wav`, `.m4a`, `.webm`, `.ogg`

---

## 10. OpenRouter Configuration

```python
OPENROUTER_BASE = "https://openrouter.ai/api/v1/chat/completions"

async def call_openrouter(
    model: str,
    system_prompt: str,
    user_content: str,
    api_key: str,
    temperature: float = 0.3,
    max_tokens: int = 4096,
) -> str:
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
```

### Models:

| Role | Model | ID | Cost/1M tokens |
|---|---|---|---|
| Primary | Claude Sonnet 4 | `anthropic/claude-sonnet-4-20250514` | ~$3 in / $15 out |
| Fast | Gemini 2.5 Flash | `google/gemini-2.5-flash-preview` | ~$0.15 / $0.60 |
| Budget | DeepSeek V3 | `deepseek/deepseek-chat-v3-0324` | ~$0.27 / $1.10 |

---

## 11. .md Export Format

Every session auto-exports a `.md` file to the configured output directory. This file serves both human reading (Obsidian) and OpenClaw indexing (via `extraPaths`).

```markdown
---
id: "a1b2c3d4"
date: 2026-02-19T14:30:00
type: startup_meeting
duration: 45min
project: "Probixio"
room: "PROB-0219"
participants: [Logani, Sarah, David]
tags: [probixio, pricing, investor-readiness]
model: anthropic/claude-sonnet-4
source: echobridge

topics:
  - investor pitch preparation
  - usage-based pricing
entities:
  people: [Sarah, David]
  projects: [Probixio]
action_items:
  - task: "Revise pricing page"
    owner: David
    due: "2026-02-22"
decisions:
  - "Switch to usage-based pricing for enterprise"
---

# Probixio — Weekly Sync

## Summary
Met with Sarah and David to finalize pricing strategy...

## Decisions Made
1. **Usage-based pricing for enterprise** — ...

## Action Items
- [ ] **Revise pricing page** — Owner: David — Due: Feb 22

## Key Discussion Points
...

## Blockers & Risks
...

<details>
<summary>Full Transcript</summary>
[raw transcript]
</details>
```

File naming: `{YYYY-MM-DD}-{slug}.md`

---

## 12. API Endpoints

### Session Management:
```
POST   /api/sessions                     Create session
GET    /api/sessions                     List (search, filter by context, paginate)
GET    /api/sessions/{id}                Get session + primary interpretation
PATCH  /api/sessions/{id}                Update title, metadata
DELETE /api/sessions/{id}                Delete session + audio + interpretations
```

### Transcription:
```
POST   /api/sessions/{id}/audio          Upload audio → run STT
POST   /api/sessions/{id}/transcript     Submit browser STT transcript
```

### Interpretation:
```
POST   /api/sessions/{id}/interpret      Run lens or socket → create interpretation
GET    /api/sessions/{id}/interpretations List all interpretations
```

### Rooms:
```
POST   /api/rooms                        Create room → get code
POST   /api/rooms/join                   Join room with code
GET    /api/rooms/{code}                 Get room status + participants
POST   /api/rooms/{code}/start           Host starts recording
POST   /api/rooms/{code}/stop            Host stops recording
```

### Export:
```
GET    /api/sessions/{id}/export/md      Download .md
POST   /api/sessions/{id}/export/save    Save .md to output dir
```

### Sockets:
```
GET    /api/sockets                      List all sockets (preset + custom)
GET    /api/sockets/{id}                 Get socket details + schema
POST   /api/sockets                      Create custom socket
```

### Search + Settings:
```
GET    /api/search?q=...                 FTS5 across sessions + interpretations
GET    /api/settings                     Get settings
PUT    /api/settings                     Update settings
POST   /api/settings/api-keys            Generate agent API key
GET    /api/lenses                       List preset lenses
```

### Agent API (/api/v1/):
```
# Sessions
GET    /api/v1/sessions                  List sessions (filter, paginate)
GET    /api/v1/sessions/{id}             Get session + transcript
GET    /api/v1/sessions/{id}/transcript  Raw transcript only

# Interpret
POST   /api/v1/sessions/{id}/interpret   Custom lens or socket interpretation
GET    /api/v1/sessions/{id}/interpretations  All interpretations

# Sockets
GET    /api/v1/sockets                   List available sockets
POST   /api/v1/sessions/{id}/interpret/socket/{socket_id}  Socket interpretation

# Rooms
GET    /api/v1/rooms/{code}              Room status
WS     /api/v1/stream/room/{code}        Live transcript stream

# Search
GET    /api/v1/search?q=...              FTS5 search

# Auth
Authorization: Bearer scribe_sk_...     (all /api/v1/ endpoints)
```

---

## 13. OpenClaw Integration

### Path A — File-based (self-hosted):

```json
// openclaw.json
{
  "agents": {
    "defaults": {
      "memorySearch": {
        "extraPaths": ["~/obsidian-vault/echobridge/"]
      }
    }
  }
}
```

Done. OpenClaw indexes `.md` files natively.

### Path B — Skill-based:

Ship `openclaw-skill/echobridge/SKILL.md` in the repo:

```markdown
---
name: echobridge
description: >
  Access EchoBridge meeting transcripts and notes. Use when the user
  references past meetings or conversations, asks about decisions or
  action items, or when you need context from embodied interactions.
  Can subscribe to live meeting streams and request custom interpretations.
metadata:
  openclaw:
    requires:
      env: [ECHOBRIDGE_API_URL, ECHOBRIDGE_API_KEY]
    primaryEnv: ECHOBRIDGE_API_KEY
---

# EchoBridge — Meeting Bridge

EchoBridge captures in-person meetings, lectures, and conversations
that you can't otherwise access.

## When to use
- User mentions a past meeting, class, or conversation
- User asks "what did we decide" or "what were the action items"
- During heartbeat: check for new sessions
- When you need context from the physical world

## API

Base: $ECHOBRIDGE_API_URL
Auth: Bearer $ECHOBRIDGE_API_KEY

### Search
GET /api/v1/search?q=probixio+pricing

### Recent sessions
GET /api/v1/sessions?context=startup_meeting&limit=10

### Get transcript
GET /api/v1/sessions/{id}/transcript

### Interpret with custom prompt
POST /api/v1/sessions/{id}/interpret
Body: {"system_prompt": "...", "model": "..."}

### Interpret with socket
POST /api/v1/sessions/{id}/interpret/socket/action_items

### Subscribe to live session
WS /api/v1/stream/room/{code}

## Using results
1. Answer user's question with specific meeting context
2. Write durable insights to memory/YYYY-MM-DD.md
3. Update MEMORY.md with persistent facts discovered
```

---

## 14. GUI Screens

Read DESIGN.md for visual style. All screens follow Swiss minimalist principles.

### Dashboard
```
┌────────────────────────────────────────────────┐
│  ECHOBRIDGE                       [⚙] [+ New] │
│                                                 │
│  ┌─────────────────────────────────────────┐   │
│  │ 🔍 Search sessions...                  │   │
│  └─────────────────────────────────────────┘   │
│                                                 │
│  All  📚  🚀  🔬  💡  🎤                      │
│                                                 │
│  ┌─────────────────────────────────────────┐   │
│  │ STARTUP MEETING                         │   │
│  │ Probixio — Weekly Sync                  │   │
│  │ Today, 2:30 PM · 45 min · Room PROB-0219│   │
│  └─────────────────────────────────────────┘   │
│                                                 │
│  ┌─────────────────────────────────────────┐   │
│  │ CLASS LECTURE                            │   │
│  │ Learning Transfer — HGSE T550           │   │
│  │ Today, 10:00 AM · 75 min               │   │
│  └─────────────────────────────────────────┘   │
│                                                 │
└────────────────────────────────────────────────┘
```

### New Session
```
┌────────────────────────────────────────────────┐
│  ← Back                          NEW SESSION   │
│                                                 │
│  SESSION TYPE                                   │
│                                                 │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐       │
│  │ CLASS    │ │ STARTUP  │ │ RESEARCH │       │
│  │ LECTURE  │ │ MEETING  │ │ DISCUSS. │       │
│  └──────────┘ └──────────┘ └──────────┘       │
│  ┌──────────┐ ┌──────────┐                     │
│  │ WORKING  │ │ TALK /   │                     │
│  │ SESSION  │ │ SEMINAR  │                     │
│  └──────────┘ └──────────┘                     │
│                                                 │
│  Title                                          │
│  ┌─────────────────────────────────────────┐   │
│  │                                         │   │
│  └─────────────────────────────────────────┘   │
│                                                 │
│  Context                                        │
│  ┌─────────────────────────────────────────┐   │
│  │ Course / Project / Topic                │   │
│  └─────────────────────────────────────────┘   │
│                                                 │
│  Model                                          │
│  Claude Sonnet 4                           ▾   │
│                                                 │
│  ┌────────────┐ ┌───────────┐ ┌───────────┐   │
│  │  Record    │ │  Upload   │ │  Create   │   │
│  │  Live      │ │  File     │ │  Room     │   │
│  └────────────┘ └───────────┘ └───────────┘   │
│                                                 │
└────────────────────────────────────────────────┘
```

### Room View (participant)
```
┌────────────────────────────────────────────────┐
│  ROOM PROB-0219                    ● RECORDING  │
│  Probixio — Weekly Sync             01:23:45   │
│                                                 │
│  ┌──────────────────────────────────────────┐  │
│  │                                          │  │
│  │  Live Transcript                         │  │
│  │                                          │  │
│  │  ...and I think the pricing model should │  │
│  │  reflect actual usage rather than flat   │  │
│  │  rate. Sarah mentioned that enterprise   │  │
│  │  customers specifically asked for this...│  │
│  │                                          │  │
│  └──────────────────────────────────────────┘  │
│                                                 │
│  PARTICIPANTS                                   │
│  Logani (host) · Sarah · David                 │
│  🤖 openclaw-main · 🤖 research-agent          │
│                                                 │
│  YOUR INTERPRETATION                            │
│  Socket: Action Items                      ▾   │
│                                                 │
│  [Will generate when session ends]              │
│                                                 │
└────────────────────────────────────────────────┘
```

### Session View
```
┌────────────────────────────────────────────────┐
│  ← Back     Probixio — Weekly Sync    [✎] [📥]│
│                                                 │
│  Summary   Transcript   Interpretations (4)    │
│  ─────────                                      │
│                                                 │
│  STARTUP MEETING · Feb 19 · 45 min             │
│  Room PROB-0219 · 3 people · 2 agents          │
│                                                 │
│  ## Summary                                     │
│  Met with Sarah and David to finalize           │
│  pricing strategy. The major decision was...    │
│                                                 │
│  ## Decisions Made                              │
│  1. Switch to usage-based pricing...            │
│                                                 │
│  ## Action Items                                │
│  ☐ Revise pricing page — David — Feb 22        │
│  ☐ Email YC partners — self — Feb 25           │
│                                                 │
│  ────────────────────────────────────────       │
│  probixio · pricing · investor-readiness        │
│  📥 Saved to ~/obsidian/echobridge/             │
└────────────────────────────────────────────────┘
```

### Interpretations Tab (within Session View)
```
│  Summary   Transcript   Interpretations (4)    │
│                                     ─────────── │
│                                                 │
│  ┌─────────────────────────────────────────┐   │
│  │ YOU — Startup Meeting lens              │   │
│  │ Primary · Claude Sonnet 4               │   │
│  │ 3 decisions · 5 action items            │   │
│  └─────────────────────────────────────────┘   │
│                                                 │
│  ┌─────────────────────────────────────────┐   │
│  │ 🤖 openclaw-main — Custom lens          │   │
│  │ "User positions and emotional signals"  │   │
│  └─────────────────────────────────────────┘   │
│                                                 │
│  ┌─────────────────────────────────────────┐   │
│  │ Sarah — Action Items socket             │   │
│  │ 5 items · 2 unassigned                  │   │
│  └─────────────────────────────────────────┘   │
│                                                 │
│  ┌─────────────────────────────────────────┐   │
│  │ 🤖 research-agent — Devil's Advocate     │   │
│  │ 3 weak arguments · 2 missing perspectives│   │
│  └─────────────────────────────────────────┘   │
│                                                 │
```

### Settings
```
┌────────────────────────────────────────────────┐
│  ← Back                            SETTINGS    │
│                                                 │
│  API KEYS                                       │
│  OpenRouter                                     │
│  ┌─────────────────────────────────────────┐   │
│  │ sk-or-•••••••••••••••••••               │   │
│  └─────────────────────────────────────────┘   │
│                                                 │
│  TRANSCRIPTION                                  │
│  Live: Browser Speech API                      │
│  Upload: faster-whisper                        │
│  Whisper model: small                      ▾   │
│                                                 │
│  AI MODEL                                       │
│  Default: Claude Sonnet 4                  ▾   │
│                                                 │
│  EXPORT                                         │
│  Output directory                               │
│  ┌─────────────────────────────────────────┐   │
│  │ ~/obsidian-vault/echobridge/            │   │
│  └─────────────────────────────────────────┘   │
│  Auto-export after processing: ✓               │
│  Include transcript in .md: ✓                  │
│                                                 │
│  AGENT API                                      │
│  Key: scribe_sk_•••••••••     [↻] [Copy]      │
│  Endpoint: http://localhost:8000               │
│                                                 │
│  DISPLAY                                        │
│  Your name: Logani                             │
│                                                 │
└────────────────────────────────────────────────┘
```

### Join Room (simple overlay or page)
```
┌────────────────────────────────────────────────┐
│  ← Back                          JOIN ROOM     │
│                                                 │
│  Enter room code                                │
│  ┌─────────────────────────────────────────┐   │
│  │ PROB-0219                               │   │
│  └─────────────────────────────────────────┘   │
│                                                 │
│  Your name                                      │
│  ┌─────────────────────────────────────────┐   │
│  │ Sarah                                   │   │
│  └─────────────────────────────────────────┘   │
│                                                 │
│                                 [ Join Room ]   │
│                                                 │
└────────────────────────────────────────────────┘
```

---

## 15. Directory Structure

```
echobridge/
├── SPEC.md
├── CLAUDE.md
├── DESIGN.md
├── README.md
├── Dockerfile
├── docker-compose.yml
├── .env.example
│
├── backend/
│   ├── main.py
│   ├── config.py
│   ├── database.py
│   │
│   ├── routers/
│   │   ├── sessions.py
│   │   ├── transcribe.py
│   │   ├── interpret.py
│   │   ├── rooms.py
│   │   ├── sockets.py
│   │   ├── export.py
│   │   ├── stream.py
│   │   ├── agent.py
│   │   └── settings.py
│   │
│   ├── services/
│   │   ├── stt/
│   │   │   ├── base.py
│   │   │   ├── browser.py
│   │   │   └── whisper.py
│   │   ├── ai_service.py
│   │   ├── interpret_service.py
│   │   ├── room_service.py
│   │   ├── stream_manager.py
│   │   ├── markdown_service.py
│   │   └── search_service.py
│   │
│   ├── lenses/
│   │   ├── base.py
│   │   ├── class_lecture.py
│   │   ├── startup_meeting.py
│   │   ├── research_discussion.py
│   │   ├── working_session.py
│   │   └── talk_seminar.py
│   │
│   ├── sockets/
│   │   └── presets.py
│   │
│   ├── models/
│   │   └── schemas.py
│   │
│   ├── tests/
│   │   ├── conftest.py
│   │   ├── test_sessions.py
│   │   ├── test_interpret.py
│   │   ├── test_rooms.py
│   │   ├── test_sockets.py
│   │   ├── test_agent_api.py
│   │   └── test_websocket.py
│   │
│   └── requirements.txt
│
├── frontend/
│   ├── src/
│   │   ├── App.jsx
│   │   ├── main.jsx
│   │   ├── pages/
│   │   │   ├── Dashboard.jsx
│   │   │   ├── NewSession.jsx
│   │   │   ├── Recording.jsx
│   │   │   ├── SessionView.jsx
│   │   │   ├── RoomView.jsx
│   │   │   ├── JoinRoom.jsx
│   │   │   └── SettingsPage.jsx
│   │   ├── components/
│   │   │   ├── AudioRecorder.jsx
│   │   │   ├── FileUploader.jsx
│   │   │   ├── ContextSelector.jsx
│   │   │   ├── SocketSelector.jsx
│   │   │   ├── SessionCard.jsx
│   │   │   ├── MarkdownPreview.jsx
│   │   │   ├── InterpretationCard.jsx
│   │   │   ├── LiveTranscript.jsx
│   │   │   ├── ParticipantList.jsx
│   │   │   └── SearchBar.jsx
│   │   ├── lib/
│   │   │   ├── api.js
│   │   │   ├── websocket.js
│   │   │   ├── speechRecognition.js
│   │   │   └── utils.js
│   │   └── __tests__/
│   │       └── ...
│   ├── package.json
│   ├── vite.config.js
│   └── tailwind.config.js
│
├── openclaw-skill/
│   └── echobridge/
│       └── SKILL.md
│
└── output/
    └── .gitkeep
```

---

## 16. Environment

### `.env.example`:

```env
# Required
OPENROUTER_API_KEY=sk-or-...

# Display
USER_DISPLAY_NAME=Logani

# Export
OUTPUT_DIR=~/obsidian-vault/echobridge
AUTO_EXPORT=true
INCLUDE_TRANSCRIPT_IN_MD=true

# STT
WHISPER_MODEL=small
WHISPER_DEVICE=cpu
WHISPER_COMPUTE_TYPE=int8

# AI
DEFAULT_MODEL=anthropic/claude-sonnet-4-20250514

# Server
HOST=0.0.0.0
PORT=8000
DATABASE_PATH=./data/echobridge.db
AUDIO_DIR=./data/audio

# Agent API
ECHOBRIDGE_AGENT_API_KEY=
```

---

## 17. Infrastructure & Deployment

### Development: Docker sandbox

All development happens inside a Docker container. Claude Code (or any dev tool) operates inside the container, never directly on the host machine. Source code is volume-mounted so edits persist, but the container cannot access anything outside the project directory.

**Why**: Using `--dangerously-skip-permissions` with Claude Code gives it unrestricted shell access. The Docker container limits the blast radius to the project directory and container volumes. It cannot touch the host's Obsidian vault, SSH keys, API keys outside `.env`, or other projects.

**`Dockerfile.dev`**:
```dockerfile
FROM python:3.11-slim

RUN apt-get update && apt-get install -y \
    ffmpeg \
    curl \
    && rm -rf /var/lib/apt/lists/*

RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs

WORKDIR /app

COPY backend/requirements.txt /app/backend/
RUN pip install -r /app/backend/requirements.txt

COPY frontend/package.json frontend/package-lock.json /app/frontend/
RUN cd /app/frontend && npm install

EXPOSE 8000 5173
```

**`docker-compose.dev.yml`**:
```yaml
services:
  echobridge-dev:
    build:
      context: .
      dockerfile: Dockerfile.dev
    volumes:
      - .:/app
      - dev-data:/data
      - dev-output:/output
      - /app/frontend/node_modules
      - /app/backend/__pycache__
    ports:
      - "8000:8000"
      - "5173:5173"
    environment:
      - DATABASE_PATH=/data/echobridge.db
      - AUDIO_DIR=/data/audio
      - OUTPUT_DIR=/output
    env_file:
      - .env
    command: >
      bash -c "
        cd /app/backend && uvicorn main:app --reload --host 0.0.0.0 --port 8000 &
        cd /app/frontend && npm run dev -- --host 0.0.0.0 --port 5173 &
        wait
      "

volumes:
  dev-data:
  dev-output:
```

**Claude Code workflow**:
```bash
# Start dev environment
docker-compose -f docker-compose.dev.yml up -d

# All commands run inside container
docker exec -it echobridge-echobridge-dev-1 bash

# Source code edits sync via volume mount
# Hot reload active on both backend and frontend
```

### Production: Railway

Railway is the hosted deployment platform. Chosen because:

| Requirement | Railway support |
|---|---|
| Long-running Python process | Yes — Docker containers, not serverless |
| WebSocket connections | Full support, no timeout limits |
| Persistent file storage | Volumes mounted to container filesystem |
| faster-whisper (CPU-intensive) | Configurable RAM/CPU per service |
| SQLite on disk | Works on persistent volume |
| Custom Dockerfile | Deploys directly from repo Dockerfile |
| Cost | ~$5-20/month depending on compute |

**Why not Vercel**: No long-running processes, no WebSocket support, no persistent filesystem, serverless cold starts kill STT performance.

**Why not Supabase for database**: SQLite is the right tool for a single-user/small-room app. No connection pooling, no network hop, portable file. Supabase solves multi-tenant Postgres needs we don't have.

**Production Dockerfile** (`Dockerfile`):
```dockerfile
FROM python:3.11-slim AS backend
RUN apt-get update && apt-get install -y ffmpeg && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY backend/requirements.txt .
RUN pip install -r requirements.txt
COPY backend/ ./backend/

FROM node:20-slim AS frontend
WORKDIR /app
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM backend AS production
COPY --from=frontend /app/dist /app/static
EXPOSE 8000
CMD ["uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

**Railway deployment**: Connect repo → Railway detects Dockerfile → deploys. Add persistent volume at `/data`. Set environment variables via Railway dashboard.

### Self-hosted: docker-compose

For users running on their own machine (primary integration path for OpenClaw `extraPaths`):

**`docker-compose.yml`**:
```yaml
services:
  echobridge:
    build: .
    ports:
      - "8000:8000"
    volumes:
      - ./data:/data
      - ${OUTPUT_DIR:-./output}:/output
    env_file:
      - .env
    environment:
      - DATABASE_PATH=/data/echobridge.db
      - AUDIO_DIR=/data/audio
      - OUTPUT_DIR=/output
    restart: unless-stopped
```

User mounts their Obsidian vault directory as `OUTPUT_DIR` in `.env` → `.md` files land directly in their vault → OpenClaw indexes via `extraPaths`.

---

## 18. Implementation Phases

### Phase 1: The Pipeline
**Goal**: Audio in → notes out, via command line.

1. FastAPI scaffold + config (`config.py`, Pydantic settings)
2. SQLite schema + database setup (`database.py`)
3. Session CRUD router + service
4. faster-whisper STT service (transcribe uploaded file)
5. OpenRouter AI service (`call_openrouter`)
6. All 5 preset lens prompts with `{context_metadata}` templating
7. Interpretation creation (lens → AI → store)
8. `.md` export with structured YAML frontmatter
9. FTS5 indexing on sessions + interpretations
10. Tests: session CRUD, interpretation, export

**Milestone**: `curl -F "audio=@meeting.mp3" localhost:8000/api/sessions/{id}/audio` → then `curl localhost:8000/api/sessions/{id}/export/md` → get a `.md` file.

### Phase 2: The GUI
**Goal**: Full browser flow for solo use.

1. Vite + React + Tailwind scaffold (follow DESIGN.md exactly)
2. Dashboard page: session list, search bar, context filter chips
3. New Session page: context selector, title, metadata, model selector
4. File upload flow: pick file → upload → progress → processing → view
5. Browser Web Speech API recording component (AudioRecorder)
6. Recording page: timer, audio level, pause/stop, status transitions
7. Session View: markdown preview, transcript tab, interpretations tab
8. Settings page: API keys, output dir, model config
9. Tests: component rendering, user flows

**Milestone**: Open browser → record a meeting → view notes. Upload a file → view notes.

### Phase 3: Meeting Rooms
**Goal**: Shared sessions with room codes.

1. Room CRUD: create room → code generation → join with code
2. Room participants table + join/leave logic
3. WebSocket stream manager (rooms as broadcast channels)
4. Frontend → backend transcript chunk relay (browser STT → WS → broadcast)
5. Room View page: live transcript, participant list, socket selector
6. Join Room page: enter code + name
7. "Create Room" option on New Session page
8. Room lifecycle: waiting → recording → processing → closed
9. Per-participant interpretation after session ends
10. Tests: room creation, joining, WebSocket messaging

**Milestone**: Create a room on one browser tab. Join on another. Record. Both see live transcript. Both get independent interpretations.

### Phase 4: Sockets
**Goal**: Typed interpretation templates with JSON schemas.

1. Socket model + CRUD endpoints
2. 5 preset sockets with output schemas (action_items, decisions, devils_advocate, executive_brief, concept_extractor)
3. Socket interpretation flow: prompt + transcript → markdown + validated JSON
4. Socket selector component in Room View + Session View
5. Structured output display in interpretation cards
6. Custom socket creation endpoint
7. Tests: socket creation, schema validation, interpretation

**Milestone**: After a meeting, select "Devil's Advocate" socket → get structured critique with JSON output agents can parse.

### Phase 5: Agent Interface
**Goal**: External agents can fully interact with EchoBridge.

1. API key generation + bearer auth middleware
2. All `/api/v1/` endpoints (sessions, search, interpret, sockets)
3. Agent WebSocket stream subscription with auth
4. Agent identification in rooms (show agent name in participant list)
5. OpenClaw `SKILL.md` finalized + tested
6. `extraPaths` documentation for file-based integration
7. Tests: agent auth, API endpoints, WebSocket with auth

**Milestone**: OpenClaw queries a past meeting, interprets with custom prompt, writes insights to memory.

### Phase 0: Development Environment (FIRST)
**Goal**: Sandboxed dev environment before any code is written.

1. Create `Dockerfile.dev` and `docker-compose.dev.yml` per Section 17
2. Create `.env.example` with all required variables
3. Verify: `docker-compose -f docker-compose.dev.yml up` starts clean container
4. Verify: volume mount works (edit file on host → visible in container)
5. Verify: ports 8000 and 5173 are accessible from host browser

**Milestone**: `docker exec -it echobridge-dev bash` drops you into a working Python + Node environment with the source code mounted.

**All subsequent phases execute inside this container.**

### Phase 6: Production Deployment
**Goal**: One-command deployment for self-hosted and Railway.

1. Production `Dockerfile` (multi-stage: frontend build → FastAPI serve)
2. Production `docker-compose.yml` with persistent volumes + OUTPUT_DIR mount
3. Health check endpoint (`GET /api/health`)
4. Railway deployment config (`railway.json` or Procfile if needed)
5. README with quickstart for self-hosted (`docker-compose up`)
6. README with Railway deploy instructions
7. OpenClaw integration guide (extraPaths + skill setup)

**Milestone**: `docker-compose up` → everything works. Railway deploy from repo → app accessible at public URL.

---

## 19. What This Is Not

- Not a video conferencing tool (it captures audio, not video)
- Not a calendar integration (it doesn't auto-join meetings)
- Not a team collaboration platform (rooms are ephemeral, not persistent)
- Not a knowledge graph (it writes `.md` files, not graph nodes)
- Not an agent runtime (OpenClaw is one; EchoBridge feeds it)
- Not an Obsidian plugin (it writes files Obsidian reads)

EchoBridge does one thing: it turns physical-world audio into structured data that both humans and agents can consume, independently and through their own lens. Everything else is someone else's job.
