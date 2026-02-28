import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Pause, Square, Play, WifiOff, ArrowLeft, FileText, Mic } from 'lucide-react';
import { getSession, submitTranscript, updateSession } from '../lib/api';
import { formatDuration, contextLabel } from '../lib/utils';
import { savePendingRecording } from '../lib/offlineStorage';
import { createSpeechRecognition } from '../lib/speechRecognition';
import useOnlineStatus from '../hooks/useOnlineStatus';
import LiveTranscript from '../components/LiveTranscript';

export default function Recording() {
  const navigate = useNavigate();
  const { sessionId } = useParams();
  const [searchParams] = useSearchParams();
  const isAppendMode = searchParams.get('mode') === 'append';
  const isOnline = useOnlineStatus();
  const [session, setSession] = useState(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [freqBars, setFreqBars] = useState(() => new Array(24).fill(0.02));
  const [transcript, setTranscript] = useState('');
  const [liveChunks, setLiveChunks] = useState([]);
  const [showFullTranscript, setShowFullTranscript] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [savedOffline, setSavedOffline] = useState(false);

  // Manual notes state
  const [manualNotes, setManualNotes] = useState('');
  const [notesSaved, setNotesSaved] = useState(false);
  const lastSavedNotesRef = useRef('');
  const notesRef = useRef('');

  // Mobile panel toggle: 'transcript' | 'notes'
  const [mobilePanel, setMobilePanel] = useState('transcript');

  const startTimeRef = useRef(Date.now());
  const pausedTimeRef = useRef(0);
  const lastPauseRef = useRef(null);
  const transcriptRef = useRef('');
  const recognitionRef = useRef(null);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const animFrameRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const freqBarsRef = useRef(new Float32Array(24));
  const binMappingRef = useRef(null);

  // Fetch session info
  useEffect(() => {
    if (sessionId) {
      getSession(sessionId)
        .then((s) => {
          setSession(s);
          if (s.manual_notes) {
            setManualNotes(s.manual_notes);
            lastSavedNotesRef.current = s.manual_notes;
            notesRef.current = s.manual_notes;
          }
        })
        .catch(() => {});
    }
  }, [sessionId]);

  // Auto-save manual notes every 5 seconds
  const saveNotes = useCallback(async () => {
    const current = notesRef.current;
    if (current === lastSavedNotesRef.current) return;
    try {
      await updateSession(sessionId, { manual_notes: current });
      lastSavedNotesRef.current = current;
      setNotesSaved(true);
      setTimeout(() => setNotesSaved(false), 2000);
    } catch {
      // Silent fail — will retry on next interval
    }
  }, [sessionId]);

  useEffect(() => {
    const interval = setInterval(saveNotes, 5000);
    return () => clearInterval(interval);
  }, [saveNotes]);

  // Start speech recognition and audio level on mount
  useEffect(() => {
    let cancelled = false;

    async function startRecording() {
      const recognition = createSpeechRecognition({
        onChunk: (chunk) => {
          if (cancelled) return;
          const normalized = {
            text: chunk.text,
            is_final: chunk.isFinal,
            timestamp_ms: chunk.timestampMs,
          };
          if (chunk.isFinal) {
            transcriptRef.current = transcriptRef.current
              ? transcriptRef.current + ' ' + chunk.text
              : chunk.text;
            setTranscript(transcriptRef.current);
          }
          setLiveChunks((prev) => {
            if (prev.length > 0 && !prev[prev.length - 1].is_final) {
              return [...prev.slice(0, -1), normalized];
            }
            return [...prev, normalized];
          });
        },
        onError: (err) => {
          console.error('Speech recognition error:', err);
        },
        onEnd: () => {},
      });
      recognitionRef.current = recognition;
      recognition.start();

      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        mediaStreamRef.current = stream;
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        audioContextRef.current = audioCtx;
        if (audioCtx.state === 'suspended') {
          await audioCtx.resume();
        }
        const source = audioCtx.createMediaStreamSource(stream);
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 512;
        analyser.smoothingTimeConstant = 0.4;
        source.connect(analyser);
        analyserRef.current = analyser;

        const sampleRate = audioCtx.sampleRate;
        const binCount = analyser.frequencyBinCount;
        const fMin = 80;
        const fMax = 8000;
        const numBars = 24;
        const mapping = [];
        for (let i = 0; i < numBars; i++) {
          const f0 = fMin * Math.pow(fMax / fMin, i / numBars);
          const f1 = fMin * Math.pow(fMax / fMin, (i + 1) / numBars);
          const startBin = Math.max(0, Math.floor(f0 / (sampleRate / analyser.fftSize)));
          const endBin = Math.min(binCount - 1, Math.floor(f1 / (sampleRate / analyser.fftSize)));
          mapping.push([startBin, Math.max(startBin, endBin)]);
        }
        binMappingRef.current = mapping;

        const dataArray = new Uint8Array(binCount);
        const smoothed = freqBarsRef.current;
        const alpha = 0.3;

        function updateLevel() {
          if (cancelled) return;
          analyser.getByteFrequencyData(dataArray);
          let changed = false;
          for (let i = 0; i < numBars; i++) {
            const [s, e] = mapping[i];
            let peak = 0;
            for (let b = s; b <= e; b++) {
              if (dataArray[b] > peak) peak = dataArray[b];
            }
            const raw = peak / 255;
            const next = smoothed[i] * (1 - alpha) + raw * alpha;
            const clamped = Math.max(0.02, next);
            if (Math.abs(clamped - smoothed[i]) > 0.005) changed = true;
            smoothed[i] = clamped;
          }
          if (changed) {
            setFreqBars(Array.from(smoothed));
          }
          animFrameRef.current = requestAnimationFrame(updateLevel);
        }
        updateLevel();
      } catch {
        // Mic permission denied — recording still works via speech API
      }

      if (!cancelled) {
        startTimeRef.current = Date.now();
        setIsRecording(true);
      }
    }

    startRecording();

    return () => {
      cancelled = true;
      if (recognitionRef.current) {
        recognitionRef.current.stop();
        recognitionRef.current = null;
      }
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      if (audioContextRef.current) audioContextRef.current.close().catch(() => {});
      if (mediaStreamRef.current) mediaStreamRef.current.getTracks().forEach((t) => t.stop());
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Timer
  useEffect(() => {
    if (!isRecording) return;

    const interval = setInterval(() => {
      if (!isPaused) {
        const pausedTotal = pausedTimeRef.current +
          (lastPauseRef.current ? Date.now() - lastPauseRef.current : 0);
        const ms = Date.now() - startTimeRef.current - pausedTotal;
        setElapsed(Math.floor(ms / 1000));
      }
    }, 100);

    return () => clearInterval(interval);
  }, [isRecording, isPaused]);

  function handlePause() {
    if (isPaused) {
      if (lastPauseRef.current) {
        pausedTimeRef.current += Date.now() - lastPauseRef.current;
        lastPauseRef.current = null;
      }
      setIsPaused(false);
      if (recognitionRef.current) recognitionRef.current.resume();
    } else {
      lastPauseRef.current = Date.now();
      setIsPaused(true);
      if (recognitionRef.current) recognitionRef.current.pause();
    }
  }

  function cleanupAudio() {
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    if (audioContextRef.current) audioContextRef.current.close().catch(() => {});
    if (mediaStreamRef.current) mediaStreamRef.current.getTracks().forEach((t) => t.stop());
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
  }

  function handleCancel() {
    cleanupAudio();
    navigate(-1);
  }

  async function handleStop() {
    // Save notes one last time before stopping
    await saveNotes();

    cleanupAudio();
    setIsRecording(false);
    setIsPaused(false);
    setSubmitting(true);
    setError(null);

    const currentTranscript = transcriptRef.current || '';

    if (!isOnline) {
      try {
        await savePendingRecording({
          sessionId,
          transcript: currentTranscript,
          durationSeconds: elapsed,
          append: isAppendMode,
        });
        setSavedOffline(true);
        setSubmitting(false);
      } catch (err) {
        setError('Failed to save recording offline: ' + (err.message || 'Unknown error'));
        setSubmitting(false);
      }
      return;
    }

    if (!currentTranscript.trim()) {
      setError('No speech detected. Make sure your microphone is working and try again.');
      setSubmitting(false);
      return;
    }

    try {
      await submitTranscript(sessionId, currentTranscript, elapsed, isAppendMode);
      navigate(`/session/${sessionId}`);
    } catch (err) {
      setError(err.message || 'Failed to submit transcript.');
      setSubmitting(false);
    }
  }

  function handleNotesChange(e) {
    const value = e.target.value;
    setManualNotes(value);
    notesRef.current = value;
  }

  return (
    <div className="w-full min-h-screen bg-[#0A0A0A] flex flex-col safe-area-inset">
      {/* Top bar: Back, Timer, Waveform, Controls */}
      <div className="border-b border-zinc-800 px-4 md:px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-4">
          {/* Left: Back + Recording indicator */}
          <div className="flex items-center gap-4">
            <button
              onClick={handleCancel}
              className="text-zinc-400 hover:text-zinc-200 transition-colors inline-flex items-center gap-2 touch-target"
              disabled={submitting}
            >
              <ArrowLeft size={20} strokeWidth={1.5} />
            </button>

            <div className="flex items-center gap-2">
              {isRecording && !isPaused && (
                <span className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-600" />
                </span>
              )}
              <span className="text-xs font-medium tracking-widest uppercase text-zinc-400">
                {submitting ? 'Generating notes' : isPaused ? 'Paused' : 'Recording'}
              </span>
            </div>
          </div>

          {/* Center: Timer + compact waveform */}
          <div className="flex items-center gap-4">
            <span className="text-xl font-bold font-mono text-white">
              {formatDuration(elapsed)}
            </span>
            <div className="hidden md:flex items-end gap-px h-6">
              {freqBars.map((height, i) => (
                <div
                  key={i}
                  className="w-1 bg-[#C4F82A]"
                  style={{
                    height: `${Math.max(2, height * 24)}px`,
                    opacity: 0.4 + height * 0.6,
                  }}
                />
              ))}
            </div>
          </div>

          {/* Right: Controls */}
          <div className="flex items-center gap-2">
            {!submitting && isRecording && (
              <>
                <button
                  onClick={handlePause}
                  className="btn-secondary inline-flex items-center gap-1.5 text-sm touch-target"
                >
                  {isPaused ? (
                    <><Play size={14} strokeWidth={1.5} /><span className="hidden sm:inline">Resume</span></>
                  ) : (
                    <><Pause size={14} strokeWidth={1.5} /><span className="hidden sm:inline">Pause</span></>
                  )}
                </button>
                <button
                  onClick={handleStop}
                  className="bg-red-500 hover:bg-red-400 text-white text-sm font-medium px-4 py-2 transition-colors inline-flex items-center gap-1.5 touch-target"
                >
                  <Square size={14} strokeWidth={1.5} />
                  <span className="hidden sm:inline">Stop</span>
                </button>
              </>
            )}
            {submitting && (
              <div className="flex items-center gap-2">
                <div className="h-4 w-4 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                <p className="text-sm text-zinc-400">Saving...</p>
              </div>
            )}
            {savedOffline && (
              <button
                onClick={() => navigate('/')}
                className="btn-primary inline-flex items-center gap-2 touch-target"
              >
                Back to Dashboard
              </button>
            )}
          </div>
        </div>

        {/* Offline saved notice */}
        {savedOffline && (
          <div className="max-w-6xl mx-auto mt-3 flex items-center gap-2 text-amber-400">
            <WifiOff size={14} strokeWidth={1.5} />
            <p className="text-xs">Recording saved offline. It will sync when you reconnect.</p>
          </div>
        )}

        {/* Session metadata */}
        {session && (
          <div className="max-w-6xl mx-auto mt-2">
            <p className="text-xs text-zinc-500">
              <span className="font-medium tracking-widest uppercase">{contextLabel(session.context)}</span>
              {session.title && <span className="ml-2 text-zinc-400">{session.title}</span>}
            </p>
          </div>
        )}
      </div>

      {/* Mobile panel toggle */}
      {isRecording && (
        <div className="md:hidden border-b border-zinc-800 px-4 py-2">
          <div className="flex items-center bg-zinc-800 overflow-hidden text-xs w-fit">
            <button
              onClick={() => setMobilePanel('transcript')}
              className={`px-4 py-1.5 transition-colors inline-flex items-center gap-1.5 ${mobilePanel === 'transcript' ? 'bg-zinc-600 text-white' : 'text-zinc-400 hover:text-zinc-300'}`}
            >
              <Mic size={12} strokeWidth={1.5} />
              Transcript
            </button>
            <button
              onClick={() => setMobilePanel('notes')}
              className={`px-4 py-1.5 transition-colors inline-flex items-center gap-1.5 ${mobilePanel === 'notes' ? 'bg-zinc-600 text-white' : 'text-zinc-400 hover:text-zinc-300'}`}
            >
              <FileText size={12} strokeWidth={1.5} />
              Notes
            </button>
          </div>
        </div>
      )}

      {/* Split-screen content area */}
      {isRecording && (
        <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
          {/* Left panel: Live Transcript (~55%) */}
          <div className={`md:w-[55%] md:border-r border-zinc-800 flex flex-col overflow-hidden ${mobilePanel !== 'transcript' ? 'hidden md:flex' : 'flex'}`}>
            <div className="px-4 md:px-6 py-3 border-b border-zinc-800 flex items-center justify-between flex-shrink-0">
              <div className="flex items-center gap-3">
                <span className="text-xs font-medium tracking-widest uppercase text-zinc-400">Transcript</span>
                <div className="flex items-center bg-zinc-800 overflow-hidden text-xs">
                  <button
                    onClick={() => setShowFullTranscript(false)}
                    className={`px-2.5 py-1 transition-colors ${!showFullTranscript ? 'bg-zinc-600 text-white' : 'text-zinc-400 hover:text-zinc-300'}`}
                  >
                    Live
                  </button>
                  <button
                    onClick={() => setShowFullTranscript(true)}
                    className={`px-2.5 py-1 transition-colors ${showFullTranscript ? 'bg-zinc-600 text-white' : 'text-zinc-400 hover:text-zinc-300'}`}
                  >
                    Full
                  </button>
                </div>
              </div>
              <span className="text-xs text-zinc-500">
                {liveChunks.filter((c) => c.is_final).length} phrases
              </span>
            </div>
            <div className="flex-1 overflow-y-auto px-4 md:px-6 py-4">
              {showFullTranscript ? (
                <LiveTranscript fullTranscript={transcript || ''} />
              ) : (
                <LiveTranscript chunks={liveChunks} />
              )}
            </div>
          </div>

          {/* Right panel: Manual Notes (~45%) */}
          <div className={`md:w-[45%] flex flex-col overflow-hidden ${mobilePanel !== 'notes' ? 'hidden md:flex' : 'flex'}`}>
            <div className="px-4 md:px-6 py-3 border-b border-zinc-800 flex items-center justify-between flex-shrink-0">
              <span className="text-xs font-medium tracking-widest uppercase text-zinc-400">Your Notes</span>
              <span className={`text-xs transition-opacity duration-500 ${notesSaved ? 'text-zinc-500 opacity-100' : 'opacity-0'}`}>
                Saved
              </span>
            </div>
            <div className="flex-1 px-4 md:px-6 py-4">
              <textarea
                value={manualNotes}
                onChange={handleNotesChange}
                placeholder="Type your notes here during the meeting...&#10;&#10;These notes guide how EchoBridge structures your summary. Highlight key decisions, action items, or questions."
                className="w-full h-full bg-transparent text-zinc-300 font-mono text-sm leading-relaxed resize-none focus:outline-none placeholder:text-zinc-600"
              />
            </div>
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="px-4 py-4 flex flex-col items-center gap-3">
          <p className="text-sm text-red-400">{error}</p>
          {!isRecording && !submitting && (
            <button
              onClick={() => navigate(-1)}
              className="btn-secondary text-sm inline-flex items-center gap-2"
            >
              <ArrowLeft size={14} strokeWidth={1.5} />
              Go Back
            </button>
          )}
        </div>
      )}

      {/* Pre-recording state (before recording starts) */}
      {!isRecording && !submitting && !error && !savedOffline && (
        <div className="flex-1 flex items-center justify-center">
          <div className="flex items-center gap-3">
            <div className="h-4 w-4 border-2 border-accent border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-zinc-400">Starting recording...</p>
          </div>
        </div>
      )}
    </div>
  );
}
