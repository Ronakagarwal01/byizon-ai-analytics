const API_BASE = (import.meta.env.VITE_ANALYTICS_API_BASE || 'http://127.0.0.1:8000').replace(/\/$/, '');

async function jsonResponse(response) {
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.ok) throw new Error(payload?.error || `Voice service failed (${response.status}).`);
  return payload;
}

export async function getVoiceConfig() {
  return jsonResponse(await fetch(`${API_BASE}/api/voice/config`));
}

export async function transcribeVoice(blob) {
  const form = new FormData();
  form.append('audio', blob, `voice-${Date.now()}.webm`);
  return jsonResponse(await fetch(`${API_BASE}/api/voice/transcribe`, { method: 'POST', body: form }));
}

export async function runVoiceAgent(sessionId, transcript, context, options = {}) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), options.timeoutMs || 12000);
  return jsonResponse(await fetch(`${API_BASE}/api/voice/agent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: controller.signal,
    body: JSON.stringify({ sessionId, transcript, context }),
  }).finally(() => window.clearTimeout(timeout)));
}

export async function synthesizeVoice(text) {
  const response = await fetch(`${API_BASE}/api/voice/speak`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(payload?.error || `Speech generation failed (${response.status}).`);
  }
  return response.blob();
}
