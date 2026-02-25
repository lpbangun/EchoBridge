---
name: echobridge
description: >
  Access EchoBridge meeting transcripts and notes. Use when the user
  references past meetings or conversations, asks about decisions or
  action items, or when you need context from embodied interactions.
  Can subscribe to live meeting streams, request custom interpretations,
  participate in multi-agent meetings, and chat within session threads.
metadata:
  openclaw:
    requires:
      env: [ECHOBRIDGE_API_URL, ECHOBRIDGE_API_KEY]
    primaryEnv: ECHOBRIDGE_API_KEY
---

# EchoBridge — Meeting Bridge

EchoBridge captures in-person meetings, lectures, and conversations
that you can't otherwise access. It also hosts structured agent meetings
and session-scoped chat threads.

## When to use
- User mentions a past meeting, class, or conversation
- User asks "what did we decide" or "what were the action items"
- During heartbeat: check for new sessions
- When you need context from the physical world
- User wants you to join or run a multi-agent meeting
- User asks you to discuss or chat about a session

## API

Base: $ECHOBRIDGE_API_URL
Auth: Bearer $ECHOBRIDGE_API_KEY (header: `Authorization: Bearer $ECHOBRIDGE_API_KEY`)

### Connection
```
GET /api/v1/ping
  → { status, agent_name, version, endpoints[] }
  endpoints include: /api/v1/sessions, /api/v1/search, /api/v1/sockets,
    /api/v1/events, /api/v1/sessions/{id}/agent-analyze, ...

GET /api/v1/skill
  → This file (plain text)
```

### Sessions
```
GET /api/v1/sessions?context=...&series_id=...&limit=20&offset=0
  → [{ id, title, context, transcript, created_at, series_name, ... }]

GET /api/v1/sessions/{id}
  → { id, title, context, context_metadata, transcript, created_at, ... }

GET /api/v1/sessions/{id}/transcript
  → { session_id, transcript }

GET /api/v1/sessions/{id}/interpretations
  → [{ id, session_id, lens_id, output_text, output_structured, created_at, ... }]
```

### Interpret
```
POST /api/v1/sessions/{id}/interpret
  Body: { "system_prompt": "Extract all decisions made" }
  Body: { "system_prompt": "...", "model": "anthropic/claude-sonnet-4-20250514" }
  Body: { "lens_id": "startup_meeting" }
  → { id, session_id, output_text, output_structured, created_at, ... }

POST /api/v1/sessions/{id}/interpret/socket/{socket_id}
  Body: {} or { "model": "..." }
  → { id, session_id, output_text, output_structured, created_at, ... }
```

### Search
```
GET /api/v1/search?q=pricing+discussion
  → { query, results[], total }
```

### Sockets
```
GET /api/v1/sockets
  → [{ id, name, description, system_prompt, output_schema, is_preset, ... }]

Preset IDs: action_items, decisions, devils_advocate, executive_brief, concept_extractor
```

### Events (Agent Notifications)
```
GET /api/v1/events?since=<ISO timestamp>&context=<filter>&limit=50
  → { events: [{ id, event_type, session_id, context, title, interpretations_count, created_at }], count }

POST /api/v1/sessions/{id}/agent-analyze
  Body: { "socket_ids": ["action_items", "devils_advocate"] }  (optional — defaults to auto_sockets config)
  → { session_id, interpretation_ids[], event_id, count }
```

### Series (recurring meetings)
```
GET /api/v1/series
  → [{ id, name, description, session_count, created_at, updated_at }]

GET /api/v1/series/{id}
  → { id, name, description, memory_document, session_count, ... }

GET /api/v1/series/{id}/memory
  → { series_id, series_name, memory_document, updated_at, session_count }
```

### Rooms
```
GET /api/v1/rooms/{code}
  → { id, code, session_id, host_name, mode, participants[], ... }
```

### Chat Conversations
```
GET /api/v1/chat/conversations?session_id=...
  → [{ id, session_id, title, created_at, messages[] }]

GET /api/v1/chat/conversations/{id}
  → { id, session_id, title, created_at, messages[] }

POST /api/v1/chat/conversations/{id}/messages
  Body: { "content": "What did we agree on pricing?" }
  → { id, conversation_id, role, content, source, created_at }
```

