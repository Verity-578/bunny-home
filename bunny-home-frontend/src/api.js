const baseUrl = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
const passwordKey = 'bunny_access_password';

export function getStoredPassword() {
  return sessionStorage.getItem(passwordKey) || '';
}

export function storePassword(password) {
  sessionStorage.setItem(passwordKey, password);
}

export function getAuthStatus() {
  const password = getStoredPassword();
  return apiRequest('/api/auth/status', {
    headers: password ? { 'x-access-password': password } : {},
  });
}

export function verifyPassword(password) {
  return apiRequest('/api/auth/verify', {
    method: 'POST',
    headers: { 'x-access-password': password },
    body: JSON.stringify({ password }),
  });
}

export async function apiRequest(path, options = {}) {
  const password = getStoredPassword();
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(password ? { 'x-access-password': password } : {}),
      ...options.headers,
    },
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

export function regenerateMessage({ sessionId, model }) {
  return apiRequest(`/api/sessions/${sessionId}/regenerate`, {
    method: 'POST',
    body: JSON.stringify({ model }),
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

export function listFavorites(sessionId = null) {
  const query = sessionId ? `?sessionId=${encodeURIComponent(sessionId)}` : '';
  return apiRequest(`/api/favorites${query}`);
}

export function addFavorite({ sessionId, messageId, content }) {
  return apiRequest('/api/favorites', {
    method: 'POST',
    body: JSON.stringify({ sessionId, messageId, content }),
  });
}

export function deleteFavorite(id) {
  return apiRequest(`/api/favorites/${id}`, {
    method: 'DELETE',
  });
}
