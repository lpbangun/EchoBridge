"""Tests for diarization: TranscriptSegment, TranscriptResult, Deepgram parsing, and DB storage."""

import pytest

from services.stt.base import TranscriptResult, TranscriptSegment
from services.stt.deepgram_stt import _group_words_into_segments, _format_diarized_text


# ---------------------------------------------------------------------------
# TranscriptSegment and TranscriptResult dataclass creation
# ---------------------------------------------------------------------------


class TestTranscriptSegment:
    """Test TranscriptSegment dataclass."""

    def test_create_segment(self):
        seg = TranscriptSegment(text="Hello world", speaker=0, start=0.0, end=1.5)
        assert seg.text == "Hello world"
        assert seg.speaker == 0
        assert seg.start == 0.0
        assert seg.end == 1.5

    def test_create_segment_no_speaker(self):
        seg = TranscriptSegment(text="Some text", speaker=None, start=2.0, end=3.0)
        assert seg.speaker is None

    def test_segment_fields(self):
        seg = TranscriptSegment(text="test", speaker=2, start=10.5, end=12.3)
        assert seg.speaker == 2
        assert seg.start == 10.5
        assert seg.end == 12.3


class TestTranscriptResult:
    """Test extended TranscriptResult dataclass."""

    def test_backward_compat_no_segments(self):
        """Non-diarized results have is_diarized=False and empty segments by default."""
        result = TranscriptResult(text="Hello world", duration_seconds=5.0)
        assert result.text == "Hello world"
        assert result.duration_seconds == 5.0
        assert result.segments == []
        assert result.is_diarized is False

    def test_diarized_result(self):
        segments = [
            TranscriptSegment(text="Hi", speaker=0, start=0.0, end=0.5),
            TranscriptSegment(text="Hey", speaker=1, start=0.6, end=1.0),
        ]
        result = TranscriptResult(
            text="[Speaker 0]: Hi\n[Speaker 1]: Hey",
            duration_seconds=1.0,
            segments=segments,
            is_diarized=True,
        )
        assert result.is_diarized is True
        assert len(result.segments) == 2
        assert result.segments[0].speaker == 0
        assert result.segments[1].speaker == 1

    def test_empty_result(self):
        result = TranscriptResult(text="", duration_seconds=0.0)
        assert result.text == ""
        assert result.segments == []
        assert result.is_diarized is False


# ---------------------------------------------------------------------------
# Deepgram word grouping and formatting
# ---------------------------------------------------------------------------


class TestGroupWordsIntoSegments:
    """Test _group_words_into_segments from deepgram_stt."""

    def test_empty_words(self):
        assert _group_words_into_segments([]) == []

    def test_single_word(self):
        words = [{"word": "Hello", "speaker": 0, "start": 0.0, "end": 0.5}]
        segments = _group_words_into_segments(words)
        assert len(segments) == 1
        assert segments[0].text == "Hello"
        assert segments[0].speaker == 0
        assert segments[0].start == 0.0
        assert segments[0].end == 0.5

    def test_consecutive_same_speaker(self):
        words = [
            {"word": "Hello", "speaker": 0, "start": 0.0, "end": 0.3},
            {"word": "world", "speaker": 0, "start": 0.4, "end": 0.7},
            {"word": "how", "speaker": 0, "start": 0.8, "end": 0.9},
        ]
        segments = _group_words_into_segments(words)
        assert len(segments) == 1
        assert segments[0].text == "Hello world how"
        assert segments[0].speaker == 0
        assert segments[0].start == 0.0
        assert segments[0].end == 0.9

    def test_speaker_change(self):
        words = [
            {"word": "Hello", "speaker": 0, "start": 0.0, "end": 0.5},
            {"word": "everyone.", "speaker": 0, "start": 0.5, "end": 1.0},
            {"word": "Thanks", "speaker": 1, "start": 1.2, "end": 1.5},
            {"word": "for", "speaker": 1, "start": 1.5, "end": 1.7},
            {"word": "joining.", "speaker": 1, "start": 1.7, "end": 2.0},
        ]
        segments = _group_words_into_segments(words)
        assert len(segments) == 2
        assert segments[0].text == "Hello everyone."
        assert segments[0].speaker == 0
        assert segments[0].start == 0.0
        assert segments[0].end == 1.0
        assert segments[1].text == "Thanks for joining."
        assert segments[1].speaker == 1
        assert segments[1].start == 1.2
        assert segments[1].end == 2.0

    def test_multiple_speaker_changes(self):
        words = [
            {"word": "A", "speaker": 0, "start": 0.0, "end": 0.2},
            {"word": "B", "speaker": 1, "start": 0.3, "end": 0.5},
            {"word": "C", "speaker": 0, "start": 0.6, "end": 0.8},
            {"word": "D", "speaker": 2, "start": 0.9, "end": 1.1},
        ]
        segments = _group_words_into_segments(words)
        assert len(segments) == 4
        assert [s.speaker for s in segments] == [0, 1, 0, 2]

    def test_punctuated_word_preferred(self):
        """Deepgram returns both 'word' and 'punctuated_word'; prefer punctuated."""
        words = [
            {"word": "hello", "punctuated_word": "Hello,", "speaker": 0, "start": 0.0, "end": 0.5},
            {"word": "world", "punctuated_word": "world.", "speaker": 0, "start": 0.5, "end": 1.0},
        ]
        segments = _group_words_into_segments(words)
        assert len(segments) == 1
        assert segments[0].text == "Hello, world."


