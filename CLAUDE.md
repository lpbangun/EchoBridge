# CLAUDE.md — EchoBridge Development Instructions

## How to Work on This Project

You are building EchoBridge, a meeting bridge for humans and AI agents. Read `SPEC.md` for what to build. Read `DESIGN.md` for how the frontend should look. This file tells you how to work.

---

## Development Philosophy

**Spec-driven**: Every feature traces back to SPEC.md. If it's not in the spec, don't build it. If the spec is ambiguous, make a decision and document it in a code comment.

**Incremental delivery**: Each phase produces a working artifact. Never leave the app in a broken state. Every commit should pass all tests.

**Backend-first**: APIs work via curl before any frontend exists. Frontend consumes APIs, never contains business logic.

**One service, one file**: `whisper_service.py` knows nothing about OpenRouter. `ai_service.py` knows nothing about WebSockets. Services are isolated and testable.

---

## The Refinement Loop

Before presenting ANY completed feature or phase, execute this loop. Do not skip steps. Do not present partial work.

```
┌─────────────────────────────────────────────┐
│                BUILD                         │
│  Implement the feature per SPEC.md          │
└──────────────────┬──────────────────────────┘
                   │
┌──────────────────▼──────────────────────────┐
│               VERIFY                         │
│  1. Run all tests (pytest + vitest)          │
│  2. Run linter (ruff check + eslint)         │
│  3. Run type check (pyright + tsc)           │
│  4. Start the app and test manually          │
│     - Hit every endpoint you touched         │
│     - Check the GUI renders correctly        │
│     - Verify data flows end-to-end           │
└──────────────────┬──────────────────────────┘
                   │
┌──────────────────▼──────────────────────────┐
│             SPEC-CHECK                       │
│  Re-read the relevant SPEC.md section.       │
│  Ask yourself:                               │
│  - Does the output match the spec exactly?   │
│  - Did I miss any edge cases?                │
│  - Are error states handled?                 │
│  - Does it integrate with existing features? │
│  If ANY answer is "no" → go back to BUILD.   │
└──────────────────┬──────────────────────────┘
                   │
┌──────────────────▼──────────────────────────┐
│            DESIGN-CHECK (frontend only)      │
│  Re-read DESIGN.md.                          │
│  Ask yourself:                               │
│  - Does the spacing match the 8px grid?      │
│  - Is typography correct (weights, sizes)?   │
│  - Are colors from the palette only?         │
│  - Does it look Swiss-minimal, not generic?  │
│  - Is every element functional, not decorative│
│  If ANY answer is "no" → go back to BUILD.   │
└──────────────────┬──────────────────────────┘
                   │
┌──────────────────▼──────────────────────────┐
│              POLISH                          │
│  - Loading states for every async operation  │
│  - Empty states for every list               │
│  - Error messages that tell user what to do  │
│  - Transitions between states (no jumps)     │
│  - Console: no warnings, no errors           │
└──────────────────┬──────────────────────────┘
                   │
┌──────────────────▼──────────────────────────┐
│              PRESENT                         │
│  Only now show the result.                   │
│  State what was built, what was tested,      │
│  and any decisions made.                     │
└─────────────────────────────────────────────┘
```

### Loop count expectation

Most features should go through the loop **2-3 times** before presenting. If you get it right on the first pass, you probably didn't check hard enough. The spec-check step almost always catches something.

---

## Testing Standards

### Backend (pytest)

```
tests/
├── test_sessions.py              # Session CRUD
├── test_transcribe.py            # STT endpoints
├── test_interpret.py             # Lens interpretation
├── test_rooms.py                 # Meeting rooms
├── test_sockets.py               # Socket registry
├── test_agent_api.py             # Agent API endpoints
├── test_agent_meetings_e2e.py    # E2E: multi-agent meetings, wall, transcript access
├── test_export.py                # .md export
├── test_websocket.py             # Live stream
└── conftest.py                   # Fixtures (test DB, test client, sample audio)
```

Every endpoint gets:
- Happy path test
- Validation error test (bad input)
- Not-found test (missing resource)
- Auth test (agent API endpoints)

Run: `cd backend && pytest -v --tb=short`

### Frontend (vitest + testing-library)

```
src/__tests__/
├── Dashboard.test.jsx
├── NewSession.test.jsx
├── Recording.test.jsx
├── SessionView.test.jsx
├── RoomView.test.jsx
└── components/
    ├── AudioRecorder.test.jsx
    ├── ContextSelector.test.jsx
    └── SocketSelector.test.jsx
```

Every component gets:
- Renders without crashing
- User interaction works (clicks, inputs)
- Loading / empty / error states render

Run: `cd frontend && npx vitest run`

### End-to-end verification

After building any feature, manually verify the full flow:

1. **Backend only**: Use curl to hit every new/changed endpoint. Verify response shapes.
2. **Frontend + backend**: Start both servers. Walk through the user flow in a browser. Check Network tab for API errors.
3. **Cross-feature**: If the feature touches sessions/interpretations/rooms, verify existing features still work.

---

## Code Style

### Python (backend)

- Python 3.11+
- FastAPI with Pydantic models for all request/response bodies
- Async endpoints for I/O operations (STT, AI, file writes)
- Type hints on everything
- Docstrings on services and non-obvious functions
- Config-driven: paths, model names, and defaults come from `config.py`, never hardcoded
- Use `ruff` for linting and formatting

