from __future__ import annotations

import json
import os
import re
from typing import Any

from ..ai.orchestrator import configured as ai_configured, orchestrate_text
from .memory import VoiceMemory

MEMORY = VoiceMemory()
PAGE_WORDS = {
    "dashboard": "dashboard", "dashbord": "dashboard", "report": "reports", "reports": "reports",
    "connection": "connections", "connections": "connections", "integration": "connections",
    "upload": "upload", "file": "upload", "chat": "chat", "home": "home",
}


def configured() -> bool:
    return ai_configured()


def huggingface_configured() -> bool:
    return bool(_hf_key())


def _hf_key() -> str:
    return (os.getenv("HF_API_KEY") or os.getenv("HF_TOKEN") or os.getenv("VITE_HF_API_KEY") or "").strip()


def _local_command(text: str) -> dict | None:
    value = text.lower().strip()
    google_service = any(term in value for term in (
        "gmail", "email", "mail", "calendar", "google meet", "meet link",
        "meeting link", "google sheet", "spreadsheet", "google doc", "document",
    ))
    google_action = any(term in value for term in (
        "send", "bhejo", "bhjo", "bhaj", "create", "banao", "schedule",
        "book", "append", "write", "save",
    ))
    if google_service and google_action:
        return {
            "response": "I am running that command through your authorized Google account.",
            "toolCalls": [{"name": "run_connected_command", "arguments": {"command": text}}],
            "source": "deterministic",
        }
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


def _model_agent(transcript: str, context: dict, memories: list[dict]) -> dict:
    safe_context = {
        "route": context.get("route"),
        "dataset": context.get("dataset"),
        "availableSections": context.get("availableSections", []),
    }
    evidence = {
        "policy": "voice-context-evidence-only",
        "queryPlan": {"intent": "voice_answer"},
        "evidence": {
            "appContext": safe_context,
            "relevantMemory": memories[:6],
            "userTranscript": transcript,
        },
        "security": {
            "rawRowsIncluded": False,
            "modelReceivesOnly": "route_dataset_summary_and_recent_voice_memory",
        },
    }
    response = orchestrate_text(
        purpose="voice_answer",
        evidence=evidence,
        owner_user_id=str(context.get("workspaceUserId") or "voice"),
        fallback="I can help with navigation and connected-app commands. Upload or connect data for grounded analysis.",
        allow_model=True,
        system_prompt=(
            "You are Byizon, a concise voice-first analytics assistant. Use only the evidence JSON. "
            "Never invent data. Reply in the user's language in at most two short sentences."
        ),
    )
    return {"response": response["text"], "toolCalls": [], "source": response.get("provider", "ai_orchestrator")}


def answer(session_id: str, transcript: str, context: dict[str, Any]) -> dict:
    transcript = transcript.strip()[:4000]
    if not transcript:
        raise ValueError("Transcript is required.")
    result = _local_command(transcript)
    if result is None:
        if configured():
            result = _model_agent(transcript, context, MEMORY.search(session_id, transcript))
        else:
            result = {"response": "I can navigate the app now. Configure a Hugging Face or OpenAI key for analytical voice answers.", "toolCalls": [], "source": "configuration"}
    MEMORY.add(session_id, transcript, result["response"])
    return result
