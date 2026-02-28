"""Meeting Orchestrator — manages agent turn-taking in agent meeting rooms."""

import asyncio
import json
import logging
import re
import uuid
from datetime import datetime, timezone

from config import settings
from services.ai_service import call_ai
from services.stream_manager import stream_manager

logger = logging.getLogger(__name__)


# Global registry of active meetings
_active_meetings: dict[str, "MeetingOrchestrator"] = {}


def get_orchestrator(room_code: str) -> "MeetingOrchestrator | None":
    return _active_meetings.get(room_code)


class MeetingOrchestrator:
    """Async engine that drives agent conversations in a meeting room."""

    def __init__(
        self,
        room_id: str,
        room_code: str,
        session_id: str,
        topic: str,
        task_description: str,
        agents: list[dict],
        cooldown_seconds: float = 3.0,
        max_rounds: int = 20,
        host_name: str = "Host",
    ):
        self.room_id = room_id
        self.room_code = room_code
        self.session_id = session_id
        self.topic = topic
        self.task_description = task_description
        self.agents = agents  # list of {name, type, socket_id, persona_prompt, model}
        self.cooldown_seconds = cooldown_seconds
        self.max_rounds = max_rounds
        self.host_name = host_name

        self.messages: list[dict] = []
        self.directives: list[str] = []
        self.human_message_queue: list[dict] = []
        self.sequence = 0
        self.current_round = 0
        self.status = "waiting"  # waiting, active, paused, processing, closed
        self._task: asyncio.Task | None = None
        self._pause_event = asyncio.Event()
        self._pause_event.set()  # not paused initially
        self._stop_requested = False

        # External agent turn management
        self._external_responses: dict[str, asyncio.Future] = {}
        self._ws_key = f"meeting:{room_code}"

        # Socket persona cache (loaded at start)
        self._socket_cache: dict[str, dict] = {}

        # Series memory + recent notes (loaded at start)
        self._memory_context: str = ""
        self._recent_notes: list[dict] = []

    async def _load_socket_personas(self, db):
        """Pre-load socket data for agents that reference sockets."""
        for agent in self.agents:
            sid = agent.get("socket_id")
            if sid and sid not in self._socket_cache:
                cursor = await db.execute("SELECT * FROM sockets WHERE id = ?", (sid,))
                row = await cursor.fetchone()
                if row:
                    self._socket_cache[sid] = dict(row)

    async def _fetch_recent_notes(self, db) -> list[dict]:
        """Fetch manual_notes from the last 3 sessions in this session's series."""
        try:
            cursor = await db.execute(
                "SELECT series_id FROM sessions WHERE id = ?", (self.session_id,)
            )
            row = await cursor.fetchone()
            if not row or not row["series_id"]:
                return []
            cursor = await db.execute(
                """SELECT title, manual_notes FROM sessions
                WHERE series_id = ? AND manual_notes != '' AND id != ?
                ORDER BY created_at DESC LIMIT 3""",
                (row["series_id"], self.session_id),
            )
            rows = await cursor.fetchall()
            return [{"title": r["title"] or "Untitled", "notes": r["manual_notes"]} for r in rows]
        except Exception:
            return []

    async def _load_meeting_context(self, db):
        """Load series memory and recent human notes for context injection."""
        try:
            from services.memory_service import get_memory_context_for_session
            memory = await get_memory_context_for_session(self.session_id, db)
            if memory:
                self._memory_context = memory[:3000]
        except Exception:
            logger.exception("Failed to load memory context for meeting %s", self.room_code)

        self._recent_notes = await self._fetch_recent_notes(db)

    def _build_system_prompt(self, agent: dict) -> str:
        """Build the system prompt for an internal agent's turn."""
        parts = []

        # Base identity
        parts.append(f"You are {agent['name']}, participating in a structured discussion.")
        parts.append(f"Topic: {self.topic}")
        if self.task_description:
            parts.append(f"Task: {self.task_description}")

        # Socket persona
        sid = agent.get("socket_id")
        if sid and sid in self._socket_cache:
            socket = self._socket_cache[sid]
            parts.append(f"\nYour persona (from socket '{socket.get('name', sid)}'):")
            parts.append(socket.get("system_prompt", ""))

        # Custom persona prompt
        if agent.get("persona_prompt"):
            parts.append(f"\nAdditional instructions: {agent['persona_prompt']}")

        # Series memory context
        if self._memory_context:
            parts.append("\n--- SERIES MEMORY (prior meeting context) ---")
            parts.append(self._memory_context)

        # Recent human notes from prior sessions
        if self._recent_notes:
            parts.append("\n--- RECENT HUMAN NOTES ---")
            for note in self._recent_notes:
                parts.append(f"From '{note['title']}': {note['notes'][:500]}")

        # Active directives
        if self.directives:
            parts.append("\n--- ACTIVE DIRECTIVES FROM HOST ---")
            for i, d in enumerate(self.directives, 1):
                parts.append(f"{i}. {d}")

        # Instructions
        parts.append("\n--- INSTRUCTIONS ---")
        parts.append("Respond naturally as your character. Keep responses concise (2-4 sentences).")
        parts.append("If you have nothing meaningful to add, respond with exactly: [PASS]")
        parts.append("Do not repeat what others have said. Build on the conversation.")
        parts.append("To share structured content (summaries, code, research), prefix with [ARTIFACT] — it will render as markdown.")

        return "\n".join(parts)

    def _build_conversation_context(self) -> str:
        """Build the conversation history for an agent's turn."""
        lines = []
        # Include last 30 messages for context window management
        recent = self.messages[-30:]
        for msg in recent:
            prefix = f"[{msg['sender_name']}]"
            if msg["message_type"] == "directive":
                prefix = f"[DIRECTIVE from {msg['sender_name']}]"
            elif msg["message_type"] == "status":
                prefix = "[SYSTEM]"
            lines.append(f"{prefix}: {msg['content']}")
        return "\n".join(lines)

    def _parse_mentions(self, text: str) -> list[str]:
        """Find @AgentName patterns in text matching known agent names."""
        agent_names = {a["name"] for a in self.agents}
        mentioned = []
        for match in re.finditer(r"@([\w-]+)", text):
            name = match.group(1)
            if name in agent_names:
                mentioned.append(name)
        return mentioned

    def _build_agent_order(self, mentioned: list[str]) -> list[dict]:
        """Reorder agents so mentioned ones go first, preserving relative order."""
        if not mentioned:
            return list(self.agents)
        mentioned_set = set(mentioned)
        prioritized = [a for a in self.agents if a["name"] in mentioned_set]
        rest = [a for a in self.agents if a["name"] not in mentioned_set]
        return prioritized + rest

    async def _add_message(
        self,
        sender_name: str,
        sender_type: str,
        message_type: str,
        content: str,
        db=None,
        content_type: str = "text/plain",
    ) -> dict:
        """Add a message to the meeting log and broadcast it."""
        self.sequence += 1
        msg_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc).isoformat()

        msg = {
            "id": msg_id,
            "room_id": self.room_id,
            "sender_name": sender_name,
            "sender_type": sender_type,
            "message_type": message_type,
            "content": content,
            "content_type": content_type,
            "sequence_number": self.sequence,
            "created_at": now,
        }
        self.messages.append(msg)

        # Persist to DB
        if db:
            await db.execute(
                """INSERT INTO meeting_messages
                (id, room_id, sender_name, sender_type, message_type, content, content_type, sequence_number, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (msg_id, self.room_id, sender_name, sender_type, message_type, content, content_type, self.sequence, now),
            )
            await db.commit()

        # Broadcast via WebSocket
        await stream_manager.broadcast(self._ws_key, {
            "type": "meeting_message",
            **msg,
        })

        return msg

    async def _run_agent_turn(self, agent: dict, db) -> str | None:
        """Execute a single agent's turn. Returns the response or None if PASS."""
        if agent.get("type") == "external":
            return await self._run_external_turn(agent)

        # Internal agent: call AI
        system_prompt = self._build_system_prompt(agent)
        conversation = self._build_conversation_context()

        model = agent.get("model") or settings.default_model
        try:
            response = await call_ai(
                model=model,
                system_prompt=system_prompt,
                user_content=f"Conversation so far:\n{conversation}\n\nIt's your turn to speak.",
                temperature=0.7,
                max_tokens=512,
            )
        except Exception as e:
            await self._add_message(
                "System", "system", "status",
                f"Error getting response from {agent['name']}: {str(e)[:100]}",
                db=db,
            )
            return None

        response = response.strip()
        if response == "[PASS]" or not response:
            return None

        return response

    async def _run_external_turn(self, agent: dict) -> str | None:
        """Request a turn from an external agent via WebSocket, with 30s timeout."""
        agent_name = agent["name"]

        # Create a future for this agent's response
        loop = asyncio.get_event_loop()
        future = loop.create_future()
        self._external_responses[agent_name] = future

        # Send turn_request to all connected WebSocket clients
        conversation = self._build_conversation_context()
        await stream_manager.broadcast(self._ws_key, {
            "type": "turn_request",
            "agent_name": agent_name,
            "topic": self.topic,
            "conversation": conversation,
            "directives": self.directives,
        })

        try:
            response = await asyncio.wait_for(future, timeout=30.0)
            return response if response and response.strip() != "[PASS]" else None
        except asyncio.TimeoutError:
            await self._add_message(
                "System", "system", "status",
                f"{agent_name} timed out (30s). Skipping turn.",
                db=None,
            )
            return None
        finally:
            self._external_responses.pop(agent_name, None)

    def submit_external_response(self, agent_name: str, response: str) -> bool:
        """Called when an external agent submits their turn response."""
        future = self._external_responses.get(agent_name)
        if future and not future.done():
            future.set_result(response)
            return True
        return False

    async def _run_loop(self, db):
        """Main orchestration loop."""
        try:
            self.status = "active"
            await self._update_room_status(db, "active")

            await self._add_message(
                "System", "system", "status",
                f"Meeting started. Topic: {self.topic}",
                db=db,
            )
            if self.task_description:
                await self._add_message(
                    "System", "system", "status",
                    f"Task: {self.task_description}",
                    db=db,
                )

            consecutive_passes = 0
            max_consecutive_passes = len(self.agents) * 2  # 2 full rounds of all passing

            while self.current_round < self.max_rounds and not self._stop_requested:
                # Check pause
                await self._pause_event.wait()
                if self._stop_requested:
                    break

                self.current_round += 1

                # Check recent messages for @mentions → prioritize mentioned agents
                mentioned = []
                for msg in self.messages[-5:]:
                    mentioned.extend(self._parse_mentions(msg["content"]))
                agent_order = self._build_agent_order(mentioned)

                round_had_response = False
                for agent in agent_order:
                    if self._stop_requested:
                        break
                    await self._pause_event.wait()
                    if self._stop_requested:
                        break

                    # Drain human messages between agent turns (not just between rounds)
                    while self.human_message_queue:
                        hm = self.human_message_queue.pop(0)
                        await self._add_message(
                            hm["from_name"], "human", "message", hm["text"], db=db
                        )
                        consecutive_passes = 0  # Reset idle counter

                    # Broadcast thinking indicator
                    await stream_manager.broadcast(self._ws_key, {
                        "type": "agent_thinking",
                        "agent_name": agent["name"],
                    })

                    response = await self._run_agent_turn(agent, db)

                    # Clear thinking indicator
                    await stream_manager.broadcast(self._ws_key, {
                        "type": "agent_done",
                        "agent_name": agent["name"],
                    })

                    if response:
                        # Detect artifact prefix: [ARTIFACT] → markdown artifact
                        if response.startswith("[ARTIFACT]"):
                            artifact_content = response[len("[ARTIFACT]"):].strip()
                            await self._add_message(
                                agent["name"], "agent", "artifact", artifact_content,
                                db=db, content_type="text/markdown",
                            )
                        else:
                            await self._add_message(
                                agent["name"], "agent", "message", response, db=db
                            )
                        round_had_response = True
                        consecutive_passes = 0
                    else:
                        consecutive_passes += 1

                    # Cooldown between turns (skip if agent passed)
                    if response and self.cooldown_seconds > 0 and not self._stop_requested:
                        await asyncio.sleep(self.cooldown_seconds)

                if not round_had_response:
                    if consecutive_passes >= max_consecutive_passes:
                        await self._add_message(
                            "System", "system", "status",
                            "All agents have passed. Meeting ending due to idle.",
                            db=db,
                        )
                        break
        except Exception:
            logger.exception("Meeting loop crashed for %s", self.room_code)
        finally:
            await self._finalize(db)

    async def _finalize(self, db):
        """End the meeting: build transcript, update session, trigger auto_interpret."""
        self.status = "processing"
        try:
            await self._update_room_status(db, "processing")
        except Exception:
            logger.exception("Failed to update room status to processing")

        try:
            await self._add_message(
                "System", "system", "status",
                f"Meeting ended after {self.current_round} rounds.",
                db=db,
            )
        except Exception:
            logger.exception("Failed to add meeting-ended message")

        # Build speaker-attributed transcript (in-memory, can't fail)
        transcript_lines = []
        for msg in self.messages:
            if msg["message_type"] == "status":
                transcript_lines.append(f"[System]: {msg['content']}")
            elif msg["message_type"] == "directive":
                transcript_lines.append(f"[Directive from {msg['sender_name']}]: {msg['content']}")
            elif msg["message_type"] == "artifact":
                transcript_lines.append(f"[{msg['sender_name']} — artifact]:\n{msg['content']}")
            else:
                transcript_lines.append(f"[{msg['sender_name']}]: {msg['content']}")
        transcript = "\n".join(transcript_lines)

        # Save transcript to session and room
        try:
            await db.execute(
                "UPDATE sessions SET transcript = ?, status = 'complete' WHERE id = ?",
                (transcript, self.session_id),
            )
            await db.execute(
                "UPDATE rooms SET transcript_log = ? WHERE id = ?",
                (transcript, self.room_id),
            )
            await db.commit()
        except Exception:
            logger.exception("Failed to save transcript for session %s", self.session_id)

        # Auto-interpret if enabled
        if settings.auto_interpret:
            try:
                from services.interpret_service import auto_interpret
                await auto_interpret(self.session_id, db)
            except Exception:
                logger.exception("auto_interpret failed for session %s", self.session_id)

        # Auto-post meeting summary to wall
        if settings.auto_post_summaries:
            try:
                cursor = await db.execute(
                    "SELECT output_markdown FROM interpretations WHERE session_id = ? AND is_primary = 1",
                    (self.session_id,),
                )
                interp_row = await cursor.fetchone()
                summary_snippet = (interp_row["output_markdown"][:500] if interp_row else transcript[:500])
                wall_content = f"**Meeting completed**: {self.topic}\n\n{summary_snippet}...\n\nView: /session/{self.session_id}"
                post_id = str(uuid.uuid4())
                now = datetime.now(timezone.utc).isoformat()
                await db.execute(
                    """INSERT INTO wall_posts (id, agent_name, content, post_type, reactions, created_at)
                    VALUES (?, 'EchoBridge', ?, 'post', '{}', ?)""",
                    (post_id, wall_content, now),
                )
                await db.commit()
            except Exception:
                logger.exception("Failed to auto-post meeting summary to wall")

        # Fire session.complete event
        try:
            cursor = await db.execute(
                "SELECT COUNT(*) as cnt FROM interpretations WHERE session_id = ?",
                (self.session_id,),
            )
            interp_count = (await cursor.fetchone())["cnt"]
            cursor = await db.execute(
                "SELECT context, title FROM sessions WHERE id = ?",
                (self.session_id,),
            )
            session_row = await cursor.fetchone()

            event_id = str(uuid.uuid4())
            now = datetime.now(timezone.utc).isoformat()
            await db.execute(
                """INSERT INTO session_events (id, event_type, session_id, context, title, interpretations_count, created_at)
                VALUES (?, 'session.complete', ?, ?, ?, ?, ?)""",
                (event_id, self.session_id,
                 session_row["context"] if session_row else "working_session",
                 session_row["title"] if session_row else self.topic,
                 interp_count, now),
            )
            await db.commit()
        except Exception:
            logger.exception("Failed to insert session.complete event for %s", self.session_id)

        # Close room
        try:
            self.status = "closed"
            await self._update_room_status(db, "closed")
        except Exception:
            logger.exception("Failed to close room %s", self.room_code)

        # Broadcast meeting ended
        try:
            await stream_manager.broadcast(self._ws_key, {
                "type": "meeting_ended",
                "session_id": self.session_id,
                "rounds": self.current_round,
                "message_count": len(self.messages),
            })
        except Exception:
            logger.exception("Failed to broadcast meeting_ended")

        # Cleanup registry
        _active_meetings.pop(self.room_code, None)

    async def _update_room_status(self, db, status: str):
        """Update the room's status in the database."""
        await db.execute(
            "UPDATE rooms SET status = ? WHERE id = ?",
            (status, self.room_id),
        )
        await db.commit()

    async def start(self, db):
        """Start the orchestrator as a background task."""
        if self.status != "waiting":
            raise ValueError(f"Cannot start meeting in status '{self.status}'")

        await self._load_socket_personas(db)
        await self._load_meeting_context(db)
        _active_meetings[self.room_code] = self

        self._task = asyncio.create_task(self._run_loop(db))

    async def stop(self, db):
        """Stop the meeting gracefully."""
        self._stop_requested = True
        self._pause_event.set()  # Unpause if paused
        if self._task and not self._task.done():
            # Give it a moment to finalize
            try:
                await asyncio.wait_for(self._task, timeout=10.0)
            except asyncio.TimeoutError:
                self._task.cancel()

    def pause(self):
        """Pause the meeting."""
        if self.status == "active":
            self.status = "paused"
            self._pause_event.clear()

    def resume(self):
        """Resume a paused meeting."""
        if self.status == "paused":
            self.status = "active"
            self._pause_event.set()

    async def add_directive(self, text: str, from_name: str, db=None):
        """Add a host directive that gets injected into future agent prompts."""
        self.directives.append(text)
        await self._add_message(from_name, "human", "directive", text, db=db)

    def add_human_message(self, text: str, from_name: str):
        """Queue a human message to be injected in the next round."""
        self.human_message_queue.append({"text": text, "from_name": from_name})

    async def add_agent(self, agent: dict, db=None):
        """Dynamically add an agent to the meeting (e.g. when they join mid-meeting)."""
        # Avoid duplicates
        if any(a["name"] == agent["name"] for a in self.agents):
            return False
        self.agents.append(agent)
        await self._add_message(
            "System", "system", "status",
            f"{agent['name']} has joined the meeting.",
            db=db,
        )
        return True

    def get_state(self) -> dict:
        """Return current meeting state."""
        return {
            "status": self.status,
            "current_round": self.current_round,
            "max_rounds": self.max_rounds,
            "message_count": len(self.messages),
            "agents": [a["name"] for a in self.agents],
            "directive_count": len(self.directives),
        }
