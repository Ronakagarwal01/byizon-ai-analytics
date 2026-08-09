from __future__ import annotations

import json
import os
import re
import time
import urllib.error
import urllib.request
from typing import Any

from backend.analytics.evidence_builder import validate_model_payload
from backend.analytics.warehouse import record_ai_request
from backend.ai.prompt_builder import build_prompt
from backend.ai.response_validator import INSUFFICIENT, validate_ai_response


def configured() -> bool:
    return bool(
        os.getenv("OPENAI_API_KEY", "").strip()
        or os.getenv("HF_API_KEY", "").strip()
        or os.getenv("VITE_HF_API_KEY", "").strip()
    )


def _provider() -> tuple[str, str | None, str | None]:
    openai_key = os.getenv("OPENAI_API_KEY", "").strip()
    if openai_key:
        return "openai", openai_key, os.getenv("OPENAI_MODEL", "gpt-4o-mini").strip() or "gpt-4o-mini"
    # VITE_HF_API_KEY is supported for existing local installations. New setups
    # should use the server-only HF_API_KEY variable.
    hf_key = os.getenv("HF_API_KEY", "").strip() or os.getenv("VITE_HF_API_KEY", "").strip()
    if hf_key:
        return "huggingface", hf_key, os.getenv("HF_MODEL", "meta-llama/Llama-3.1-8B-Instruct").strip()
    return "deterministic", None, None


def _chat_openai(key: str, model: str, prompt: str) -> tuple[str, dict[str, Any]]:
    payload = {
        "model": model,
        "messages": [{"role": "user", "content": prompt}],
        "temperature": 0.1,
        "max_tokens": 500,
    }
    req = urllib.request.Request(
        "https://api.openai.com/v1/chat/completions",
        data=json.dumps(payload).encode("utf-8"),
        headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=25) as response:
        data = json.loads(response.read().decode("utf-8"))
    text = str(data.get("choices", [{}])[0].get("message", {}).get("content") or "").strip()
    usage = data.get("usage") if isinstance(data.get("usage"), dict) else {}
    return text, usage


def _chat_hf(key: str, model: str, prompt: str) -> tuple[str, dict[str, Any]]:
    payload = {
        "model": model,
        "messages": [{"role": "user", "content": prompt}],
        "temperature": 0.1,
        "max_tokens": 500,
    }
    req = urllib.request.Request(
        "https://router.huggingface.co/v1/chat/completions",
        data=json.dumps(payload).encode("utf-8"),
        headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=25) as response:
        data = json.loads(response.read().decode("utf-8"))
    text = str(data.get("choices", [{}])[0].get("message", {}).get("content") or "").strip()
    usage = data.get("usage") if isinstance(data.get("usage"), dict) else {}
    return text, usage


def _workspace_context(evidence: dict[str, Any], owner_user_id: str) -> dict[str, Any]:
    dataset = evidence.get("dataset") or {}
    return {
        "ownerUserId": owner_user_id,
        "workspace": evidence.get("workspace") or "default",
        "datasetId": dataset.get("datasetId") or evidence.get("security", {}).get("datasetId"),
        "sourceKind": dataset.get("sourceKind") or evidence.get("sourceKind"),
    }


