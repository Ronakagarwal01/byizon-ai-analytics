from __future__ import annotations

import json
import os
import re
import urllib.error
import urllib.request
from typing import Any

from .memory import VoiceMemory
from .tool_catalog import openai_tools

MEMORY = VoiceMemory()
PAGE_WORDS = {
    "dashboard": "dashboard", "dashbord": "dashboard", "report": "reports", "reports": "reports",
    "connection": "connections", "connections": "connections", "integration": "connections",
    "upload": "upload", "file": "upload", "chat": "chat", "home": "home",
}


def configured() -> bool:
    return bool(os.getenv("OPENAI_API_KEY", "").strip() or _hf_key())


def huggingface_configured() -> bool:
    return bool(_hf_key())


def _hf_key() -> str:
    return (os.getenv("HF_API_KEY") or os.getenv("HF_TOKEN") or os.getenv("VITE_HF_API_KEY") or "").strip()


def _local_command(text: str) -> dict | None:
    value = text.lower().strip()
    if any(term in value for term in ("live link", "share link", "sharing link", "protected link")) and any(
        term in value for term in ("generate", "create", "banao", "bana do", "banado", "do", "share")
    ):
        return {
            "response": "I created a password-protected live link. The link and one-time password are shown on screen.",
            "toolCalls": [{"name": "create_protected_share", "arguments": {}}],
            "source": "deterministic",
        }
    if any(term in value for term in ("go back", "piche", "peeche", "previous page")):
        return {"response": "Going back.", "toolCalls": [{"name": "go_back", "arguments": {}}], "source": "deterministic"}
    if any(term in value for term in ("refresh", "reload")):
        return {"response": "Refreshing this page.", "toolCalls": [{"name": "refresh_page", "arguments": {}}], "source": "deterministic"}
    if any(term in value for term in ("upload file", "attach file", "file upload", "dataset upload")):
        return {"response": "Opening the dataset picker.", "toolCalls": [{"name": "attach_dataset", "arguments": {}}], "source": "deterministic"}
    if "new chat" in value or "nayi chat" in value:
        return {"response": "Starting a new conversation.", "toolCalls": [{"name": "new_chat", "arguments": {}}], "source": "deterministic"}
    if "scroll" in value or "niche" in value or "neeche" in value or "upar" in value:
        direction = "up" if "up" in value or "upar" in value else "down"
        return {"response": f"Scrolling {direction}.", "toolCalls": [{"name": "scroll_page", "arguments": {"direction": direction}}], "source": "deterministic"}
    if any(term in value for term in ("open", "show", "dikhao", "kholo", "navigate", "jao")):
        for word, page in PAGE_WORDS.items():
            if re.search(rf"\b{re.escape(word)}\b", value):
                return {"response": f"Opening {page}.", "toolCalls": [{"name": "navigate", "arguments": {"page": page}}], "source": "deterministic"}
    return None


def _openai_agent(transcript: str, context: dict, memories: list[dict]) -> dict:
    key = os.getenv("OPENAI_API_KEY", "").strip()
    model = os.getenv("OPENAI_AGENT_MODEL", "gpt-5-mini").strip()
    safe_context = {
        "route": context.get("route"),
        "dataset": context.get("dataset"),
        "availableSections": context.get("availableSections", []),
    }
    prompt = (
        "You are Byizon, a concise voice-first analytics assistant. Use only the provided app context and never invent data. "
        "Request UI actions only through tools. If evidence is unavailable, say so. Reply in the user's language, in 1-2 short sentences.\n"
        f"APP_CONTEXT={json.dumps(safe_context, ensure_ascii=False)[:12000]}\n"
        f"RELEVANT_MEMORY={json.dumps(memories, ensure_ascii=False)[:4000]}\n"
        f"USER={transcript}"
    )
    payload = json.dumps({"model": model, "input": prompt, "tools": openai_tools()}).encode("utf-8")
    request = urllib.request.Request(
        "https://api.openai.com/v1/responses", data=payload,
        headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"}, method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=90) as response:
            result = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")[:600]
        raise ValueError(f"OpenAI agent request failed ({exc.code}): {detail}") from exc
    calls, messages = [], []
    for item in result.get("output", []):
        if item.get("type") == "function_call":
            calls.append({"name": item.get("name"), "arguments": json.loads(item.get("arguments") or "{}")})
        if item.get("type") == "message":
            for content in item.get("content", []):
                if content.get("type") == "output_text":
                    messages.append(content.get("text", ""))
    return {"response": " ".join(messages).strip() or "Done.", "toolCalls": calls, "source": "openai"}


def _huggingface_agent(transcript: str, context: dict, memories: list[dict]) -> dict:
    key = _hf_key()
    model = (os.getenv("HF_MODEL") or os.getenv("VITE_HF_MODEL") or "meta-llama/Llama-3.1-8B-Instruct").strip()
    safe_context = {
        "route": context.get("route"),
        "dataset": context.get("dataset"),
        "availableSections": context.get("availableSections", []),
    }
    messages = [
        {"role": "system", "content": "You are Byizon, a concise analytics voice assistant. Answer only from APP_CONTEXT. Never invent numbers. If evidence is unavailable, say so. Reply in the user's language in at most two short sentences."},
        {"role": "user", "content": f"APP_CONTEXT={json.dumps(safe_context, ensure_ascii=False)[:12000]}\nRELEVANT_MEMORY={json.dumps(memories, ensure_ascii=False)[:3000]}\nQUESTION={transcript}"},
    ]
    payload = json.dumps({"model": model, "messages": messages, "max_tokens": 350, "temperature": 0.1}).encode("utf-8")
    request = urllib.request.Request(
        "https://router.huggingface.co/v1/chat/completions", data=payload,
        headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"}, method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=90) as response:
            result = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")[:600]
        raise ValueError(f"Hugging Face request failed ({exc.code}): {detail}") from exc
    content = result.get("choices", [{}])[0].get("message", {}).get("content", "").strip()
    return {"response": content or "The model returned an empty response.", "toolCalls": [], "source": "huggingface"}


def answer(session_id: str, transcript: str, context: dict[str, Any]) -> dict:
    transcript = transcript.strip()[:4000]
    if not transcript:
        raise ValueError("Transcript is required.")
    result = _local_command(transcript)
    if result is None:
        if os.getenv("OPENAI_API_KEY", "").strip():
            result = _openai_agent(transcript, context, MEMORY.search(session_id, transcript))
        elif huggingface_configured():
            result = _huggingface_agent(transcript, context, MEMORY.search(session_id, transcript))
        else:
            result = {"response": "I can navigate the app now. Configure a Hugging Face or OpenAI key for analytical voice answers.", "toolCalls": [], "source": "configuration"}
    MEMORY.add(session_id, transcript, result["response"])
    return result