```python
# Good
async def interpret_session(
    session_id: str,
    lens: Lens,
    model: str,
    db: Database,
) -> Interpretation:
    """Run a lens against a session's transcript and store the interpretation."""
    session = await db.get_session(session_id)
    if not session or not session.transcript:
        raise HTTPException(404, "Session not found or has no transcript")
    ...

# Bad
def do_interpretation(sid, prompt, m):
    s = get(sid)
    ...
```

### JavaScript/React (frontend)

- React 18+ with hooks (no class components)
- Tailwind CSS only (no external CSS files, no CSS-in-JS)
- All Tailwind classes must conform to DESIGN.md spacing/color system
- Functional components with clear prop interfaces
- API calls in `lib/api.js`, never in components directly
- Use `fetch`, not axios

```jsx
// Good
function SessionCard({ session, onClick }) {
  return (
    <button
      onClick={() => onClick(session.id)}
      className="w-full text-left p-6 border border-neutral-200 hover:border-neutral-400 transition-colors"
    >
      <span className="text-xs font-medium tracking-widest uppercase text-neutral-500">
        {session.context}
      </span>
      <h3 className="mt-2 text-base font-medium text-neutral-900">
        {session.title}
      </h3>
    </button>
  );
}
```

---

## File Organization Rules

- `routers/` — HTTP endpoint definitions. Thin. Call services.
- `services/` — Business logic. Testable in isolation. No HTTP knowledge.
- `lenses/` — System prompts. One file per preset lens. Pure data.
- `models/` — Pydantic schemas. Shared between routers and services.
- `pages/` — Full-page React components. One per route.
- `components/` — Reusable React components. No page-level logic.
- `lib/` — Utilities, API client, WebSocket client.

---

## Git Practices

- Commit after each sub-feature within a phase (not after the whole phase)
- Commit messages: `feat: add session CRUD endpoints` / `fix: handle empty transcript in interpret` / `style: align spacing to 8px grid`
- Never commit broken code. If tests fail, fix before committing.

---

## Environment Setup

### Docker-first development (REQUIRED)

All development happens inside a Docker container. This is a security requirement — Claude Code operates with `--dangerously-skip-permissions` and must be sandboxed to prevent access to the host filesystem beyond the project directory.

```bash
# First time: build and start dev container
docker-compose -f docker-compose.dev.yml up -d --build

# Enter the container (ALL commands run here, not on host)
docker exec -it echobridge-echobridge-dev-1 bash

# Inside container:
# Backend auto-reloads on :8000
# Frontend HMR on :5173
# Data persists in /data volume
# Output persists in /output volume
```

### Rules for operating inside the container

1. **Never run commands on the host filesystem directly.** Always `docker exec` into the container first.
2. **Source code edits sync automatically** via the volume mount. Both uvicorn (--reload) and Vite (HMR) pick up changes instantly.
3. **Package installs happen inside the container.** Update `requirements.txt` / `package.json` so the Dockerfile stays reproducible.
4. **The container can only see `/app` (source), `/data` (database/audio), and `/output` (.md exports).** It cannot access the host's home directory, SSH keys, Obsidian vault, or other projects.
5. **To reset everything**: `docker-compose -f docker-compose.dev.yml down -v && docker-compose -f docker-compose.dev.yml up -d --build`

### Bare metal fallback (only if Docker is unavailable)

```bash
# Backend
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cp ../.env.example ../.env
uvicorn main:app --reload --port 8000

# Frontend
cd frontend
npm install
npm run dev
```

---

## Common Mistakes to Avoid

1. **Running commands on the host instead of inside the container.** All dev commands go through `docker exec`.
2. **Building UI before the API works.** Always verify endpoints with curl first.
3. **Hardcoding values.** Output paths, model names, API URLs — all from config.
4. **Skipping error states.** Every async operation can fail. Handle it in both backend (proper HTTP errors) and frontend (error UI).
5. **Over-building.** If SPEC.md says "simple," build simple. Don't add features.
6. **Ignoring the design system.** Read DESIGN.md before writing any CSS/Tailwind. The spacing, typography, and color are precise. Don't eyeball it.
7. **Not testing WebSocket flows.** WS bugs are subtle. Test with multiple clients.
8. **Presenting untested work.** Run the refinement loop. Every time.
9. **Installing packages without updating requirements files.** Container rebuilds must be reproducible.

---

## Phase Execution Order

Read SPEC.md Section 18 for full phase breakdown. Execute phases in order. Do not skip ahead. Each phase has a milestone — verify the milestone before moving to the next phase.

**CRITICAL: Phase 0 must be completed first. All subsequent work happens inside the Docker container.**

```
Phase 0: Dev Environment  → docker-compose up → working sandbox
Phase 1: The Pipeline     → curl upload audio → get .md file
Phase 2: The GUI          → full browser flow: record/upload → view notes
Phase 3: Meeting Rooms    → create room, join via code, shared transcript
Phase 4: Sockets          → preset + custom sockets, schema validation
Phase 5: Agent Interface  → API + WebSocket + OpenClaw skill
Phase 6: Production Deploy → docker-compose up (prod) + Railway
```
