const baseUrl = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

export async function apiRequest(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    ...options,
  });

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const message = data?.error?.message || data?.error?.code || `请求失败：${response.status}`;
    throw new Error(message);
  }

  return data;
}

export function listSessions() {
  return apiRequest('/api/sessions');
}

export function createSession(name) {
  return apiRequest('/api/sessions', {
    method: 'POST',
    body: JSON.stringify({ name }),
  });
}

export function renameSession(id, name) {
  return apiRequest(`/api/sessions/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ name }),
  });
}

export function deleteSession(id) {
  return apiRequest(`/api/sessions/${id}`, {
    method: 'DELETE',
  });
}

export function listMessages(sessionId) {
  return apiRequest(`/api/sessions/${sessionId}/messages`);
}

export function sendMessage({ sessionId, message, model }) {
  return apiRequest(`/api/sessions/${sessionId}/messages`, {
    method: 'POST',
    body: JSON.stringify({ message, model }),
  });
}

export function getSettings() {
  return apiRequest('/api/settings');
}

export function updateSettings(settings) {
  return apiRequest('/api/settings', {
    method: 'PUT',
    body: JSON.stringify({ settings }),
  });
}

export function getModels() {
  return apiRequest('/api/models');
}
