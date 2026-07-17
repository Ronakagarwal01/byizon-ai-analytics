const isLocalBrowser = ['127.0.0.1', 'localhost'].includes(globalThis.location?.hostname);
const DEFAULT_ANALYTICS_API_BASE = isLocalBrowser
  ? `http://${globalThis.location?.hostname || '127.0.0.1'}:8000`
  : (globalThis.location?.origin || '');

export const UNIVERSAL_FILE_EXTENSIONS = [
  '.csv', '.tsv', '.xlsx', '.xls', '.json', '.pdf', '.txt', '.log', '.sql', '.sqlite', '.sqlite3', '.db',
];

function apiBase() {
  return (import.meta.env.VITE_ANALYTICS_API_BASE || DEFAULT_ANALYTICS_API_BASE).replace(/\/$/, '');
}

function apiFetch(url, options = {}) {
  return globalThis.fetch(url, { credentials: 'include', ...options });
}

export function isUniversalBackendFile(fileName = '') {
  const lower = fileName.toLowerCase();
  return UNIVERSAL_FILE_EXTENSIONS.some(ext => lower.endsWith(ext));
}

export function isLegacyBrowserFile(fileName = '') {
  return /\.(csv|xlsx|xls)$/i.test(fileName);
}

export async function checkAnalyticsBackend() {
  const response = await apiFetch(`${apiBase()}/api/health`, { method: 'GET' });
  if (!response.ok) throw new Error(`Analytics backend health check failed (${response.status}).`);
  return response.json();
}

export async function getAuthSession() {
  const response = await apiFetch(`${apiBase()}/api/auth/session`, { method: 'GET' });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.ok) {
    throw new Error(payload?.error || `Could not load the current account (${response.status}).`);
  }
  return payload;
}

export async function logoutWorkspace() {
  const current = await getAuthSession().catch(() => null);
  const response = await apiFetch(`${apiBase()}/api/auth/logout`, { method: 'POST' });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.ok) {
    throw new Error(payload?.error || `Could not sign out (${response.status}).`);
  }
  const workspaceId = current?.workspaceUserId;
  if (workspaceId) {
    localStorage.removeItem(`dsi_uploaded_data:${workspaceId}`);
    localStorage.removeItem(`dsi_chat_history_by_session:${workspaceId}`);
  }
  localStorage.removeItem('dsi_workspace_id');
  localStorage.removeItem('dsi_uploaded_data');
  localStorage.removeItem('dsi_chat_history_by_session');
  return payload;
}

export async function analyzeFileWithBackend(file) {
  const form = new FormData();
  form.append('file', file);

  const response = await apiFetch(`${apiBase()}/api/analyze`, {
    method: 'POST',
    body: form,
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.ok) {
    throw new Error(payload?.error || `Analytics backend failed (${response.status}).`);
  }
  return { ...payload.analysis, sessionId: payload.sessionId || payload.analysis?.sessionId };
}

export async function askBackendChat(question, analysis, history = []) {
  const response = await apiFetch(`${apiBase()}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sessionId: analysis?.sessionId,
      question,
      selectedReportSection: null,
      filters: null,
      conversationHistorySummary: history.slice(-8).map(m => `${m.role}: ${String(m.text || '').slice(0, 300)}`).join('\n'),
      analysis: analysis?.sessionId ? undefined : analysis,
    }),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.ok) {
    throw new Error(payload?.error || `Analytics chat failed (${response.status}).`);
  }
  return {
    answer: payload.answer,
    action: payload.action || null,
    analysis: payload.analysis || null,
    sessionId: payload.sessionId || payload.analysis?.sessionId || null,
    source: payload.source || null,
    clearActiveAnalysis: Boolean(payload.clearActiveAnalysis),
  };
}

export async function validateConnectedSource(source) {
  const response = await apiFetch(`${apiBase()}/api/connections/validate-source`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ source }),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.ok) {
    throw new Error(payload?.error || `Connected source validation failed (${response.status}).`);
  }
  return payload;
}

export async function refreshConnectedSource(source, sessionId) {
  const response = await apiFetch(`${apiBase()}/api/connections/refresh-source`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ source, sessionId }),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.ok) {
    throw new Error(payload?.error || `Connected source refresh failed (${response.status}).`);
  }
  return payload;
}

export async function clearBackendSession(sessionId) {
  if (!sessionId) return { ok: true };
  const response = await apiFetch(`${apiBase()}/api/clear-session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId }),
  });
  return response.json().catch(() => ({ ok: response.ok }));
}

export async function getConnectors() {
  const response = await apiFetch(`${apiBase()}/api/connectors`);
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.ok) {
    throw new Error(payload?.error || `Could not load connectors (${response.status}).`);
  }
  return payload;
}