### Agent Meetings
```
POST /api/v1/meetings
  Body: {
    "topic": "Q3 roadmap priorities",
    "agents": [
      { "name": "Strategist", "type": "internal", "persona_prompt": "..." },
      { "name": "MyAgent", "type": "external" }
    ],
    "task_description": "Decide top 3 priorities for Q3",
    "cooldown_seconds": 3.0,
    "max_rounds": 20,
    "title": "Q3 Roadmap Meeting"
  }
  → { room_id, code, session_id, status, host_name, topic, agents[], created_at }

GET /api/v1/meetings/{code}/context
  → { topic, task_description, directives[], conversation[], state }
  state: { status, current_round, max_rounds, message_count, agents[], directive_count }

POST /api/v1/meetings/{code}/respond
  Body: { "agent_name": "MyAgent", "response": "I think we should..." }
  → { status: "response_submitted", agent_name }
```

### Live Streams (WebSocket)
```
WS /api/stream/session/{session_id}
  Send: { type: "transcript_chunk", text, ... }
  Recv: { type: "transcript_chunk", text, ... }

WS /api/stream/room/{code}?token=$ECHOBRIDGE_API_KEY
  Send: { type: "identify", name, participant_type }
  Send: { type: "transcript_chunk", text, ... }
  Recv: { type: "participant_joined", name, participant_type }
  Recv: { type: "participant_left", name, participant_type }
  Recv: { type: "transcript_chunk", text, ... }
  Close 4001: unauthorized (invalid token)
  Close 4003: kicked by host

WS /api/stream/meeting/{code}
  Send: { type: "identify", name, participant_type }
  Recv: { type: "meeting_message", sender_name, sender_type, content_type, content, ... }
  Recv: { type: "turn_request", agent_name, topic, conversation[], directives[] }
  Recv: { type: "meeting_ended", session_id, rounds, message_count }
```

### Live Room Monitoring

Subscribe to a room's live transcript to watch meetings in real-time.

1. Get the room code (from meeting invite or `GET /api/v1/rooms/{code}`)
2. Connect: `WS $ECHOBRIDGE_API_URL/api/stream/room/{code}?token=$ECHOBRIDGE_API_KEY`
3. Send identify: `{"type": "identify", "name": "YourAgent", "participant_type": "agent"}`
4. Receive transcript chunks: `{"type": "transcript_chunk", "text": "...", "is_final": true}`
5. Receive participant events: `participant_joined`, `participant_left`
6. If kicked by host: connection closed with code 4003

Notes:
- `is_final=false` is interim recognition; `is_final=true` is committed
- Accumulate final chunks to build running transcript
- To get transcript so far: `GET /api/v1/sessions/{id}/transcript` (session_id from room info)
- The host can disconnect you at any time (code 4003)

## Agent Meeting Protocol

External agents participate in meetings through a polling + respond flow:

1. **Create the meeting** — `POST /api/v1/meetings` with at least one `"type": "external"` agent whose `name` matches your agent name.

2. **The host starts the meeting** — A human opens the meeting room in the EchoBridge UI and clicks Start. The orchestrator begins cycling through agents.

3. **Poll for your turn** — Repeatedly `GET /api/v1/meetings/{code}/context`. Check `state.status`:
   - `"waiting"` — meeting hasn't started yet, keep polling
   - `"active"` / `"processing"` — meeting is running
   - `"closed"` — meeting is over, stop polling

4. **Detect your turn** — When the meeting is active, you'll also receive a `turn_request` via WebSocket (if connected) or see it in the conversation context. Check if the latest conversation entry is addressed to you or if the orchestrator is waiting on your name.

5. **Respond within 30 seconds** — `POST /api/v1/meetings/{code}/respond` with your `agent_name` and `response`. If you miss the 30-second window, the orchestrator marks you as timed out and moves on.

6. **Repeat** until you receive `state.status == "closed"` or a `meeting_ended` WebSocket message.

**Alternatively**, connect via WebSocket (`WS /api/stream/meeting/{code}`) to receive `turn_request` events in real-time instead of polling.

### Agent types in meetings
- `"internal"` — EchoBridge runs this agent using its own AI. You provide a `persona_prompt` and optional `socket_id` / `model`.
- `"external"` — Your agent. You poll for turns and respond via the API.

## Exec examples

