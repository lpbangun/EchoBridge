import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createWebSocket } from '../../lib/websocket.js';

// ---------------------------------------------------------------------------
// Mock WebSocket
// ---------------------------------------------------------------------------
class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  constructor(url) {
    this.url = url;
    this.readyState = MockWebSocket.CONNECTING;
    this.onopen = null;
    this.onmessage = null;
    this.onclose = null;
    this.onerror = null;
    MockWebSocket.instances.push(this);
  }

  send(data) {
    MockWebSocket.sentMessages.push(data);
  }

  close() {
    this.readyState = MockWebSocket.CLOSED;
    if (this.onclose) this.onclose({});
  }

  // Test helpers
  simulateOpen() {
    this.readyState = MockWebSocket.OPEN;
    if (this.onopen) this.onopen({});
  }

  simulateMessage(data) {
    if (this.onmessage) this.onmessage({ data: JSON.stringify(data) });
  }

  simulateRawMessage(raw) {
    if (this.onmessage) this.onmessage({ data: raw });
  }

  simulateClose() {
    this.readyState = MockWebSocket.CLOSED;
    if (this.onclose) this.onclose({});
  }

  simulateError(err) {
    if (this.onerror) this.onerror(err);
  }
}

// Static tracking arrays
MockWebSocket.instances = [];
MockWebSocket.sentMessages = [];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('createWebSocket', () => {
  let originalWebSocket;

  beforeEach(() => {
    originalWebSocket = globalThis.WebSocket;
    globalThis.WebSocket = MockWebSocket;
    MockWebSocket.instances = [];
    MockWebSocket.sentMessages = [];
  });

  afterEach(() => {
    globalThis.WebSocket = originalWebSocket;
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('creates a WebSocket with the correct URL', () => {
    const client = createWebSocket('ws://localhost:8000/ws', {});
    expect(MockWebSocket.instances.length).toBe(1);
    expect(MockWebSocket.instances[0].url).toBe('ws://localhost:8000/ws');
    client.close();
  });

  it('calls onOpen when connection opens', () => {
    const onOpen = vi.fn();
    const client = createWebSocket('ws://localhost:8000/ws', { onOpen });

    const ws = MockWebSocket.instances[0];
    ws.simulateOpen();

    expect(onOpen).toHaveBeenCalledTimes(1);
    client.close();
  });

  it('calls onMessage with parsed JSON data', () => {
    const onMessage = vi.fn();
    const client = createWebSocket('ws://localhost:8000/ws', { onMessage });

    const ws = MockWebSocket.instances[0];
    ws.simulateOpen();
    ws.simulateMessage({ type: 'transcript', text: 'hello' });

    expect(onMessage).toHaveBeenCalledTimes(1);
    expect(onMessage).toHaveBeenCalledWith({ type: 'transcript', text: 'hello' });
    client.close();
  });

  it('handles non-JSON messages gracefully', () => {
    const onMessage = vi.fn();
    const client = createWebSocket('ws://localhost:8000/ws', { onMessage });

    const ws = MockWebSocket.instances[0];
    ws.simulateOpen();
    ws.simulateRawMessage('not-json-data');

    expect(onMessage).toHaveBeenCalledTimes(1);
    expect(onMessage).toHaveBeenCalledWith('not-json-data');
    client.close();
  });

  it('calls onClose when connection closes', () => {
    const onClose = vi.fn();
    const client = createWebSocket('ws://localhost:8000/ws', { onClose });

    const ws = MockWebSocket.instances[0];
    ws.simulateOpen();
    client.close();

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onError when an error occurs', () => {
    const onError = vi.fn();
    const client = createWebSocket('ws://localhost:8000/ws', { onError });

    const ws = MockWebSocket.instances[0];
    const errorEvent = new Error('connection failed');
    ws.simulateError(errorEvent);

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(errorEvent);
    client.close();
  });

  it('send() sends stringified JSON when connection is open', () => {
    const client = createWebSocket('ws://localhost:8000/ws', {});

    const ws = MockWebSocket.instances[0];
    ws.simulateOpen();

    client.send({ action: 'start' });
    expect(MockWebSocket.sentMessages).toHaveLength(1);
    expect(MockWebSocket.sentMessages[0]).toBe('{"action":"start"}');
    client.close();
  });

  it('send() sends strings as-is when connection is open', () => {
    const client = createWebSocket('ws://localhost:8000/ws', {});

    const ws = MockWebSocket.instances[0];
    ws.simulateOpen();

    client.send('raw-string');
    expect(MockWebSocket.sentMessages).toHaveLength(1);
    expect(MockWebSocket.sentMessages[0]).toBe('raw-string');
    client.close();
  });

  it('send() does nothing when connection is not open', () => {
    const client = createWebSocket('ws://localhost:8000/ws', {});

    // Connection is still CONNECTING, not OPEN
    client.send({ action: 'start' });
    expect(MockWebSocket.sentMessages).toHaveLength(0);
    client.close();
  });

  it('readyState getter returns WebSocket state', () => {
    const client = createWebSocket('ws://localhost:8000/ws', {});

    const ws = MockWebSocket.instances[0];
    expect(client.readyState).toBe(MockWebSocket.CONNECTING);

    ws.simulateOpen();
    expect(client.readyState).toBe(MockWebSocket.OPEN);

    client.close();
    expect(client.readyState).toBe(MockWebSocket.CLOSED);
  });

  it('close() stops reconnection and closes WebSocket', () => {
    vi.useFakeTimers();

    const client = createWebSocket('ws://localhost:8000/ws', {});

    const ws = MockWebSocket.instances[0];
    ws.simulateOpen();

    // Intentionally close
    client.close();

    // Advance timers well past any reconnect delay
    vi.advanceTimersByTime(60000);

    // Should not have created any new WebSocket instances (only the original one)
    expect(MockWebSocket.instances.length).toBe(1);
  });

  it('auto-reconnects on unexpected close', () => {
    vi.useFakeTimers();

    const onClose = vi.fn();
    const client = createWebSocket('ws://localhost:8000/ws', { onClose });

    const ws = MockWebSocket.instances[0];
    ws.simulateOpen();

    // Simulate an unexpected close (server drops connection)
    ws.simulateClose();
    expect(onClose).toHaveBeenCalledTimes(1);

    // Only one instance so far (the reconnect is scheduled, not immediate)
    expect(MockWebSocket.instances.length).toBe(1);

    // Advance past the first reconnect delay (1 second base)
    vi.advanceTimersByTime(1500);

    // A new WebSocket should have been created
    expect(MockWebSocket.instances.length).toBe(2);
    expect(MockWebSocket.instances[1].url).toBe('ws://localhost:8000/ws');

    // Clean up
    client.close();
  });

  it('uses exponential backoff for reconnect attempts', () => {
    vi.useFakeTimers();

    const client = createWebSocket('ws://localhost:8000/ws', {});

    const ws1 = MockWebSocket.instances[0];
    ws1.simulateOpen();

    // First unexpected close
    ws1.simulateClose();

    // After 500ms: not yet reconnected (base delay is 1000ms)
    vi.advanceTimersByTime(500);
    expect(MockWebSocket.instances.length).toBe(1);

    // After 1000ms total: reconnected
    vi.advanceTimersByTime(600);
    expect(MockWebSocket.instances.length).toBe(2);

    // Second unexpected close
    const ws2 = MockWebSocket.instances[1];
    ws2.simulateClose();

    // Second reconnect delay should be ~2000ms
    vi.advanceTimersByTime(1500);
    expect(MockWebSocket.instances.length).toBe(2); // not yet

    vi.advanceTimersByTime(600);
    expect(MockWebSocket.instances.length).toBe(3);

    client.close();
  });

  it('resets reconnect attempts on successful connection', () => {
    vi.useFakeTimers();

    const client = createWebSocket('ws://localhost:8000/ws', {});

    const ws1 = MockWebSocket.instances[0];
    ws1.simulateOpen();
    ws1.simulateClose();

    // Reconnect after 1s
    vi.advanceTimersByTime(1100);
    expect(MockWebSocket.instances.length).toBe(2);

    // Open successfully - this resets the counter
    const ws2 = MockWebSocket.instances[1];
    ws2.simulateOpen();
    ws2.simulateClose();

    // Next reconnect should be 1s again (reset), not 2s
    vi.advanceTimersByTime(1100);
    expect(MockWebSocket.instances.length).toBe(3);

    client.close();
  });
});
