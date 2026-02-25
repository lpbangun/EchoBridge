/**
 * Wrapper for the browser Web Speech API.
 * Returns a controller object with start/stop/pause/resume and an isSupported flag.
 *
 * onChunk receives { text, isFinal, timestampMs } for each recognition result.
 * onError receives the error event.
 * onEnd fires when recognition stops.
 */
export function createSpeechRecognition({ onChunk, onError, onEnd, lang = 'en-US' }) {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const isSupported = Boolean(SpeechRecognition);

  let recognition = null;
  let startTime = 0;
  let paused = false;
  let shouldRestart = false;

  function initRecognition() {
    recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = lang;

    recognition.onresult = (event) => {
      if (paused) return;

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (onChunk) {
          onChunk({
            text: result[0].transcript,
            isFinal: result.isFinal,
            timestampMs: Date.now() - startTime,
          });
        }
      }
    };

    recognition.onerror = (event) => {
      // 'no-speech' and 'aborted' are not fatal; recognition can continue.
      if (event.error === 'no-speech' || event.error === 'aborted') {
        return;
      }
      if (onError) {
        onError(event);
      }
    };

    recognition.onend = () => {
      // The Web Speech API can stop unexpectedly. Restart if we haven't
      // explicitly stopped.
      if (shouldRestart && !paused) {
        try {
          recognition.start();
        } catch {
          // Already started or disposed
        }
        return;
      }

      if (!shouldRestart && onEnd) {
        onEnd();
      }
    };
  }

  function start() {
    if (!isSupported) {
      if (onError) {
        onError(new Error('Speech recognition is not supported in this browser.'));
      }
      return;
    }

    startTime = Date.now();
    paused = false;
    shouldRestart = true;

    initRecognition();

    try {
      recognition.start();
    } catch {
      // Already started
    }
  }

  function stop() {
    shouldRestart = false;
    paused = false;
    if (recognition) {
      try {
        recognition.stop();
      } catch {
        // Already stopped
      }
    }
  }

  function pause() {
    paused = true;
    if (recognition) {
      try {
        recognition.stop();
      } catch {
        // Already stopped
      }
    }
  }

  function resume() {
    if (!isSupported) return;
    paused = false;
    shouldRestart = true;

    // Create a fresh instance — the old one is in a terminal state after stop()
    initRecognition();

    try {
      recognition.start();
    } catch {
      // Already started
    }
  }

  return { start, stop, pause, resume, isSupported };
}
