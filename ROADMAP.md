# EchoBridge Roadmap

Ideas and future features — not currently in scope, but worth revisiting.

---

## CLI Tool

**Status**: Idea — not planned for any phase

**Concept**: A narrow, pipeline-focused CLI wrapping the existing REST API. Not a CLI version of the whole app — only the file-in, notes-out workflow.

**Example usage**:
```bash
echobridge transcribe meeting.wav --lens action-items -o notes.md
echobridge transcribe *.wav --lens decisions --output-dir ~/obsidian-vault/echobridge
```

**Use cases**:
- Batch processing multiple recordings
- Scripting/cron automation (e.g., weekly recap of recordings)
- Piping into other tools
- Quick one-off transcribe+interpret without opening a browser

**Out of scope for CLI**: Live recording, meeting rooms, real-time WebSocket streams, session browsing — these stay in the web UI.

**Implementation notes**:
- Thin wrapper (~200-300 lines) using `typer` or `click` over existing API endpoints
- Overlaps significantly with the Agent API — same backend, different interface
- Low effort, low maintenance burden since no business logic is duplicated

**Build when**: There's a real usage pattern of repeatedly running the pipeline from the terminal, or another tool needs to invoke EchoBridge without HTTP boilerplate.

---

## Sync Layer

**Status**: Idea — not planned for any phase

**Concept**: Database replication so a single EchoBridge identity works across devices without requiring cloud hosting. Today, cross-device access is solved by deploying to Railway/VPS — this would offer an alternative for users who want local-first storage with multi-device reach.

**Candidate approaches**:
- **Litestream** — streams SQLite WAL pages to S3-compatible storage, provides read replicas
- **cr-sqlite** — CRDT-based SQLite extension allowing merge of divergent databases
- **Simple export/import** — JSON dump from one instance, import into another (lowest effort, manual)

**Build when**: Users want cross-device access but don't want to run a Railway/VPS instance.

---

## User Accounts / Multi-tenancy

**Status**: Out of scope — not planned

**Why not**: EchoBridge's entire data model assumes one owner. Every query reads from a single SQLite database with no `user_id` filtering. Adding accounts would require rewriting every database query, adding authentication middleware, and introducing a session/token system — a fundamental architectural change, not a feature addition.

The self-hosted model already solves user isolation: each person runs their own instance. Two people, two instances, two databases. This is simpler, more private, and eliminates an entire class of authorization bugs.

**Build when**: There is a clear organizational deployment use case — e.g., a company wants one shared EchoBridge instance with SSO and per-user data isolation. Until then, self-hosting provides better isolation than any multi-tenant system could.
