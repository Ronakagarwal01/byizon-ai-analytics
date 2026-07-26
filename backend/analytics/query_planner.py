from __future__ import annotations

import json
import re
from typing import Any


_STOP_WORDS = {
    "about", "analysis", "analyze", "data", "dataset", "give", "is", "ka", "ki",
    "kya", "me", "mein", "of", "please", "show", "the", "to", "what",
}


def _tokens(question: str) -> set[str]:
    return {
        token
        for token in re.findall(r"[a-z0-9_]+", question.lower())
        if len(token) > 2 and token not in _STOP_WORDS
    }


def _score(item: Any, tokens: set[str]) -> int:
    text = json.dumps(item, ensure_ascii=False, default=str).lower()
    return sum(1 for token in tokens if token in text)


def _rank(items: list[Any], tokens: set[str], limit: int) -> list[Any]:
    ranked = sorted(enumerate(items), key=lambda pair: (_score(pair[1], tokens), -pair[0]), reverse=True)
    matched = [item for _, item in ranked if _score(item, tokens) > 0]
    return (matched or items)[:limit]


def plan_query(question: str, analysis: dict[str, Any]) -> dict[str, Any]:
    q = question.lower()
    intent = "general_analysis"
    if re.search(r"missing|duplicate|quality|invalid|outlier|anomal", q):
        intent = "data_quality"
    elif re.search(r"trend|month|quarter|year|time|date", q):
        intent = "trend"
    elif re.search(r"top|bottom|highest|lowest|rank", q):
        intent = "ranking"
    elif re.search(r"correlation|relationship|driver|impact", q):
        intent = "relationship"
    elif re.search(r"total|average|avg|sum|count|kpi|metric|profit|sales|revenue|cost", q):
        intent = "metric"
    return {
        "intent": intent,
        "tokens": sorted(_tokens(question)),
        "datasetId": analysis.get("datasetId"),
        "requiresRawRows": False,
        "strategy": "select precomputed evidence, aggregates, and chart points only",
    }


def build_query_context(question: str, analysis: dict[str, Any]) -> tuple[dict[str, Any], dict[str, Any]]:
    plan = plan_query(question, analysis)
    tokens = set(plan["tokens"])
    quality = analysis.get("dataQuality") or {}
    context: dict[str, Any] = {
        "policy": "query-scoped-processed-evidence-only",
        "question": question,
        "queryPlan": plan,
        "dataset": {
            "datasetId": analysis.get("datasetId"),
            "fileName": analysis.get("fileName"),
            "rowCount": analysis.get("rowCount"),
            "columnCount": analysis.get("colCount"),
            "domain": analysis.get("businessDomain") or analysis.get("datasetType"),
        },
        "evidence": {
            "kpis": _rank(list(analysis.get("kpis") or []), tokens, 8),
            "charts": [
                {
                    "id": chart.get("id"),
                    "title": chart.get("title"),
                    "type": chart.get("type"),
                    "sourceColumns": chart.get("sourceColumns") or chart.get("columns"),
                    "data": list(chart.get("data") or [])[:20],
                }
                for chart in _rank(list(analysis.get("charts") or []), tokens, 4)
                if isinstance(chart, dict)
            ],
            "insights": _rank(list(analysis.get("insights") or []), tokens, 6),
            "hiddenPatterns": _rank(list(analysis.get("hiddenPatterns") or []), tokens, 5),
            "recommendations": _rank(list(analysis.get("recommendations") or []), tokens, 5),
        },
    }
    if plan["intent"] == "data_quality":
        context["evidence"]["dataQuality"] = {
            "completeness": quality.get("completeness"),
            "qualityScore": quality.get("quality"),
            "duplicateRows": quality.get("duplicates") or analysis.get("duplicateRows"),
            "missingSummary": list(quality.get("missingSummary") or [])[:20],
            "outlierSummary": list(quality.get("outlierSummary") or [])[:12],
        }
    encoded = json.dumps(context, ensure_ascii=False, default=str)
    audit = {
        "policy": context["policy"],
        "databaseFirst": bool(analysis.get("datasetId")),
        "rawRowsIncluded": False,
        "fullDatasetIncluded": False,
        "sensitiveColumnsRemoved": True,
        "contextCharacters": len(encoded),
        "selectedEvidence": {
            key: len(value) if isinstance(value, list) else 1
            for key, value in context["evidence"].items()
        },
    }
    return context, audit
