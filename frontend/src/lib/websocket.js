/**
 * WebSocket client with auto-reconnect, exponential backoff, and replay.
 * Messages are JSON-parsed before being passed to onMessage.
 * Tracks the highest _seq seen; on reconnect appends ?last_seq=<n> to replay missed messages.
 * Responds to server pings with pongs for keepalive.
 *
 * Returns { send(data), close(), readyState, lastSeq }.
 */
export function createWebSocket(url, { onMessage, onOpen, onClose, onError }) {
  let ws = null;
  let reconnectTimer = null;
  let reconnectAttempts = 0;
  let intentionallyClosed = false;
  let lastSeq = 0;

  const MAX_RECONNECT_DELAY = 30000; // 30 seconds
  const BASE_DELAY = 1000; // 1 second

  function getReconnectDelay() {
    // Exponential backoff: 1s, 2s, 4s, 8s, 16s, 30s (capped)
    const delay = Math.min(BASE_DELAY * Math.pow(2, reconnectAttempts), MAX_RECONNECT_DELAY);
    return delay;
  }

  function buildReconnectUrl() {
    if (lastSeq === 0) return url;
    const separator = url.includes('?') ? '&' : '?';
    return `${url}${separator}last_seq=${lastSeq}`;
  }

  function connect(connectUrl) {
    intentionallyClosed = false;

    try {
      ws = new WebSocket(connectUrl || url);
    } catch (err) {
      if (onError) onError(err);
      scheduleReconnect();
      return;
    }

    ws.onopen = (event) => {
      reconnectAttempts = 0;
      if (onOpen) onOpen(event);
    };

    ws.onmessage = (event) => {
      let data;
      try {
        data = JSON.parse(event.data);
      } catch {
        data = event.data;
      }

      // Track sequence numbers for reconnect replay
      if (data && typeof data === 'object' && typeof data._seq === 'number') {
        if (data._seq > lastSeq) {
          lastSeq = data._seq;
        }
      }

      // Respond to server pings with pongs
      if (data && typeof data === 'object' && data.type === 'ping') {
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'pong' }));
        }
        return; // Don't pass pings to the application
      }

      if (onMessage) onMessage(data);
    };

    ws.onclose = (event) => {
      if (onClose) onClose(event);

      if (!intentionallyClosed) {
        scheduleReconnect();
      }
    };

    ws.onerror = (event) => {
      if (onError) onError(event);
    };
  }

  function scheduleReconnect() {
    if (intentionallyClosed) return;

    const delay = getReconnectDelay();
    reconnectAttempts++;

    reconnectTimer = setTimeout(() => {
      connect(buildReconnectUrl());
    }, delay);
  }

  function send(data) {
    if (ws && ws.readyState === WebSocket.OPEN) {
      const payload = typeof data === 'string' ? data : JSON.stringify(data);
      ws.send(payload);
    }
  }

  function close() {
    intentionallyClosed = true;
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    if (ws) {
      ws.close();
    }
  }

  // Start the initial connection
  connect();

  return {
    send,
    close,
    get readyState() {
      return ws ? ws.readyState : WebSocket.CLOSED;
    },
    get lastSeq() {
      return lastSeq;
    },
  };
}
