# Byizon Global Voice Assistant

The voice assistant is mounted once in `src/App.jsx`, so it is available on every route without removing the existing text chat, upload, dashboard, report, connection, sharing, or PDF features.

## Configure secrets

Add these values to the backend environment (`.env` for local development or a managed secret store in production):

```env
OPENAI_API_KEY=
OPENAI_AGENT_MODEL=gpt-5-mini
ELEVENLABS_API_KEY=
ELEVENLABS_VOICE_ID=21m00Tcm4TlvDq8ikWAM
ELEVENLABS_STT_MODEL=scribe_v2
ELEVENLABS_TTS_MODEL=eleven_flash_v2_5
```

Never add these secrets with a `VITE_` prefix. Vite-prefixed values are sent to the browser.

## Runtime flow

1. Pressing the root microphone starts a continuous voice session. It listens again after every spoken response until the microphone is pressed manually to stop.
2. ElevenLabs transcribes audio when configured; Chrome/Edge speech recognition is the local fallback.
3. Deterministic navigation commands are resolved without an LLM.
4. Analytical requests go to the configured GPT model through the backend Responses API.
5. The model can request only tools listed in `backend/voice/tool_catalog.py`.
6. `src/voice/toolRegistry.js` validates and executes those semantic UI actions.
7. ElevenLabs speaks the result when configured; browser speech synthesis is the fallback.
8. Session memory is stored in a local SQLite sparse-vector store under `backend/data`.

Only compact schema, KPI, insight, and report context is sent to the agent. Raw dataset rows are not automatically sent.

## Production notes

- Put the backend behind HTTPS; browser microphone access requires a secure context outside localhost.
- Store API keys in a cloud secret manager and rotate them regularly.
- Add authenticated user/workspace IDs before multi-tenant deployment.
- Keep the tool registry allowlisted. Do not add arbitrary CSS selectors, shell commands, or SQL execution.
- Apply gateway rate limits and request logging with sensitive fields redacted.
