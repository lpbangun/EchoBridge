import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createSpeechRecognition } from '../../lib/speechRecognition.js';

// ---------------------------------------------------------------------------
// Mock SpeechRecognition
// ---------------------------------------------------------------------------
class MockSpeechRecognition {
  constructor() {
    this.continuous = false;
    this.interimResults = false;
    this.lang = '';
    this.onresult = null;
    this.onerror = null;
    this.onend = null;
    MockSpeechRecognition.instances.push(this);
  }

  start() {
    MockSpeechRecognition.startCalls++;
  }

  stop() {
    MockSpeechRecognition.stopCalls++;
    // Simulate the browser behavior: stopping triggers onend
    if (this.onend) this.onend();
  }

  // Test helpers
  simulateResult(transcript, isFinal, resultIndex = 0) {
    if (this.onresult) {
      const result = {
        0: { transcript },
        isFinal,
        length: 1,
      };
      this.onresult({
        resultIndex,
        results: {
          [resultIndex]: result,
          length: resultIndex + 1,
        },
      });
    }
  }

  simulateError(errorType) {
    if (this.onerror) {
      this.onerror({ error: errorType });
    }
  }

  simulateEnd() {
    if (this.onend) this.onend();
  }
}

// Static tracking
MockSpeechRecognition.instances = [];
MockSpeechRecognition.startCalls = 0;
MockSpeechRecognition.stopCalls = 0;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('createSpeechRecognition', () => {
  let savedSpeechRecognition;
  let savedWebkitSpeechRecognition;

  beforeEach(() => {
    // Save original values
    savedSpeechRecognition = window.SpeechRecognition;
    savedWebkitSpeechRecognition = window.webkitSpeechRecognition;

    // Install mock
    window.SpeechRecognition = MockSpeechRecognition;
    window.webkitSpeechRecognition = undefined;

    // Reset tracking
    MockSpeechRecognition.instances = [];
    MockSpeechRecognition.startCalls = 0;
    MockSpeechRecognition.stopCalls = 0;
  });

  afterEach(() => {
    // Restore originals
    window.SpeechRecognition = savedSpeechRecognition;
    window.webkitSpeechRecognition = savedWebkitSpeechRecognition;
    vi.restoreAllMocks();
  });

  // -------------------------------------------------------------------------
  // isSupported
  // -------------------------------------------------------------------------
  describe('isSupported', () => {
    it('is true when SpeechRecognition exists', () => {
      const sr = createSpeechRecognition({ onChunk: vi.fn() });
      expect(sr.isSupported).toBe(true);
    });

    it('is true when only webkitSpeechRecognition exists', () => {
      window.SpeechRecognition = undefined;
      window.webkitSpeechRecognition = MockSpeechRecognition;

      const sr = createSpeechRecognition({ onChunk: vi.fn() });
      expect(sr.isSupported).toBe(true);
    });

    it('is false when SpeechRecognition does not exist', () => {
      window.SpeechRecognition = undefined;
      window.webkitSpeechRecognition = undefined;

      const sr = createSpeechRecognition({ onChunk: vi.fn() });
      expect(sr.isSupported).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // start
  // -------------------------------------------------------------------------
  describe('start', () => {
    it('creates a recognition instance and calls start()', () => {
      const sr = createSpeechRecognition({ onChunk: vi.fn() });
      sr.start();

      expect(MockSpeechRecognition.instances.length).toBe(1);
      expect(MockSpeechRecognition.startCalls).toBe(1);
    });

    it('configures recognition with correct settings', () => {
      const sr = createSpeechRecognition({ onChunk: vi.fn(), lang: 'fr-FR' });
      sr.start();

      const instance = MockSpeechRecognition.instances[0];
      expect(instance.continuous).toBe(true);
      expect(instance.interimResults).toBe(true);
      expect(instance.lang).toBe('fr-FR');
    });

    it('uses default language en-US', () => {
      const sr = createSpeechRecognition({ onChunk: vi.fn() });
      sr.start();

      const instance = MockSpeechRecognition.instances[0];
      expect(instance.lang).toBe('en-US');
    });

    it('calls onError when speech recognition is not supported', () => {
      window.SpeechRecognition = undefined;
      window.webkitSpeechRecognition = undefined;

      const onError = vi.fn();
      const sr = createSpeechRecognition({ onChunk: vi.fn(), onError });
      sr.start();

      expect(onError).toHaveBeenCalledTimes(1);
      expect(onError.mock.calls[0][0]).toBeInstanceOf(Error);
      expect(onError.mock.calls[0][0].message).toMatch(/not supported/);
    });
  });

  // -------------------------------------------------------------------------
  // stop
  // -------------------------------------------------------------------------
  describe('stop', () => {
    it('calls recognition.stop() and triggers onEnd', () => {
      const onEnd = vi.fn();
      const sr = createSpeechRecognition({ onChunk: vi.fn(), onEnd });
      sr.start();

      sr.stop();

      expect(MockSpeechRecognition.stopCalls).toBe(1);
      expect(onEnd).toHaveBeenCalledTimes(1);
    });
  });

  // -------------------------------------------------------------------------
  // pause / resume
  // -------------------------------------------------------------------------
  describe('pause', () => {
    it('stops recognition but does not trigger onEnd', () => {
      const onEnd = vi.fn();
      const sr = createSpeechRecognition({ onChunk: vi.fn(), onEnd });
      sr.start();

      sr.pause();

      expect(MockSpeechRecognition.stopCalls).toBe(1);
      // onEnd should NOT be called because pause sets paused=true,
      // and the onend handler sees shouldRestart=true and paused=true
      // so it does not fire onEnd
      expect(onEnd).not.toHaveBeenCalled();
    });
  });

  describe('resume', () => {
    it('restarts recognition after pause', () => {
      const sr = createSpeechRecognition({ onChunk: vi.fn() });
      sr.start();
      expect(MockSpeechRecognition.startCalls).toBe(1);

      sr.pause();
      sr.resume();

      // resume calls recognition.start() again
      expect(MockSpeechRecognition.startCalls).toBe(2);
    });

    it('does nothing when not supported', () => {
      window.SpeechRecognition = undefined;
      window.webkitSpeechRecognition = undefined;

      const sr = createSpeechRecognition({ onChunk: vi.fn() });
      // Should not throw
      sr.resume();
      expect(MockSpeechRecognition.startCalls).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // onChunk
  // -------------------------------------------------------------------------
  describe('onChunk', () => {
    it('is called with correct shape on recognition result', () => {
      const onChunk = vi.fn();
      const sr = createSpeechRecognition({ onChunk });
      sr.start();

      const instance = MockSpeechRecognition.instances[0];
      instance.simulateResult('hello world', true, 0);

      expect(onChunk).toHaveBeenCalledTimes(1);
      const chunk = onChunk.mock.calls[0][0];
      expect(chunk).toHaveProperty('text', 'hello world');
      expect(chunk).toHaveProperty('isFinal', true);
      expect(chunk).toHaveProperty('timestampMs');
      expect(typeof chunk.timestampMs).toBe('number');
      expect(chunk.timestampMs).toBeGreaterThanOrEqual(0);
    });

    it('receives interim results with isFinal=false', () => {
      const onChunk = vi.fn();
      const sr = createSpeechRecognition({ onChunk });
      sr.start();

      const instance = MockSpeechRecognition.instances[0];
      instance.simulateResult('partial', false, 0);

      expect(onChunk).toHaveBeenCalledTimes(1);
      expect(onChunk.mock.calls[0][0].isFinal).toBe(false);
    });

    it('is not called when paused', () => {
      const onChunk = vi.fn();
      const sr = createSpeechRecognition({ onChunk });
      sr.start();
      sr.pause();

      const instance = MockSpeechRecognition.instances[0];
      // Even if a result fires, it should be ignored when paused
      // We need to simulate the result without going through stop's onend
      // Directly call onresult
      if (instance.onresult) {
        instance.onresult({
          resultIndex: 0,
          results: {
            0: { 0: { transcript: 'should be ignored' }, isFinal: true, length: 1 },
            length: 1,
          },
        });
      }
      expect(onChunk).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Error handling
  // -------------------------------------------------------------------------
  describe('error handling', () => {
    it('non-fatal errors (no-speech) do not call onError', () => {
      const onError = vi.fn();
      const sr = createSpeechRecognition({ onChunk: vi.fn(), onError });
      sr.start();

      const instance = MockSpeechRecognition.instances[0];
      instance.simulateError('no-speech');

      expect(onError).not.toHaveBeenCalled();
    });

    it('non-fatal errors (aborted) do not call onError', () => {
      const onError = vi.fn();
      const sr = createSpeechRecognition({ onChunk: vi.fn(), onError });
      sr.start();

      const instance = MockSpeechRecognition.instances[0];
      instance.simulateError('aborted');

      expect(onError).not.toHaveBeenCalled();
    });

    it('fatal errors call onError', () => {
      const onError = vi.fn();
      const sr = createSpeechRecognition({ onChunk: vi.fn(), onError });
      sr.start();

      const instance = MockSpeechRecognition.instances[0];
      instance.simulateError('not-allowed');

      expect(onError).toHaveBeenCalledTimes(1);
      expect(onError.mock.calls[0][0]).toEqual({ error: 'not-allowed' });
    });

    it('other fatal errors like network also call onError', () => {
      const onError = vi.fn();
      const sr = createSpeechRecognition({ onChunk: vi.fn(), onError });
      sr.start();

      const instance = MockSpeechRecognition.instances[0];
      instance.simulateError('network');

      expect(onError).toHaveBeenCalledTimes(1);
      expect(onError.mock.calls[0][0]).toEqual({ error: 'network' });
    });
  });
});
