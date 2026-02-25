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

### Available sockets
GET /api/v1/sockets

Preset sockets: action_items, decisions, devils_advocate, executive_brief, concept_extractor

### Subscribe to live session
WS /api/v1/stream/room/{code}

### Get session details
GET /api/v1/sessions/{id}

### Session interpretations (notes/analyses)
GET /api/v1/sessions/{id}/interpretations

### Series (recurring meetings)
GET /api/v1/series
GET /api/v1/series/{id}/memory

### Connection test
GET /api/v1/ping

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
```

## Using results
1. Answer user's question with specific meeting context
2. Write durable insights to memory/YYYY-MM-DD.md
3. Update MEMORY.md with persistent facts discovered
