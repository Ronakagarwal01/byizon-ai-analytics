from __future__ import annotations

import json
import re
from decimal import Decimal, InvalidOperation
from typing import Any


INSUFFICIENT = "Insufficient evidence to answer this question."


def _flatten_text(value: Any) -> str:
    if isinstance(value, dict):
        return " ".join(_flatten_text(child) for child in value.values())
    if isinstance(value, list):
        return " ".join(_flatten_text(item) for item in value)
    return str(value)


def _numbers(text: str) -> set[str]:
    found: set[str] = set()
    for match in re.findall(r"(?<![\w.])-?\d[\d,]*(?:\.\d+)?%?", text):
        raw = match.strip()
        try:
            normalized = str(Decimal(raw.replace(",", "").replace("%", "")))
        except InvalidOperation:
            continue
        found.add(normalized.rstrip("0").rstrip(".") if "." in normalized else normalized)
    return found


def _dates(text: str) -> set[str]:
    return set(re.findall(r"\b(?:20\d{2}|19\d{2})[-/]\d{1,2}[-/]\d{1,2}\b|\b(?:20\d{2}|19\d{2})\b", text))


def validate_ai_response(
    *,
    response_text: str,
    structured_json: dict[str, Any],
    fallback: str,
) -> dict[str, Any]:
    if not response_text.strip():
        return {"ok": False, "text": fallback or INSUFFICIENT, "issues": ["empty_response"]}

    evidence_text = json.dumps(structured_json, ensure_ascii=True, sort_keys=True, default=str)
    evidence_numbers = _numbers(evidence_text)
    response_numbers = _numbers(response_text)
    unsupported_numbers = sorted(response_numbers - evidence_numbers)

    evidence_dates = _dates(evidence_text)
    response_dates = _dates(response_text)
    unsupported_dates = sorted(response_dates - evidence_dates)

    issues: list[str] = []
    if unsupported_numbers:
        issues.append(f"unsupported_numbers:{','.join(unsupported_numbers[:8])}")
    if unsupported_dates:
        issues.append(f"unsupported_dates:{','.join(unsupported_dates[:8])}")

    risky_phrases = (
        "i queried",
        "i ran sql",
        "select ",
        "insert ",
        "update ",
        "delete ",
        "raw rows",
        "oauth token",
        "access token",
    )
    lowered = response_text.lower()
    if any(phrase in lowered for phrase in risky_phrases):
        issues.append("unsafe_capability_claim")

    if issues:
        return {"ok": False, "text": fallback or INSUFFICIENT, "issues": issues}
    return {"ok": True, "text": response_text, "issues": []}
