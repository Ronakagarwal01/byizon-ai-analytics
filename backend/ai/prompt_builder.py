from __future__ import annotations

import json
import re
from typing import Any

from backend.analytics.evidence_builder import validate_model_payload


RAW_OR_INTERNAL_KEYS = {
    "sqlExecution",
    "safeSql",
    "sql",
    "template",
    "parameters",
    "mandatoryFlow",
    "runtimeQueryRunId",
    "evidenceId",
    "ownerUserId",
    "datasetId",
    "requestId",
    "auditId",
    "sessionId",
    "createdAt",
    "updatedAt",
    "debug",
    "trace",
    "rawRows",
    "rows",
    "records",
    "messages",
    "tables",
    "oauth",
    "token",
    "secret",
}

MAX_LIST_ITEMS = 40
MAX_STRING_LENGTH = 1200
MAX_JSON_BYTES = 18000


def _is_empty(value: Any) -> bool:
    return value is None or value == "" or value == [] or value == {}


def _clean_key(key: str) -> bool:
    lowered = key.lower()
    if key in RAW_OR_INTERNAL_KEYS:
        return False
    return not any(marker in lowered for marker in ("token", "secret", "credential", "password", "raw"))


def _compact(value: Any) -> Any:
    if isinstance(value, dict):
        cleaned: dict[str, Any] = {}
        for key, child in value.items():
            if not _clean_key(str(key)):
                continue
            compacted = _compact(child)
            if not _is_empty(compacted):
                cleaned[str(key)] = compacted
        return cleaned
    if isinstance(value, list):
        compacted_items = [_compact(item) for item in value[:MAX_LIST_ITEMS]]
        return [item for item in compacted_items if not _is_empty(item)]
    if isinstance(value, str):
        collapsed = re.sub(r"\s+", " ", value).strip()
        return collapsed[:MAX_STRING_LENGTH]
    return value


def build_structured_json(evidence: dict[str, Any]) -> dict[str, Any]:
    """Build the only data object an external model is allowed to see."""
    runtime = evidence.get("runtimeEvidence") or {}
    dataset = evidence.get("dataset") or {}
    context_evidence = evidence.get("evidence") or {}
    post_sql = evidence.get("postSqlProcessing") or {}

    structured = {
        "metadata": {
            "fileName": dataset.get("fileName"),
            "rowCount": dataset.get("rowCount"),
            "columnCount": dataset.get("columnCount") or dataset.get("colCount"),
            "datasetType": dataset.get("datasetType"),
            "domain": (evidence.get("intent") or {}).get("domain"),
        },
        "userQuestion": evidence.get("question"),
        "businessContext": {
            "intent": (evidence.get("queryPlan") or {}).get("intent"),
            "selectedMetrics": (evidence.get("queryPlan") or {}).get("selectedMetrics"),
            "policy": evidence.get("policy"),
        },
        "kpis": runtime.get("kpis") or context_evidence.get("kpis"),
        "aggregations": runtime.get("aggregations") or context_evidence.get("aggregations"),
        "timeSeries": runtime.get("timeSeries") or context_evidence.get("timeSeries"),
        "topRecords": runtime.get("topRecords") or context_evidence.get("topRecords"),
        "summary": runtime.get("summary") or context_evidence.get("summary"),
        "dataQuality": runtime.get("dataQuality") or context_evidence.get("dataQuality"),
        "evidence": runtime.get("metrics") or context_evidence.get("metrics") or evidence.get("metricRegistry"),
        "confidence": {
            "score": post_sql.get("confidence") or runtime.get("confidence"),
            "validation": evidence.get("evidenceValidation"),
        },
    }
    compacted = _compact(structured)
    validate_model_payload(compacted)
    return _fit_to_budget(compacted)


def _fit_to_budget(value: dict[str, Any]) -> dict[str, Any]:
    encoded = json.dumps(value, ensure_ascii=True, sort_keys=True, default=str)
    if len(encoded.encode("utf-8")) <= MAX_JSON_BYTES:
        return value
    trimmed = dict(value)
    for key in ("evidence", "aggregations", "topRecords", "timeSeries"):
        if isinstance(trimmed.get(key), list):
            trimmed[key] = trimmed[key][:10]
        elif isinstance(trimmed.get(key), dict):
            trimmed[key] = dict(list(trimmed[key].items())[:10])
        encoded = json.dumps(trimmed, ensure_ascii=True, sort_keys=True, default=str)
        if len(encoded.encode("utf-8")) <= MAX_JSON_BYTES:
            return trimmed
    return {
        "metadata": trimmed.get("metadata"),
        "userQuestion": trimmed.get("userQuestion"),
        "businessContext": trimmed.get("businessContext"),
        "kpis": trimmed.get("kpis"),
        "summary": trimmed.get("summary"),
        "confidence": trimmed.get("confidence"),
    }


def build_prompt(
    *,
    user_question: str,
    evidence: dict[str, Any],
    business_context: dict[str, Any] | None = None,
    workspace_context: dict[str, Any] | None = None,
    conversation_history: list[dict[str, Any]] | None = None,
    instructions: str | None = None,
) -> dict[str, Any]:
    structured_json = build_structured_json(evidence)
    evidence_validation = evidence.get("evidenceValidation") or {}
    if evidence_validation and not evidence_validation.get("sufficientForModel", True):
        return {
            "allowed": False,
            "reason": evidence_validation.get("reason") or "Insufficient evidence to answer this question.",
            "prompt": "",
            "structuredJson": structured_json,
            "promptBytes": 0,
        }

    safe_history = _compact(conversation_history or [])[:8] if conversation_history else []
    prompt_sections = {
        "role": "You are Byizon AI Analysis Layer. You explain deterministic business evidence only.",
        "nonNegotiableRules": [
            "Never generate SQL.",
            "Never access databases or connectors.",
            "Never calculate KPIs, revenue, profit, statistics, forecasts, or percentages.",
            "Use only the supplied structured JSON evidence.",
            "If evidence is missing, say exactly: Insufficient evidence to answer this question.",
            "Never invent numbers, dates, trends, business metrics, or recommendations.",
        ],
        "outputFormat": {
            "Summary": "",
            "Key Insights": [],
            "Important KPIs": [],
            "Observed Trends": [],
            "Possible Reasons": [],
            "Business Recommendations": [],
            "Confidence": "",
        },
        "businessContext": _compact(business_context or {}),
        "workspaceContext": _compact(workspace_context or {}),
        "conversationHistory": safe_history,
        "userQuestion": user_question,
        "structuredJson": structured_json,
        "extraInstructions": instructions or "",
    }
    prompt = json.dumps(prompt_sections, ensure_ascii=True, sort_keys=True, default=str)
    return {
        "allowed": True,
        "reason": None,
        "prompt": prompt,
        "structuredJson": structured_json,
        "promptBytes": len(prompt.encode("utf-8")),
    }
