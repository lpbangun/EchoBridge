import { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Pause, Square, Play, WifiOff, ArrowLeft, Eye, EyeOff } from 'lucide-react';
import { getSession, submitTranscript } from '../lib/api';
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
  const [showTranscript, setShowTranscript] = useState(true);
  const [showFullTranscript, setShowFullTranscript] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [savedOffline, setSavedOffline] = useState(false);
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
        .then(setSession)
        .catch(() => {});
    }
  }, [sessionId]);

  // Start speech recognition and audio level on mount
  useEffect(() => {
    let cancelled = false;

    async function startRecording() {
      // Start speech recognition
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
            // If the last chunk was interim, replace it; otherwise append
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

      // Start frequency-domain audio visualization via getUserMedia + AnalyserNode
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

        // Compute logarithmic bin mapping once: 24 bars spanning 80 Hz – 8000 Hz
        const sampleRate = audioCtx.sampleRate;
        const binCount = analyser.frequencyBinCount; // 256
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
        // Mic permission denied or unavailable — recording still works via speech API
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
      // Resuming
      if (lastPauseRef.current) {
        pausedTimeRef.current += Date.now() - lastPauseRef.current;
        lastPauseRef.current = null;
      }
      setIsPaused(false);
      if (recognitionRef.current) recognitionRef.current.resume();
    } else {
      // Pausing
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
    cleanupAudio();
    setIsRecording(false);
    setIsPaused(false);
    setSubmitting(true);
    setError(null);

    const currentTranscript = transcriptRef.current || '';

    if (!isOnline) {
      // Save to IndexedDB for later sync
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

  // freqBars is already a 24-element array driven by frequency data

  return (
    <div className="w-full min-h-screen bg-[#0A0A0A] flex flex-col items-center justify-center px-4 md:px-6 safe-area-inset">
      {/* Back / Cancel button */}
      <div className="fixed top-4 left-4 z-10 safe-area-inset">
        <button
          onClick={handleCancel}
          className="text-zinc-400 hover:text-zinc-200 transition-colors inline-flex items-center gap-2 touch-target"
          disabled={submitting}
        >
          <ArrowLeft size={20} strokeWidth={1.5} />
          <span className="text-sm">Cancel</span>
        </button>
      </div>

      {/* Card container for recording UI */}
      <div className="card-lg p-6 md:p-12 flex flex-col items-center w-full max-w-lg">
        {/* Recording indicator + label */}
        <div className="flex items-center gap-3">
          {isRecording && !isPaused && (
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75" />
              <span className="relative inline-flex rounded-full h-3 w-3 bg-red-600 shadow-[0_0_20px_rgba(239,68,68,0.4)]" />
            </span>
          )}
          <span className="text-xs font-medium tracking-widest uppercase text-zinc-400">
            {submitting ? 'Generating notes' : isPaused ? 'Paused' : 'Recording'}
          </span>
        </div>

        {/* Timer */}
        <div className="mt-6">
          <span className="text-3xl md:text-5xl font-bold font-mono text-white">
            {formatDuration(elapsed)}
          </span>
        </div>

        {/* Waveform visualization */}
        <div className="mt-8 flex items-end gap-0.5 h-16">
          {freqBars.map((height, i) => (
            <div
              key={i}
              className="w-1.5 rounded-full bg-[#C4F82A]"
              style={{
                height: `${Math.max(2, height * 64)}px`,
                opacity: 0.4 + height * 0.6,
              }}
            />
          ))}
        </div>

        {/* Guidance text */}
        {isRecording && !isPaused && !submitting && (
          <p className="mt-4 text-xs text-zinc-400">Audio is being transcribed using speech recognition.</p>
        )}

        {/* Offline saved confirmation */}
        {savedOffline && (
          <div className="mt-6 flex items-center gap-2 text-amber-400">
            <WifiOff size={16} strokeWidth={1.5} />
            <p className="text-sm">Recording saved offline. It will sync when you reconnect.</p>
          </div>
        )}

        {/* Controls */}
        <div className="mt-8 flex items-center gap-4">
          {!submitting && isRecording && (
            <>
              <button
                onClick={() => setShowTranscript((v) => !v)}
                className="btn-secondary inline-flex items-center gap-2 touch-target"
                aria-label={showTranscript ? 'Hide transcript' : 'Show transcript'}
              >
                {showTranscript ? <EyeOff size={16} strokeWidth={1.5} /> : <Eye size={16} strokeWidth={1.5} />}
                Transcript
              </button>
              <button
                onClick={handlePause}
                className="btn-secondary inline-flex items-center gap-2 touch-target"
              >
                {isPaused ? (
                  <>
                    <Play size={16} strokeWidth={1.5} />
                    Resume
                  </>
                ) : (
                  <>
                    <Pause size={16} strokeWidth={1.5} />
                    Pause
                  </>
                )}
              </button>
              <button
                onClick={handleStop}
                className="bg-red-500 hover:bg-red-400 text-white text-sm font-medium px-5 py-2.5 rounded-lg transition-all duration-200 shadow-lg shadow-red-500/25 hover:shadow-red-400/30 inline-flex items-center gap-2 touch-target"
              >
                <Square size={16} strokeWidth={1.5} />
                Stop
              </button>
            </>
          )}
          {submitting && (
            <div className="flex items-center gap-3">
              <div className="h-4 w-4 border-2 border-accent border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-zinc-400">Saving transcript...</p>
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

      {/* Live Transcript */}
      {isRecording && showTranscript && (
        <div className="mt-6 w-full max-w-lg">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-3">
              <span className="section-label">Transcript</span>
              <div className="flex items-center bg-zinc-800 rounded-md overflow-hidden text-xs">
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
          {showFullTranscript ? (
            <LiveTranscript fullTranscript={transcript || ''} />
          ) : (
            <LiveTranscript chunks={liveChunks} />
          )}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="mt-4 flex flex-col items-center gap-3">
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

      {/* Session metadata */}
      <div className="mt-16 text-center">
        {session && (
          <>
            <p className="text-sm text-zinc-400">
              <span className="section-label">
                {contextLabel(session.context)}
              </span>
              {session.title && (
                <span className="ml-2">{session.title}</span>
              )}
            </p>
            {session.room_code && (
              <p className="mt-1 text-sm text-zinc-400">
                Room: {session.room_code}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
