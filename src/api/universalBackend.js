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

async function apiFetch(url, options = {}) {
  try {
    return await globalThis.fetch(url, { credentials: 'include', ...options });
  } catch (error) {
    const localHint = isLocalBrowser ? ' Start Byizon with "npm run dev" and retry.' : '';
    throw new Error(`Byizon analytics service is temporarily unavailable.${localHint}`, { cause: error });
  }
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

export async function getAnalyticsDataset(id, options = {}) {
  if (!id) throw new Error('Analytics dataset id is required.');
  const params = new URLSearchParams();
  if (options.page) params.set('page', options.page);
  if (options.pageSize) params.set('pageSize', options.pageSize);
  Object.entries(options.filters || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') params.set(key, value);
  });
  const suffix = params.toString() ? `?${params.toString()}` : '';
  const response = await apiFetch(`${apiBase()}/api/analytics-dataset/${encodeURIComponent(id)}${suffix}`);
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.ok) {
    throw new Error(payload?.error || `Analytics dataset could not be loaded (${response.status}).`);
  }
  return payload.analyticsDataset;
}

export async function refreshAnalyticsDataset(sessionId, refreshKind = 'manual') {
  if (!sessionId) throw new Error('Session id is required to refresh analytics dataset.');
  const response = await apiFetch(`${apiBase()}/api/analytics-dataset/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId, refreshKind }),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.ok) {
    throw new Error(payload?.error || `Analytics dataset refresh failed (${response.status}).`);
  }
  return payload.analyticsDataset;
}

export async function getPowerBiManifest(id) {
  if (!id) throw new Error('Analytics dataset id is required.');
  const response = await apiFetch(`${apiBase()}/api/powerbi/manifest/${encodeURIComponent(id)}`);
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.ok) {
    throw new Error(payload?.error || `Power BI manifest could not be loaded (${response.status}).`);
  }
  return payload;
}

export async function getPowerBiSemanticView(id, viewName, options = {}) {
  if (!id) throw new Error('Analytics dataset id is required.');
  if (!viewName) throw new Error('Power BI semantic view name is required.');
  const params = new URLSearchParams();
  if (options.page) params.set('page', options.page);
  if (options.pageSize) params.set('pageSize', options.pageSize);
  Object.entries(options.filters || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') params.set(key, value);
  });
  const suffix = params.toString() ? `?${params.toString()}` : '';
  const response = await apiFetch(
    `${apiBase()}/api/powerbi/semantic-view/${encodeURIComponent(id)}/${encodeURIComponent(viewName)}${suffix}`,
  );
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.ok) {
    throw new Error(payload?.error || `Power BI semantic view could not be loaded (${response.status}).`);
  }
  return payload;
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
    task: payload.task || null,
    capability: payload.capability || null,
    choices: payload.choices || [],
    queryPlan: payload.queryPlan || null,
    contextAudit: payload.contextAudit || null,
    dataFlow: payload.dataFlow || [],
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

export function oauthStartUrl(connectorId, returnPath = '/connections', capability = '') {
  const returnUrl = `${window.location.origin}${returnPath}`;
  const params = new URLSearchParams({ returnUrl });
  if (capability) params.set('capability', capability);
  return `${apiBase()}/api/oauth/start/${encodeURIComponent(connectorId)}?${params.toString()}`;
}

export async function getAutomationActivities(limit = 30) {
  const response = await apiFetch(`${apiBase()}/api/activities?limit=${encodeURIComponent(limit)}`);
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.ok) {
    throw new Error(payload?.error || `Activity history could not be loaded (${response.status}).`);
  }
  return payload.activities || [];
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
