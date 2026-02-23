# EchoBridge

The meeting bridge for humans and AI agents. Captures audio, transcribes it, and makes the transcript available to you (as structured notes) and any number of AI agents (each with their own lens).

## Self-Hosted Quickstart

```bash
# 1. Clone and configure
git clone https://github.com/lpbangun/EchoBridge.git
cd EchoBridge
cp .env.example .env
# Edit .env — set OPENROUTER_API_KEY at minimum

# 2. Start
docker-compose up -d

# 3. Open
# http://localhost:8000
```

That's it. The app serves the frontend and API on port 8000. Data persists in `./data/`, exports go to `./output/` (or wherever you set `OUTPUT_DIR`).

## Railway Deploy

1. Fork or push this repo to GitHub
2. Connect the repo to [Railway](https://railway.app)
3. Railway detects the `Dockerfile` and builds automatically
4. Add a persistent volume mounted at `/data`
5. Set environment variables in the Railway dashboard:
   - `OPENROUTER_API_KEY` (required)
   - `DATABASE_PATH=/data/echobridge.db`
   - `AUDIO_DIR=/data/audio`
   - `OUTPUT_DIR=/data/output`
   - `ECHOBRIDGE_AGENT_API_KEY` (for agent API access)
6. Deploy

## OpenClaw Integration

### Path A — File-based (self-hosted)

Point OpenClaw at your EchoBridge export directory:

```json
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

Set `OUTPUT_DIR` in `.env` to your Obsidian vault path. EchoBridge exports `.md` files there, and OpenClaw indexes them natively.

### Path B — Skill-based

Copy the skill into your OpenClaw skills directory:

```bash
cp -r openclaw-skill/echobridge ~/.openclaw/skills/
```

Set the required environment variables:
- `ECHOBRIDGE_API_URL` — your EchoBridge instance URL (e.g., `http://localhost:8000`)
- `ECHOBRIDGE_API_KEY` — the agent API key from your `.env`

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `OPENROUTER_API_KEY` | Yes | — | OpenRouter API key for AI interpretations |
| `USER_DISPLAY_NAME` | No | `User` | Your display name |
| `OUTPUT_DIR` | No | `./output` | Where `.md` exports are written |
| `AUTO_EXPORT` | No | `true` | Auto-export interpretations as `.md` |
| `INCLUDE_TRANSCRIPT_IN_MD` | No | `true` | Include transcript in exported `.md` |
| `WHISPER_MODEL` | No | `small` | faster-whisper model size |
| `WHISPER_DEVICE` | No | `cpu` | `cpu` or `cuda` |
| `WHISPER_COMPUTE_TYPE` | No | `int8` | Whisper compute type |
| `DEFAULT_MODEL` | No | `anthropic/claude-sonnet-4-20250514` | Default AI model via OpenRouter |
| `DATABASE_PATH` | No | `./data/echobridge.db` | SQLite database path |
| `AUDIO_DIR` | No | `./data/audio` | Audio file storage path |
| `ECHOBRIDGE_AGENT_API_KEY` | No | — | API key for agent authentication |

## Development

```bash
# Start dev environment (hot-reload on both backend and frontend)
docker-compose -f docker-compose.dev.yml up -d

# Enter the container
docker exec -it echobridge-echobridge-dev-1 bash

# Run tests
cd /app/backend && pytest -v --tb=short
cd /app/frontend && npx vitest run
```

See [CLAUDE.md](CLAUDE.md) for full development instructions.
