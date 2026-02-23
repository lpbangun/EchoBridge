import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Pause, Square, Play, WifiOff } from 'lucide-react';
import { getSession, submitTranscript } from '../lib/api';
import { formatDuration, contextLabel } from '../lib/utils';
import { savePendingRecording } from '../lib/offlineStorage';
import useOnlineStatus from '../hooks/useOnlineStatus';
import AudioRecorder from '../components/AudioRecorder';

export default function Recording() {
  const navigate = useNavigate();
  const { sessionId } = useParams();
  const isOnline = useOnlineStatus();
  const [session, setSession] = useState(null);
  const [isRecording, setIsRecording] = useState(true);
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

  // Fetch session info
  useEffect(() => {
    if (sessionId) {
      getSession(sessionId)
        .then(setSession)
        .catch(() => {});
    }
  }, [sessionId]);

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

  const handleTranscriptChunk = useCallback((text, isFinal) => {
    if (isFinal) {
      transcriptRef.current = transcriptRef.current
        ? transcriptRef.current + ' ' + text
        : text;
      setTranscript(transcriptRef.current);
    }
  }, []);

  const handleAudioLevel = useCallback((level) => {
    setAudioLevel(level);
  }, []);

  function handlePause() {
    if (isPaused) {
      // Resuming
      if (lastPauseRef.current) {
        pausedTimeRef.current += Date.now() - lastPauseRef.current;
        lastPauseRef.current = null;
      }
      setIsPaused(false);
    } else {
      // Pausing
      lastPauseRef.current = Date.now();
      setIsPaused(true);
    }
  }

  async function handleStop() {
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
        });
        setSavedOffline(true);
        setSubmitting(false);
      } catch (err) {
        setError('Failed to save recording offline: ' + (err.message || 'Unknown error'));
        setSubmitting(false);
      }
      return;
    }

    try {
      await submitTranscript(sessionId, currentTranscript, elapsed);
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
    <div className="w-full min-h-screen flex flex-col items-center justify-center px-4 md:px-6 safe-area-inset">
      <AudioRecorder
        onTranscriptChunk={handleTranscriptChunk}
        onAudioLevel={handleAudioLevel}
        isRecording={isRecording}
        isPaused={isPaused}
      />

      {/* Glass container for recording UI */}
      <div className="glass rounded-xl p-6 md:p-12 flex flex-col items-center w-full max-w-lg">
        {/* Recording indicator + label */}
        <div className="flex items-center gap-3">
          {isRecording && !isPaused && (
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75" />
              <span className="relative inline-flex rounded-full h-3 w-3 bg-red-600 shadow-[0_0_20px_rgba(239,68,68,0.4)]" />
            </span>
          )}
          <span className="text-xs font-medium tracking-widest uppercase text-slate-400">
            {submitting ? 'Processing' : isPaused ? 'Paused' : 'Recording'}
          </span>
        </div>

        {/* Timer */}
        <div className="mt-6">
          <span className="text-3xl md:text-5xl font-bold font-mono text-slate-50">
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
                  isCenterBar ? 'bg-indigo-400' : 'bg-indigo-400/60'
                }`}
                style={{ height: `${height * 64}px` }}
              />
            );
          })}
        </div>

        {/* Guidance text */}
        {isRecording && !isPaused && !submitting && (
          <p className="mt-4 text-xs text-slate-500">Audio is being transcribed using speech recognition.</p>
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
              <div className="h-4 w-4 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-slate-400">Saving transcript...</p>
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
        <p className="mt-4 text-sm text-red-400">{error}</p>
      )}

      {/* Session metadata */}
      <div className="mt-16 text-center">
        {session && (
          <>
            <p className="text-sm text-slate-500">
              <span className="section-label">
                {contextLabel(session.context)}
              </span>
              {session.title && (
                <span className="ml-2">{session.title}</span>
              )}
            </p>
            {session.room_code && (
              <p className="mt-1 text-sm text-slate-500">
                Room: {session.room_code}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
