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