```bash
# Test connection
exec curl -s -H "Authorization: Bearer $ECHOBRIDGE_API_KEY" \
  "$ECHOBRIDGE_API_URL/api/v1/ping"

# Search meetings
exec curl -s -H "Authorization: Bearer $ECHOBRIDGE_API_KEY" \
  "$ECHOBRIDGE_API_URL/api/v1/search?q=pricing"

# Get latest session
exec curl -s -H "Authorization: Bearer $ECHOBRIDGE_API_KEY" \
  "$ECHOBRIDGE_API_URL/api/v1/sessions?limit=1"

# Get transcript
exec curl -s -H "Authorization: Bearer $ECHOBRIDGE_API_KEY" \
  "$ECHOBRIDGE_API_URL/api/v1/sessions/{id}/transcript"

# Get all notes for a session
exec curl -s -H "Authorization: Bearer $ECHOBRIDGE_API_KEY" \
  "$ECHOBRIDGE_API_URL/api/v1/sessions/{id}/interpretations"

# Custom interpretation
exec curl -s -X POST -H "Authorization: Bearer $ECHOBRIDGE_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"system_prompt": "Extract all decisions made"}' \
  "$ECHOBRIDGE_API_URL/api/v1/sessions/{id}/interpret"

# Extract action items via socket
exec curl -s -X POST -H "Authorization: Bearer $ECHOBRIDGE_API_KEY" \
  "$ECHOBRIDGE_API_URL/api/v1/sessions/{id}/interpret/socket/action_items"

# List available analysis sockets
exec curl -s -H "Authorization: Bearer $ECHOBRIDGE_API_KEY" \
  "$ECHOBRIDGE_API_URL/api/v1/sockets"

# Get room info (find session_id for transcript access)
exec curl -s -H "Authorization: Bearer $ECHOBRIDGE_API_KEY" \
  "$ECHOBRIDGE_API_URL/api/v1/rooms/{code}"

# Create an agent meeting
exec curl -s -X POST -H "Authorization: Bearer $ECHOBRIDGE_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "topic": "Sprint retrospective",
    "agents": [
      {"name": "Facilitator", "type": "internal", "persona_prompt": "You facilitate retrospectives."},
      {"name": "MyAgent", "type": "external"}
    ],
    "task_description": "Run a sprint retro covering what went well, what didn't, and action items."
  }' \
  "$ECHOBRIDGE_API_URL/api/v1/meetings"

# Poll meeting context (use the code from the create response)
exec curl -s -H "Authorization: Bearer $ECHOBRIDGE_API_KEY" \
  "$ECHOBRIDGE_API_URL/api/v1/meetings/{code}/context"

# Respond to a turn
exec curl -s -X POST -H "Authorization: Bearer $ECHOBRIDGE_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"agent_name": "MyAgent", "response": "I think the deployment pipeline was a highlight this sprint."}' \
  "$ECHOBRIDGE_API_URL/api/v1/meetings/{code}/respond"

# List chat conversations for a session
exec curl -s -H "Authorization: Bearer $ECHOBRIDGE_API_KEY" \
  "$ECHOBRIDGE_API_URL/api/v1/chat/conversations?session_id={id}"

# Send a message in a chat conversation
exec curl -s -X POST -H "Authorization: Bearer $ECHOBRIDGE_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"content": "What were the key takeaways?"}' \
  "$ECHOBRIDGE_API_URL/api/v1/chat/conversations/{conv_id}/messages"

# Get series memory
exec curl -s -H "Authorization: Bearer $ECHOBRIDGE_API_KEY" \
  "$ECHOBRIDGE_API_URL/api/v1/series/{id}/memory"

# Poll for new completed sessions (events since a timestamp)
exec curl -s -H "Authorization: Bearer $ECHOBRIDGE_API_KEY" \
  "$ECHOBRIDGE_API_URL/api/v1/events?since=2026-01-01T00:00:00Z"

# Run agent analysis on a session (uses configured auto-sockets)
exec curl -s -X POST -H "Authorization: Bearer $ECHOBRIDGE_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"socket_ids": ["action_items", "devils_advocate"]}' \
  "$ECHOBRIDGE_API_URL/api/v1/sessions/{id}/agent-analyze"
```

## Using results
1. Answer user's question with specific meeting context
2. Write durable insights to memory/YYYY-MM-DD.md
3. Update MEMORY.md with persistent facts discovered

## Event-driven workflow

Agents can poll for completed sessions instead of checking the session list:

1. Store your last-seen timestamp
2. Poll: `GET /api/v1/events?since=<timestamp>`
3. For each `session.complete` event:
   - Fetch transcript: `GET /api/v1/sessions/{id}/transcript`
   - Run analysis: `POST /api/v1/sessions/{id}/interpret/socket/action_items`
   - Or trigger all configured sockets: `POST /api/v1/sessions/{id}/agent-analyze`
4. Update your timestamp to the latest event's `created_at`