class TestFormatDiarizedText:
    """Test _format_diarized_text from deepgram_stt."""

    def test_format_single_speaker(self):
        segments = [
            TranscriptSegment(text="Hello world.", speaker=0, start=0.0, end=1.0),
        ]
        result = _format_diarized_text(segments)
        assert result == "[Speaker 0]: Hello world."

    def test_format_multiple_speakers(self):
        segments = [
            TranscriptSegment(text="Hello world.", speaker=0, start=0.0, end=1.0),
            TranscriptSegment(text="Thanks for joining.", speaker=1, start=1.2, end=2.0),
        ]
        result = _format_diarized_text(segments)
        assert result == "[Speaker 0]: Hello world.\n[Speaker 1]: Thanks for joining."

    def test_format_no_speaker(self):
        """Segments without speaker info render as plain text."""
        segments = [
            TranscriptSegment(text="Unknown speaker text.", speaker=None, start=0.0, end=1.0),
        ]
        result = _format_diarized_text(segments)
        assert result == "Unknown speaker text."

    def test_format_mixed_speakers(self):
        segments = [
            TranscriptSegment(text="Hi", speaker=0, start=0.0, end=0.3),
            TranscriptSegment(text="Hey", speaker=1, start=0.4, end=0.7),
            TranscriptSegment(text="Let's start", speaker=0, start=0.8, end=1.2),
        ]
        result = _format_diarized_text(segments)
        expected = "[Speaker 0]: Hi\n[Speaker 1]: Hey\n[Speaker 0]: Let's start"
        assert result == expected

    def test_format_empty(self):
        assert _format_diarized_text([]) == ""


# ---------------------------------------------------------------------------
# Deepgram mock response parsing (integration-style unit test)
# ---------------------------------------------------------------------------


class TestDeepgramResponseParsing:
    """Test that a mock Deepgram diarized response produces correct TranscriptResult."""

    def _make_mock_words(self):
        """Simulate a Deepgram response words array with speaker labels."""
        return [
            {"word": "hello", "punctuated_word": "Hello", "speaker": 0, "start": 0.0, "end": 0.4},
            {"word": "everyone", "punctuated_word": "everyone.", "speaker": 0, "start": 0.5, "end": 1.0},
            {"word": "thanks", "punctuated_word": "Thanks", "speaker": 1, "start": 1.2, "end": 1.5},
            {"word": "for", "punctuated_word": "for", "speaker": 1, "start": 1.5, "end": 1.7},
            {"word": "joining", "punctuated_word": "joining.", "speaker": 1, "start": 1.7, "end": 2.2},
            {"word": "let's", "punctuated_word": "Let's", "speaker": 0, "start": 2.5, "end": 2.8},
            {"word": "begin", "punctuated_word": "begin.", "speaker": 0, "start": 2.8, "end": 3.2},
        ]

    def test_groups_and_formats_correctly(self):
        words = self._make_mock_words()
        segments = _group_words_into_segments(words)

        assert len(segments) == 3
        assert segments[0].text == "Hello everyone."
        assert segments[0].speaker == 0
        assert segments[1].text == "Thanks for joining."
        assert segments[1].speaker == 1
        assert segments[2].text == "Let's begin."
        assert segments[2].speaker == 0

        text = _format_diarized_text(segments)
        lines = text.split("\n")
        assert len(lines) == 3
        assert lines[0] == "[Speaker 0]: Hello everyone."
        assert lines[1] == "[Speaker 1]: Thanks for joining."
        assert lines[2] == "[Speaker 0]: Let's begin."

    def test_produces_diarized_result(self):
        words = self._make_mock_words()
        segments = _group_words_into_segments(words)
        text = _format_diarized_text(segments)

        result = TranscriptResult(
            text=text,
            duration_seconds=3.2,
            segments=segments,
            is_diarized=True,
        )

        assert result.is_diarized is True
        assert len(result.segments) == 3
        assert "[Speaker 0]:" in result.text
        assert "[Speaker 1]:" in result.text


# ---------------------------------------------------------------------------
# is_diarized flag stored and returned in session response (API-level)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_is_diarized_default_false(client, sample_session):
    """New sessions default to is_diarized=False."""
    res = await client.post("/api/sessions", json=sample_session)
    assert res.status_code == 200
    session = res.json()
    assert session["is_diarized"] is False


@pytest.mark.asyncio
async def test_is_diarized_stored_on_transcript(client, sample_session, db):
    """When is_diarized is set in the DB, the session response reflects it."""
    res = await client.post("/api/sessions", json=sample_session)
    sid = res.json()["id"]

    # Simulate what transcribe.py does after a diarized STT result
    await db.execute(
        """UPDATE sessions
        SET transcript = ?, duration_seconds = ?, status = 'complete',
            stt_provider = 'deepgram', is_diarized = ?
        WHERE id = ?""",
        (
            "[Speaker 0]: Hello.\n[Speaker 1]: Hi there.",
            5,
            True,
            sid,
        ),
    )
    await db.commit()

    res = await client.get(f"/api/sessions/{sid}")
    assert res.status_code == 200
    session = res.json()
    assert session["is_diarized"] is True
    assert "[Speaker 0]:" in session["transcript"]


@pytest.mark.asyncio
async def test_non_diarized_transcript_no_flag(client, sample_session, db):
    """Browser STT transcripts remain is_diarized=False."""
    res = await client.post("/api/sessions", json=sample_session)
    sid = res.json()["id"]

    # Submit a plain browser transcript
    res = await client.post(
        f"/api/sessions/{sid}/transcript",
        json={"transcript": "Plain text without speakers.", "duration_seconds": 10},
    )
    assert res.status_code == 200

    res = await client.get(f"/api/sessions/{sid}")
    session = res.json()
    assert session["is_diarized"] is False
