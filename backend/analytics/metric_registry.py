from __future__ import annotations

from typing import Any

from .warehouse import register_metric


def _source_columns(item: dict[str, Any]) -> list[str]:
    columns = item.get("sourceColumns") or item.get("source_columns")
    if not columns and isinstance(item.get("explainability"), dict):
        columns = item["explainability"].get("sourceColumns")
    if isinstance(columns, str):
        return [columns]
    if isinstance(columns, list):
        return [str(column) for column in columns if str(column).strip()]
    return []


def _formula(item: dict[str, Any]) -> str:
    formula = item.get("formula")
    if not formula and isinstance(item.get("explainability"), dict):
        formula = item["explainability"].get("formula")
    return str(formula or "").strip()


def register_analysis_metrics(analysis: dict[str, Any], owner_user_id: str) -> list[dict[str, Any]]:
    dataset_id = str(analysis.get("datasetId") or "").strip()
    if not dataset_id:
        return []
    registered: list[dict[str, Any]] = []
    for item in analysis.get("kpis") or []:
        if not isinstance(item, dict):
            continue
        name = str(item.get("label") or item.get("name") or "").strip()
        if not name:
            continue
        columns = _source_columns(item)
        formula = _formula(item)
        metric_id = register_metric(
            dataset_id,
            owner_user_id,
            name,
            description=str(item.get("description") or item.get("subtitle") or ""),
            formula=formula,
            source_columns=columns,
            aggregation_rules={
                "type": item.get("aggregation") or item.get("type") or "deterministic",
                "valueType": item.get("valueType"),
            },
            validation_rules={
                "noRawRows": True,
                "ownerScoped": True,
                "requiresSourceColumns": bool(columns),
            },
            business_meaning=str(item.get("whyUseful") or item.get("businessMeaning") or item.get("description") or ""),
            confidence=float(item.get("confidence")) if isinstance(item.get("confidence"), (int, float)) else None,
        )
        registered.append({"metricId": metric_id, "name": name, "sourceColumns": columns, "formula": formula})
    analysis["metricRegistry"] = {
        "policy": "dynamic-semantic-metrics-only",
        "count": len(registered),
        "metrics": registered,
    }
    return registered
