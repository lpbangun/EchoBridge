import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Pause, Square, Play, WifiOff, ArrowLeft } from 'lucide-react';
import { getSession, submitTranscript } from '../lib/api';
import { formatDuration, contextLabel } from '../lib/utils';
import { savePendingRecording } from '../lib/offlineStorage';
import { createSpeechRecognition } from '../lib/speechRecognition';
import useOnlineStatus from '../hooks/useOnlineStatus';

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
  const [audioLevel, setAudioLevel] = useState(0);
  const [transcript, setTranscript] = useState('');
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
          if (chunk.isFinal) {
            transcriptRef.current = transcriptRef.current
              ? transcriptRef.current + ' ' + chunk.text
              : chunk.text;
            setTranscript(transcriptRef.current);
          }
        },
        onError: (err) => {
          console.error('Speech recognition error:', err);
        },
        onEnd: () => {},
      });
      recognitionRef.current = recognition;
      recognition.start();

      // Start audio level metering via getUserMedia + AnalyserNode
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        mediaStreamRef.current = stream;
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        audioContextRef.current = audioCtx;
        const source = audioCtx.createMediaStreamSource(stream);
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);
        analyserRef.current = analyser;

        const dataArray = new Uint8Array(analyser.fftSize);
        function updateLevel() {
          if (cancelled) return;
          analyser.getByteTimeDomainData(dataArray);
          let sumSq = 0;
          for (let i = 0; i < dataArray.length; i++) {
            const d = (dataArray[i] - 128) / 128;
            sumSq += d * d;
          }
          const rms = Math.sqrt(sumSq / dataArray.length);
          setAudioLevel(Math.min(1, rms * 3));
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

  // Generate waveform bars based on audio level
  const barCount = 24;
  const bars = Array.from({ length: barCount }, (_, i) => {
    const centerDist = Math.abs(i - barCount / 2) / (barCount / 2);
    const baseHeight = 0.1 + (1 - centerDist) * 0.6;
    const level = isPaused ? 0.05 : audioLevel;
    const height = Math.max(0.05, baseHeight * level + Math.random() * 0.1 * level);
    return height;
  });

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
          {bars.map((height, i) => {
            const centerDist = Math.abs(i - barCount / 2) / (barCount / 2);
            const isCenterBar = centerDist < 0.4;
            return (
              <div
                key={i}
                className={`w-1.5 rounded-full transition-all duration-75 ${
                  isCenterBar ? 'bg-[#C4F82A]' : 'bg-[#C4F82A]/60'
                }`}
                style={{ height: `${height * 64}px` }}
              />
            );
          })}
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
