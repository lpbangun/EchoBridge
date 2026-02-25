import { useState, useEffect, useRef, useCallback } from 'react';
import { Pause, Play, Square } from 'lucide-react';
import { createSpeechRecognition } from '../lib/speechRecognition';
import { formatDuration } from '../lib/utils';

/**
 * Recording component using the browser Web Speech API.
 * Shows a pulsing red recording dot, timer, and pause/resume/stop controls.
 * Collects all transcript chunks and passes them upstream.
 */
export default function AudioRecorder({ onTranscriptChunk, onRecordingComplete }) {
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  const recognitionRef = useRef(null);
  const timerRef = useRef(null);
  const chunksRef = useRef([]);
  const startTimeRef = useRef(null);

  // Accumulate transcript chunks
  const handleChunk = useCallback(
    (chunk) => {
      chunksRef.current.push(chunk);
      if (onTranscriptChunk) {
        onTranscriptChunk(chunk);
      }
    },
    [onTranscriptChunk]
  );

  // Start the timer interval
  function startTimer() {
    timerRef.current = setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);
    }, 1000);
  }

  // Stop the timer
  function stopTimer() {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }

  function handleStart() {
    chunksRef.current = [];
    setElapsedSeconds(0);
    setIsRecording(true);
    setIsPaused(false);
    startTimeRef.current = Date.now();

    const recognition = createSpeechRecognition({
      onChunk: handleChunk,
      onError: (err) => {
        console.error('Speech recognition error:', err);
      },
      onEnd: () => {
        // Handled by stop
      },
    });

    recognitionRef.current = recognition;
    recognition.start();
    startTimer();
  }

  function handlePause() {
    if (isPaused) {
      // Resume
      setIsPaused(false);
      if (recognitionRef.current) {
        recognitionRef.current.resume();
      }
      startTimer();
    } else {
      // Pause
      setIsPaused(true);
      if (recognitionRef.current) {
        recognitionRef.current.pause();
      }
      stopTimer();
    }
  }

  function handleStop() {
    stopTimer();
    setIsRecording(false);
    setIsPaused(false);

    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }

    if (onRecordingComplete) {
      onRecordingComplete({
        chunks: chunksRef.current,
        durationSeconds: elapsedSeconds,
      });
    }
  }

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopTimer();
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };
  }, []);

  // Not yet started
  if (!isRecording) {
    return (
      <div className="flex flex-col items-center py-16">
        <button
          onClick={handleStart}
          className="btn-primary inline-flex items-center gap-2 touch-target"
        >
          Start Recording
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center py-16">
      {/* Recording indicator: pulsing red dot with glow */}
      <div className="flex items-center gap-2">
        <span className="relative flex h-3 w-3" style={{ filter: 'drop-shadow(0 0 8px rgba(239, 68, 68, 0.5))' }}>
          {!isPaused && (
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75" />
          )}
          <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500" />
        </span>
        <span className="text-xs font-medium tracking-widest uppercase text-red-400">
          {isPaused ? 'Paused' : 'Recording'}
        </span>
      </div>

      {/* Timer */}
      <div className="mt-6 font-mono text-3xl md:text-4xl font-bold text-white">
        {formatDuration(elapsedSeconds)}
      </div>

      {/* Controls */}
      <div className="mt-8 flex items-center gap-4">
        <button
          onClick={handlePause}
          className="btn-secondary inline-flex items-center gap-2 touch-target"
        >
          {isPaused ? (
            <>
              <Play size={20} strokeWidth={1.5} />
              Resume
            </>
          ) : (
            <>
              <Pause size={20} strokeWidth={1.5} />
              Pause
            </>
          )}
        </button>

        <button
          onClick={handleStop}
          className="bg-red-500 hover:bg-red-400 text-white text-sm font-medium px-5 py-2.5 rounded-lg transition-all duration-200 shadow-lg shadow-red-500/25 inline-flex items-center gap-2 touch-target"
        >
          <Square size={20} strokeWidth={1.5} />
          Stop
        </button>
      </div>
    </div>
  );
}