export async function testSlackIntegration() {
  const response = await apiFetch(`${apiBase()}/api/integrations/slack/test`, { method: 'POST' });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.ok) {
    throw new Error(payload?.error || `Slack test failed (${response.status}).`);
  }
  return payload;
}

export async function connectBusinessTool(connection) {
  const response = await apiFetch(`${apiBase()}/api/connections`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(connection),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.ok) {
    throw new Error(payload?.error || `Connection could not be created (${response.status}).`);
  }
  return payload.connection;
}

export async function disconnectBusinessTool(connectionId) {
  const response = await apiFetch(`${apiBase()}/api/connections/remove`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ connectionId }),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.ok) {
    throw new Error(payload?.error || `Connection could not be removed (${response.status}).`);
  }
  return payload;
}

export function oauthStartUrl(connectorId, returnPath = '/connections') {
  const returnUrl = `${window.location.origin}${returnPath}`;
  return `${apiBase()}/api/oauth/start/${encodeURIComponent(connectorId)}?returnUrl=${encodeURIComponent(returnUrl)}`;
}

export async function getConnectionResources(connectionId) {
  const response = await apiFetch(`${apiBase()}/api/connections/${encodeURIComponent(connectionId)}/resources`);
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.ok) {
    throw new Error(payload?.error || `Connected data could not be loaded (${response.status}).`);
  }
  return payload.resources || [];
}

export async function analyzeConnectedResource(connectionId, resourceId) {
  const response = await apiFetch(`${apiBase()}/api/connections/import`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ connectionId, resourceId }),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.ok) {
    throw new Error(payload?.error || `Connected source analysis failed (${response.status}).`);
  }
  return { ...payload.analysis, sessionId: payload.sessionId || payload.analysis?.sessionId };
}

export async function createProtectedShare(sessionId, expiresInDays = 7, customization = null, analysis = null) {
  const response = await apiFetch(`${apiBase()}/api/shares`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId, expiresInDays, customization, analysis }),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.ok) {
    throw new Error(payload?.error || `Protected link could not be created (${response.status}).`);
  }
  return payload.share;
}

export async function getProtectedShareMetadata(reportId) {
  const response = await apiFetch(`${apiBase()}/api/shares/${encodeURIComponent(reportId)}`);
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.ok) {
    throw new Error(payload?.error || 'Protected report was not found.');
  }
  return payload.share;
}

export async function getProtectedShareData(reportId) {
  const response = await apiFetch(`${apiBase()}/api/shares/${encodeURIComponent(reportId)}/data`, {
    credentials: 'include',
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.ok) {
    throw new Error(payload?.error || 'Unlock this protected report before opening Dashboard Studio.');
  }
  return payload.analysis;
}

export async function getDashboardStudioConfig() {
  const response = await apiFetch(`${apiBase()}/api/dashboard-studio/config`);
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.ok) throw new Error(payload?.error || 'Dashboard Studio is unavailable.');
  return payload;
}

export async function generateDashboardPlan({ sessionId, shareId, prompt, currentPlan, analysis, useStitch = false, stitchState = null }) {
  const response = await apiFetch(`${apiBase()}/api/dashboard-studio/plan`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId, shareId, prompt, currentPlan, analysis, useStitch, stitchState }),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.ok) {
    throw new Error(payload?.error || 'Dashboard customization failed.');
  }
  return payload;
}

export async function unlockProtectedShare(reportId, password) {
  const verifyResponse = await apiFetch(`${apiBase()}/api/shares/access`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ shareId: reportId, password }),
  });
  const verifyPayload = await verifyResponse.json().catch(() => null);
  if (!verifyResponse.ok || !verifyPayload?.ok) {
    throw new Error(verifyPayload?.error || 'Protected report could not be unlocked.');
  }
  const response = await apiFetch(`${apiBase()}/api/shares/${encodeURIComponent(reportId)}/data`, {
    credentials: 'include',
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.ok) {
    throw new Error(payload?.error || 'Protected report could not be unlocked.');
  }
  return payload.analysis;
}

export async function revokeProtectedShare(shareId, sessionId) {
  const response = await apiFetch(`${apiBase()}/api/shares/revoke`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ shareId, sessionId }),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.ok) {
    throw new Error(payload?.error || 'Share link could not be revoked.');
  }
  return payload;
}

export async function downloadProtectedPdf(sessionId, password) {
  const response = await apiFetch(`${apiBase()}/api/export-protected-pdf`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId, password }),
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(payload?.error || `Protected PDF export failed (${response.status}).`);
  }
  const disposition = response.headers.get('content-disposition') || '';
  const fileName = disposition.match(/filename="?([^";]+)"?/i)?.[1] || 'protected_analysis.pdf';
  return { blob: await response.blob(), fileName };
}