def _token_usage(prompt_bytes: int, completion_bytes: int, usage: dict[str, Any] | None = None) -> dict[str, Any]:
    if usage:
        return dict(usage)
    return {
        "source": "byte_estimate",
        "estimatedPromptTokens": max(1, prompt_bytes // 4) if prompt_bytes else 0,
        "estimatedCompletionTokens": max(1, completion_bytes // 4) if completion_bytes else 0,
    }


def _conversation_fallback(question: str, history: list[dict[str, str]], model_configured: bool) -> str:
    """Keep common memory questions useful during a transient model failure."""
    lowered = question.casefold()
    user_messages = [item["text"] for item in history if item.get("role") == "user" and item.get("text")]
    asks_name = bool(re.search(r"\b(my name|mera naam|naam kya|what.*name)\b", lowered))
    asks_colour = bool(re.search(r"\b(favou?rite|pasand).*(colou?r|rang)|\b(colou?r|rang).*(tell|bataya|kaha)\b", lowered))
    asks_previous = bool(re.search(r"\b(previous|last|pichl|pehle|abhi).*(message|said|kaha|bola|likha)\b", lowered))

    if asks_name:
        for text in reversed(user_messages):
            match = re.search(r"\b(?:my name is|mera naam)\s+([\w'-]{2,40})", text, re.IGNORECASE)
            if match:
                return f"Aapne apna naam {match.group(1)} bataya tha."
        return "Aapne is chat mein abhi apna naam nahi bataya, isliye mujhe aapka naam nahi pata."

    if asks_colour:
        for text in reversed(user_messages):
            match = re.search(
                r"\b(?:(?:my|mera)\s+)?favou?rite\s+(?:colou?r|rang)\s+(?:(?:is|hai)\s+)?([\w'-]{2,30})",
                text,
                re.IGNORECASE,
            )
            if match:
                return f"You told me your favourite colour is {match.group(1)}."
        return "You have not told me your favourite colour in this chat yet."

    if asks_previous and user_messages:
        return f'Your previous message was: “{user_messages[-1]}”'

    if model_configured:
        return (
            "AI service ne is request par temporary response nahi diya. Aap dobara try karein — "
            "is chat ki last 20 messages ki memory safe hai."
        )
    return (
        "Conversational AI model abhi configured nahi hai. HF_API_KEY ya OPENAI_API_KEY configure karne ke "
        "baad main Hindi, English aur Hinglish mein naturally jawab de sakunga."
    )


def orchestrate_text(
    *,
    purpose: str,
    evidence: dict[str, Any],
    owner_user_id: str,
    fallback: str,
    allow_model: bool = False,
    system_prompt: str | None = None,
) -> dict[str, Any]:
    validate_model_payload(evidence)
    provider, key, model = _provider()
    workspace_context = _workspace_context(evidence, owner_user_id)
    prompt_bundle = build_prompt(
        user_question=str(evidence.get("question") or evidence.get("queryPlan", {}).get("question") or ""),
        evidence=evidence,
        business_context={
            "purpose": purpose,
            "intent": evidence.get("queryPlan", {}).get("intent"),
            "policy": evidence.get("policy"),
        },
        workspace_context=workspace_context,
        conversation_history=evidence.get("conversationHistory") if isinstance(evidence.get("conversationHistory"), list) else None,
        instructions=system_prompt,
    )
    request_payload = {
        "purpose": purpose,
        "evidenceId": evidence.get("evidenceId"),
        "datasetId": evidence.get("security", {}).get("datasetId"),
        "intent": evidence.get("queryPlan", {}).get("intent"),
        "policy": evidence.get("policy"),
        "promptPolicy": "compact_structured_json_only",
        "promptBytes": prompt_bundle.get("promptBytes", 0),
        "modelReceivesOnly": ["userQuestion", "structuredJson", "businessContext", "workspaceContext", "conversationHistory"],
    }
    if not prompt_bundle.get("allowed"):
        text = INSUFFICIENT
        request_id = record_ai_request(
            owner_user_id,
            purpose=purpose,
            provider="deterministic",
            model=None,
            evidence_id=evidence.get("evidenceId"),
            status="insufficient_evidence",
            request_payload=request_payload,
            response_text=text,
            error=prompt_bundle.get("reason"),
            prompt_bytes=0,
            completion_bytes=len(text.encode("utf-8")),
            latency_ms=0,
            token_usage=_token_usage(0, len(text.encode("utf-8"))),
            workspace_context=workspace_context,
        )
        return {"text": text, "provider": "deterministic", "requestId": request_id, "reason": prompt_bundle.get("reason")}
    if not allow_model or not key:
        request_id = record_ai_request(
            owner_user_id,
            purpose=purpose,
            provider="deterministic",
            model=None,
            evidence_id=evidence.get("evidenceId"),
            status="skipped",
            request_payload=request_payload,
            response_text=fallback,
            prompt_bytes=int(prompt_bundle.get("promptBytes") or 0),
            completion_bytes=len(fallback.encode("utf-8")),
            latency_ms=0,
            token_usage=_token_usage(int(prompt_bundle.get("promptBytes") or 0), len(fallback.encode("utf-8"))),
            workspace_context=workspace_context,
        )
        return {"text": fallback, "provider": "deterministic", "requestId": request_id}
    prompt = str(prompt_bundle["prompt"])
    prompt_bytes = int(prompt_bundle.get("promptBytes") or len(prompt.encode("utf-8")))
    try:
        start = time.perf_counter()
        text, usage = _chat_openai(key, model or "gpt-4o-mini", prompt) if provider == "openai" else _chat_hf(key, model or "", prompt)
        latency_ms = int((time.perf_counter() - start) * 1000)
        if not text:
            text = fallback
        validation = validate_ai_response(
            response_text=text,
            structured_json=prompt_bundle["structuredJson"],
            fallback=fallback or INSUFFICIENT,
        )
        text = validation["text"]
        status = "complete" if validation["ok"] else "validation_failed"
        completion_bytes = len(text.encode("utf-8"))
        request_id = record_ai_request(
            owner_user_id,
            purpose=purpose,
            provider=provider,
            model=model,
            evidence_id=evidence.get("evidenceId"),
            status=status,
            request_payload=request_payload,
            response_text=text,
            error=";".join(validation["issues"]) if validation["issues"] else None,
            prompt_bytes=prompt_bytes,
            completion_bytes=completion_bytes,
            latency_ms=latency_ms,
            token_usage=_token_usage(prompt_bytes, completion_bytes, usage),
            workspace_context=workspace_context,
        )
        return {
            "text": text,
            "provider": provider,
            "model": model,
            "requestId": request_id,
            "validation": validation,
        }
    except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, ValueError) as exc:
        completion_bytes = len(fallback.encode("utf-8"))
        request_id = record_ai_request(
            owner_user_id,
            purpose=purpose,
            provider=provider,
            model=model,
            evidence_id=evidence.get("evidenceId"),
            status="failed",
            request_payload=request_payload,
            response_text=fallback,
            error=str(exc),
            prompt_bytes=prompt_bytes,
            completion_bytes=completion_bytes,
            latency_ms=0,
            token_usage=_token_usage(prompt_bytes, completion_bytes),
            workspace_context=workspace_context,
        )
        return {"text": fallback, "provider": "deterministic", "requestId": request_id, "error": str(exc)}


def orchestrate_conversation(
    *,
    question: str,
    conversation_history: list[dict[str, Any]],
    owner_user_id: str,
) -> dict[str, Any]:
    """Answer ordinary bilingual conversation without exposing dataset rows."""
    provider, key, model = _provider()
    safe_history = [
        {
            "role": "assistant" if item.get("role") in {"assistant", "ai"} else "user",
            "text": str(item.get("text") or "")[:1200],
        }
        for item in conversation_history[-20:]
        if isinstance(item, dict) and item.get("role") in {"user", "assistant", "ai"} and item.get("text")
    ]
    fallback = _conversation_fallback(question, safe_history, bool(key))
    if not key:
        return {"text": fallback, "provider": "deterministic", "model": None}

    prompt = json.dumps({
        "system": (
            "You are Byizon AI, a warm, intelligent human-like assistant. Understand Hindi, English, "
            "Hinglish, Roman Hindi, and mixed-language messages. Reply in the user's current language and "
            "tone unless they request another language. Use the recent conversation to resolve pronouns, "
            "follow-ups, corrections, and implied intent. Answer the actual question directly and naturally; "
            "do not use a fixed template. Be concise unless detail is requested. If the user asks about a "
            "personal fact that is absent from recentConversation, clearly say you do not know it; never guess. "
            "Never claim access to data, files, or actions that were not supplied or completed. The conversation "
            "is isolated to this chat."
        ),
        "recentConversation": safe_history,
        "userMessage": question[:4000],
    }, ensure_ascii=False)
    try:
        start = time.perf_counter()
        text, usage = (
            _chat_openai(key, model or "gpt-4o-mini", prompt)
            if provider == "openai"
            else _chat_hf(key, model or "", prompt)
        )
        latency_ms = int((time.perf_counter() - start) * 1000)
        return {
            "text": text.strip() or fallback,
            "provider": provider,
            "model": model,
            "latencyMs": latency_ms,
            "usage": usage,
        }
    except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, ValueError) as exc:
        return {"text": fallback, "provider": "deterministic", "model": None, "error": str(exc)}


def orchestrate_json(
    *,
    purpose: str,
    evidence: dict[str, Any],
    owner_user_id: str,
    fallback: dict[str, Any],
    allow_model: bool = False,
    system_prompt: str | None = None,
) -> dict[str, Any]:
    response = orchestrate_text(
        purpose=purpose,
        evidence=evidence,
        owner_user_id=owner_user_id,
        fallback=json.dumps(fallback, ensure_ascii=True),
        allow_model=allow_model,
        system_prompt=(system_prompt or "") + "\nReturn strict JSON only.",
    )
    try:
        parsed = json.loads(response["text"])
        return parsed if isinstance(parsed, dict) else fallback
    except Exception:
        return fallback
