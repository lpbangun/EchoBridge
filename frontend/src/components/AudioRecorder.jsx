import { useState, useEffect, useRef, useCallback } from 'react';
import { Pause, Play, Square } from 'lucide-react';
import { createSpeechRecognition } from '../lib/speechRecognition';
import { formatDuration } from '../lib/utils';

/**
 * Recording component using the browser Web Speech API.
 * Shows:
 *  - Pulsing red recording dot (the ONLY rounded element per DESIGN.md)
 *  - Timer display (font-mono text-2xl font-bold)
 *  - Pause / Resume / Stop buttons
 *
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
          className="bg-neutral-900 text-white text-sm font-medium px-5 py-2.5 hover:bg-neutral-800 transition-colors"
        >
          Start Recording
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center py-16">
      {/* Recording indicator: pulsing red dot -- ONLY rounded element */}
      <div className="flex items-center gap-2">
        <span className="relative flex h-3 w-3">
          {!isPaused && (
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75" />
          )}
          <span className="relative inline-flex rounded-full h-3 w-3 bg-red-600" />
        </span>
        <span className="text-xs font-medium tracking-widest uppercase text-red-600">
          {isPaused ? 'Paused' : 'Recording'}
        </span>
      </div>

      {/* Timer */}
      <div className="mt-6 font-mono text-2xl font-bold text-neutral-900">
        {formatDuration(elapsedSeconds)}
      </div>

      {/* Controls */}
      <div className="mt-8 flex items-center gap-4">
        <button
          onClick={handlePause}
          className="bg-white text-neutral-700 text-sm font-medium px-5 py-2.5 border border-neutral-200 hover:border-neutral-400 transition-colors flex items-center gap-2"
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
          className="bg-white text-neutral-700 text-sm font-medium px-5 py-2.5 border border-neutral-200 hover:border-neutral-400 transition-colors flex items-center gap-2"
        >
          <Square size={20} strokeWidth={1.5} />
          Stop
        </button>
      </div>
    </div>
  );
}
