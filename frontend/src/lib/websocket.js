/**
 * WebSocket client with auto-reconnect and exponential backoff.
 * Messages are JSON-parsed before being passed to onMessage.
 *
 * Returns { send(data), close(), readyState }.
 */
export function createWebSocket(url, { onMessage, onOpen, onClose, onError }) {
  let ws = null;
  let reconnectTimer = null;
  let reconnectAttempts = 0;
  let intentionallyClosed = false;

  const MAX_RECONNECT_DELAY = 30000; // 30 seconds
  const BASE_DELAY = 1000; // 1 second

  function getReconnectDelay() {
    // Exponential backoff: 1s, 2s, 4s, 8s, 16s, 30s (capped)
    const delay = Math.min(BASE_DELAY * Math.pow(2, reconnectAttempts), MAX_RECONNECT_DELAY);
    return delay;
  }

  function connect() {
    intentionallyClosed = false;

    try {
      ws = new WebSocket(url);
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
      connect();
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
  };
}
