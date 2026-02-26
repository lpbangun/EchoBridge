/**
 * EchoBridge API client.
 * All functions use relative URLs (/api/...) and return parsed JSON.
 * Errors are thrown with status and message information.
 */

const BASE = '/api';

async function request(path, options = {}) {
  const url = `${BASE}${path}`;
  const res = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    ...options,
  });

  if (!res.ok) {
    let detail = '';
    try {
      const body = await res.json();
      detail = body.detail || body.message || JSON.stringify(body);
    } catch {
      detail = res.statusText;
    }
    throw new Error(`${res.status} ${detail}`);
  }

  // Some endpoints return no content
  if (res.status === 204) {
    return null;
  }

  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return res.json();
  }

  return res.text();
}

// --- Sessions ---

export async function createSession(data) {
  return request('/sessions', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function listSessions({ context, series_id, limit, offset } = {}) {
  const params = new URLSearchParams();
  if (context) params.set('context', context);
  if (series_id) params.set('series_id', series_id);
  if (limit != null) params.set('limit', String(limit));
  if (offset != null) params.set('offset', String(offset));
  const qs = params.toString();
  return request(`/sessions${qs ? `?${qs}` : ''}`);
}

export async function getSession(id) {
  return request(`/sessions/${id}`);
}

export async function updateSession(id, data) {
  return request(`/sessions/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export async function deleteSession(id) {
  return request(`/sessions/${id}`, {
    method: 'DELETE',
  });
}

// --- Transcription ---

export async function uploadAudio(sessionId, file) {
  const formData = new FormData();
  formData.append('audio', file);

  const res = await fetch(`${BASE}/sessions/${sessionId}/audio`, {
    method: 'POST',
    body: formData,
    // Do not set Content-Type; browser sets multipart boundary automatically
  });

  if (!res.ok) {
    let detail = '';
    try {
      const body = await res.json();
      detail = body.detail || body.message || JSON.stringify(body);
    } catch {
      detail = res.statusText;
    }
    throw new Error(`${res.status} ${detail}`);
  }

  return res.json();
}

export async function submitTranscript(sessionId, transcript, durationSeconds, append = false) {
  return request(`/sessions/${sessionId}/transcript`, {
    method: 'POST',
    body: JSON.stringify({ transcript, duration_seconds: durationSeconds, append }),
  });
}

// --- Interpretation ---

export async function interpretSession(sessionId, data) {
  return request(`/sessions/${sessionId}/interpret`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function getInterpretations(sessionId) {
  return request(`/sessions/${sessionId}/interpretations`);
}

export async function updateInterpretation(sessionId, interpretationId, data) {
  return request(`/sessions/${sessionId}/interpretations/${interpretationId}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

// --- Export ---

export async function exportMarkdown(sessionId) {
  const res = await fetch(`${BASE}/sessions/${sessionId}/export/md`);
  if (!res.ok) {
    let detail = '';
    try {
      const body = await res.json();
      detail = body.detail || body.message || JSON.stringify(body);
    } catch {
      detail = res.statusText;
    }
    throw new Error(`${res.status} ${detail}`);
  }
  return res.text();
}

export async function saveExport(sessionId) {
  return request(`/sessions/${sessionId}/export/save`, {
    method: 'POST',
  });
}

// --- Settings ---

export async function getSettings() {
  return request('/settings');
}

export async function updateSettings(data) {
  return request('/settings', {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function createApiKey(name) {
  return request('/settings/api-keys', {
    method: 'POST',
    body: JSON.stringify({ name }),
  });
}

export async function listApiKeys() {
  return request('/settings/api-keys');
}

export async function deleteApiKey(id) {
  return request(`/settings/api-keys/${id}`, {
    method: 'DELETE',
  });
}

// --- Lenses & Sockets ---

export async function listLenses() {
  return request('/lenses');
}

export async function listSockets() {
  return request('/sockets');
}

export async function runAgentAnalysis(sessionId, socketIds = []) {
  return request(`/sessions/${sessionId}/agent-analyze`, {
    method: 'POST',
    body: JSON.stringify({ socket_ids: socketIds }),
  });
}

// --- Search ---

export async function searchSessions(query) {
  const params = new URLSearchParams({ q: query });
  return request(`/search?${params.toString()}`);
}

// --- Rooms ---

export async function createRoom(data) {
  return request('/rooms', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function joinRoom(data) {
  return request('/rooms/join', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function getRoom(code) {
  return request(`/rooms/${code}`);
}

export async function startRoom(code) {
  return request(`/rooms/${code}/start`, {
    method: 'POST',
  });
}

export async function stopRoom(code) {
  return request(`/rooms/${code}/stop`, {
    method: 'POST',
  });
}

export async function kickAgent(code, agentName) {
  return request(`/rooms/${code}/kick`, {
    method: 'POST',
    body: JSON.stringify({ agent_name: agentName }),
  });
}

// --- Series ---

export async function createSeries(data) {
  return request('/series', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function listSeries() {
  return request('/series');
}

export async function getSeries(id) {
  return request(`/series/${id}`);
}

export async function updateSeries(id, data) {
  return request(`/series/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export async function deleteSeries(id) {
  return request(`/series/${id}`, {
    method: 'DELETE',
  });
}

export async function getSeriesMemory(id) {
  return request(`/series/${id}/memory`);
}

export async function refreshSeriesMemory(id) {
  return request(`/series/${id}/memory/refresh`, {
    method: 'POST',
  });
}

export async function listSeriesSessions(id) {
  return request(`/series/${id}/sessions`);
}

export async function addSessionToSeries(seriesId, sessionId) {
  return request(`/series/${seriesId}/sessions/${sessionId}`, {
    method: 'POST',
  });
}

export async function removeSessionFromSeries(seriesId, sessionId) {
  return request(`/series/${seriesId}/sessions/${sessionId}`, {
    method: 'DELETE',
  });
}

// --- Chat ---

export async function sendChatMessage({ conversationId, message, sessionId, model } = {}) {
  return request('/chat', {
    method: 'POST',
    body: JSON.stringify({
      conversation_id: conversationId || null,
      message,
      session_id: sessionId || null,
      model: model || null,
    }),
  });
}

export async function getConversations(sessionId) {
  const params = new URLSearchParams();
  if (sessionId) params.set('session_id', sessionId);
  const qs = params.toString();
  return request(`/chat/conversations${qs ? `?${qs}` : ''}`);
}

export async function getConversation(id) {
  return request(`/chat/conversations/${id}`);
}

export async function deleteConversation(id) {
  return request(`/chat/conversations/${id}`, {
    method: 'DELETE',
  });
}

// --- Skill ---

export async function getSkillMd() {
  const res = await fetch(`${BASE}/skill`);
  if (!res.ok) {
    let detail = res.statusText;
    try { detail = (await res.json()).detail || detail; } catch {}
    throw new Error(`${res.status}: ${detail}`);
  }
  return res.text();
}

// --- Cloud Storage ---

export async function testCloudConnection() {
  return request('/storage/test', {
    method: 'POST',
  });
}

export async function getStorageStatus() {
  return request('/storage/status');
}

// --- Agent Meetings ---

export async function createAgentMeeting(data) {
  return request('/rooms/meeting', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function getAgentMeeting(code) {
  return request(`/rooms/${code}/meeting`);
}

export async function startAgentMeeting(code) {
  return request(`/rooms/${code}/meeting/start`, {
    method: 'POST',
  });
}

export async function stopAgentMeeting(code) {
  return request(`/rooms/${code}/meeting/stop`, {
    method: 'POST',
  });
}

export async function pauseAgentMeeting(code) {
  return request(`/rooms/${code}/meeting/pause`, {
    method: 'POST',
  });
}

export async function resumeAgentMeeting(code) {
  return request(`/rooms/${code}/meeting/resume`, {
    method: 'POST',
  });
}

export async function sendDirective(code, text, fromName) {
  return request(`/rooms/${code}/meeting/directive`, {
    method: 'POST',
    body: JSON.stringify({ text, from_name: fromName }),
  });
}

export async function sendMeetingMessage(code, text, fromName) {
  return request(`/rooms/${code}/meeting/message`, {
    method: 'POST',
    body: JSON.stringify({ text, from_name: fromName }),
  });
}

export async function getMeetingMessages(code, afterSequence = 0) {
  return request(`/rooms/${code}/meeting/messages?after_sequence=${afterSequence}`);
}

export async function getMeetingState(code) {
  return request(`/rooms/${code}/meeting/state`);
}

// --- Invites ---

export async function createInvite(label = '') {
  return request('/invites', {
    method: 'POST',
    body: JSON.stringify({ label }),
  });
}

export async function listInvites() {
  return request('/invites');
}

export async function revokeInvite(id) {
  return request(`/invites/${id}`, {
    method: 'DELETE',
  });
}

export async function previewInvite(token) {
  return request(`/invites/${token}/preview`);
}

export async function claimInvite(token, agentName) {
  return request(`/invites/${token}/claim`, {
    method: 'POST',
    body: JSON.stringify({ agent_name: agentName }),
  });
}

// --- Agent Wall ---

export async function getWallFeed(limit = 50, offset = 0) {
  return request(`/wall?limit=${limit}&offset=${offset}`);
}

export async function getWallAgents() {
  return request('/wall/agents');
}

export async function getWallReplies(postId) {
  return request(`/wall/${postId}/replies`);
}
