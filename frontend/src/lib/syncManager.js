/**
 * Sync manager: uploads pending offline recordings when back online.
 * Watches for online events and processes the IndexedDB queue.
 */

import { getPendingRecordings, deletePendingRecording } from './offlineStorage';
import { submitTranscript } from './api';

let isSyncing = false;
let listeners = [];

/**
 * Subscribe to sync status changes.
 * Callback receives { syncing: boolean, pending: number, lastError: string|null }
 */
export function onSyncStatusChange(callback) {
  listeners.push(callback);
  return () => {
    listeners = listeners.filter((l) => l !== callback);
  };
}

function notifyListeners(status) {
  listeners.forEach((cb) => cb(status));
}

/**
 * Attempt to sync all pending recordings.
 * Processes queue one by one, removing successfully uploaded items.
 */
export async function syncPendingRecordings() {
  if (isSyncing) return;
  if (!navigator.onLine) return;

  isSyncing = true;
  let lastError = null;

  try {
    const recordings = await getPendingRecordings();

    notifyListeners({ syncing: true, pending: recordings.length, lastError: null });

    for (const recording of recordings) {
      try {
        await submitTranscript(
          recording.sessionId,
          recording.transcript,
          recording.durationSeconds
        );
        await deletePendingRecording(recording.id);
      } catch (err) {
        lastError = err.message;
        // Continue trying other recordings
      }
    }

    const remaining = await getPendingRecordings();
    notifyListeners({ syncing: false, pending: remaining.length, lastError });
  } catch (err) {
    notifyListeners({ syncing: false, pending: -1, lastError: err.message });
  } finally {
    isSyncing = false;
  }
}

/**
 * Initialize sync manager — listens for online events.
 */
export function initSyncManager() {
  window.addEventListener('online', () => {
    syncPendingRecordings();
  });

  // Try syncing on startup if online
  if (navigator.onLine) {
    syncPendingRecordings();
  }
}
