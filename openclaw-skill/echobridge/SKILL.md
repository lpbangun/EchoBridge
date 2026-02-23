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

## Using results
1. Answer user's question with specific meeting context
2. Write durable insights to memory/YYYY-MM-DD.md
3. Update MEMORY.md with persistent facts discovered
