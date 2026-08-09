from __future__ import annotations

import json
import os
import secrets
import urllib.error
import urllib.request

API_BASE = "https://api.elevenlabs.io/v1"


def configured() -> bool:
    return bool(os.getenv("ELEVENLABS_API_KEY", "").strip())


def _request(request: urllib.request.Request, timeout: int = 90) -> bytes:
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return response.read()
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")[:500]
        raise ValueError(f"ElevenLabs request failed ({exc.code}): {detail}") from exc


def transcribe(audio: bytes, filename: str, content_type: str) -> dict:
    key = os.getenv("ELEVENLABS_API_KEY", "").strip()
    if not key:
        raise ValueError("ElevenLabs is not configured. Set ELEVENLABS_API_KEY on the backend.")
    boundary = f"----Byizon{secrets.token_hex(12)}"
    parts = []
    def field(name: str, value: str):
        parts.append(f'--{boundary}\r\nContent-Disposition: form-data; name="{name}"\r\n\r\n{value}\r\n'.encode())
    field("model_id", os.getenv("ELEVENLABS_STT_MODEL", "scribe_v2"))
    field("tag_audio_events", "false")
    parts.append(
        f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="{filename}"\r\nContent-Type: {content_type}\r\n\r\n'.encode()
        + audio + b"\r\n"
    )
    parts.append(f"--{boundary}--\r\n".encode())
    request = urllib.request.Request(
        f"{API_BASE}/speech-to-text",
        data=b"".join(parts),
        headers={"xi-api-key": key, "Content-Type": f"multipart/form-data; boundary={boundary}"},
        method="POST",
    )
    return json.loads(_request(request).decode("utf-8"))


def synthesize(text: str) -> bytes:
    key = os.getenv("ELEVENLABS_API_KEY", "").strip()
    # Sarah is a premade reassuring female voice available to free API accounts.
    voice_id = os.getenv("ELEVENLABS_VOICE_ID", "EXAVITQu4vr4xnSDxMaL").strip()
    if not key:
        raise ValueError("ElevenLabs TTS is not configured. Set ELEVENLABS_API_KEY.")
    payload = json.dumps({
        "text": text[:3000],
        "model_id": os.getenv("ELEVENLABS_TTS_MODEL", "eleven_flash_v2_5"),
        "voice_settings": {
            "stability": 0.55,
            "similarity_boost": 0.78,
            "style": 0.05,
            "use_speaker_boost": True,
            "speed": 0.92,
        },
    }).encode("utf-8")
    request = urllib.request.Request(
        f"{API_BASE}/text-to-speech/{voice_id}?output_format=mp3_44100_128",
        data=payload,
        headers={"xi-api-key": key, "Content-Type": "application/json", "Accept": "audio/mpeg"},
        method="POST",
    )
    return _request(request)
