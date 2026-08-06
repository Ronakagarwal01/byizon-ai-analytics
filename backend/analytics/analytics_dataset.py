from __future__ import annotations

import hashlib
import json
from copy import deepcopy
from datetime import datetime, timezone
from typing import Any

from . import warehouse


ANALYTICS_CONSUMERS = ["dashboard", "power_bi", "openai", "reports", "exports"]
FILTER_CONTRACT = ["dateRange", "department", "workspace", "connector", "project", "employee", "customer", "region"]
SENSITIVE_KEY_PARTS = (
    "token",
    "secret",
    "oauth",
    "password",
    "authorization",
    "access_key",
    "refresh_key",
    "cookie",
)
RAW_KEY_PARTS = ("raw", "connectorresponse", "temporary", "temp", "fullrows")


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _stable_hash(value: Any) -> str:
    return hashlib.sha256(json.dumps(value, ensure_ascii=True, sort_keys=True, default=str).encode("utf-8")).hexdigest()


def _safe_copy(value: Any, *, row_limit: int = 200) -> Any:
    if isinstance(value, dict):
        cleaned: dict[str, Any] = {}
        for key, child in value.items():
            lowered = str(key).replace("_", "").replace("-", "").lower()
            if any(part in lowered for part in SENSITIVE_KEY_PARTS):
                continue
            if any(part in lowered for part in RAW_KEY_PARTS):
                continue
            cleaned[key] = _safe_copy(child, row_limit=row_limit)
        return cleaned
    if isinstance(value, list):
        return [_safe_copy(item, row_limit=row_limit) for item in value[:row_limit]]
    return value


def _column_list(analysis: dict[str, Any]) -> list[str]:
    columns = analysis.get("columns") or []
    if isinstance(columns, list):
        return [str(col) for col in columns]
    return []


def _analytics_rows(analysis: dict[str, Any], limit: int = 500) -> list[dict[str, Any]]:
    rows = analysis.get("rows") or []
    if not isinstance(rows, list):
        return []
    return [_safe_copy(row, row_limit=50) for row in rows[:limit] if isinstance(row, dict)]


def _kpis(analysis: dict[str, Any]) -> list[dict[str, Any]]:
    source = analysis.get("kpis") or []
    if not isinstance(source, list):
        return []
    output = []
    for idx, item in enumerate(source[:80]):
        if not isinstance(item, dict):
            continue
        label = item.get("label") or item.get("name") or item.get("title") or f"KPI {idx + 1}"
        output.append(
            {
                "id": item.get("id") or hashlib.sha256(str(label).encode("utf-8")).hexdigest()[:12],
                "label": label,
                "value": item.get("value"),
                "displayValue": item.get("displayValue") or item.get("formattedValue"),
                "description": item.get("description") or item.get("desc") or "",
                "formula": item.get("formula") or "",
                "sourceColumns": item.get("sourceColumns") or item.get("source") or [],
                "confidence": item.get("confidence"),
                "whyUseful": item.get("whyUseful") or item.get("reason") or "",
            }
        )
    return _safe_copy(output, row_limit=80)


def _charts(analysis: dict[str, Any]) -> list[dict[str, Any]]:
    source = analysis.get("charts") or []
    if not isinstance(source, list):
        return []
    output = []
    for idx, item in enumerate(source[:40]):
        if not isinstance(item, dict):
            continue
        title = item.get("title") or item.get("label") or f"Chart {idx + 1}"
        output.append(
            {
                "id": item.get("id") or hashlib.sha256(str(title).encode("utf-8")).hexdigest()[:12],
                "title": title,
                "type": item.get("type") or item.get("chartType") or "bar",
                "data": _safe_copy(item.get("data") or item.get("values") or [], row_limit=200),
                "sourceColumns": item.get("sourceColumns") or item.get("columns") or [],
                "formula": item.get("formula") or "",
                "section": item.get("section") or "",
                "confidence": item.get("confidence"),
            }
        )
    return output


def _data_quality(analysis: dict[str, Any]) -> dict[str, Any]:
    quality = analysis.get("dataQuality") or analysis.get("dataQualitySummary") or {}
    return _safe_copy(quality if isinstance(quality, dict) else {}, row_limit=100)


def _dashboard_plan(analysis: dict[str, Any]) -> dict[str, Any]:
    plan = analysis.get("dashboardPlan") or analysis.get("dashboard_plan") or {}
    return _safe_copy(plan if isinstance(plan, dict) else {}, row_limit=100)


def _source_dataset_id(analysis: dict[str, Any]) -> str:
    provenance = analysis.get("sourceProvenance") if isinstance(analysis.get("sourceProvenance"), dict) else {}
    return (
        str(provenance.get("databaseRecordId") or "")
        or str(analysis.get("datasetId") or "")
        or str(analysis.get("sessionId") or "")
        or hashlib.sha256(str(analysis.get("fileName") or "dataset").encode("utf-8")).hexdigest()[:24]
    )


def build_analytics_dataset_payload(analysis: dict[str, Any], owner_user_id: str, *, refresh_kind: str = "initial") -> dict[str, Any]:
    dataset_id = _source_dataset_id(analysis)
    kpis = _kpis(analysis)
    charts = _charts(analysis)
    rows = _analytics_rows(analysis)
    columns = _column_list(analysis)
    data_quality = _data_quality(analysis)
    dashboard_plan = _dashboard_plan(analysis)
    metadata = {
        "datasetId": dataset_id,
        "fileName": analysis.get("fileName"),
        "rowCount": analysis.get("rowCount"),
        "colCount": analysis.get("colCount"),
        "datasetType": analysis.get("datasetType"),
        "sourceKind": (analysis.get("sourceProvenance") or {}).get("kind") if isinstance(analysis.get("sourceProvenance"), dict) else None,
        "generatedAt": _now(),
        "workspaceScoped": True,
    }
    structured_json = {
        "metadata": metadata,
        "kpis": kpis,
        "aggregations": _safe_copy(analysis.get("columnAggregates") or [], row_limit=100),
        "timeSeries": _safe_copy(analysis.get("timeSeries") or analysis.get("trends") or [], row_limit=100),
        "topRecords": _safe_copy(analysis.get("topRecords") or [], row_limit=50),
        "summary": _safe_copy(analysis.get("summary") or analysis.get("executiveSummary") or {}, row_limit=50),
        "confidence": analysis.get("confidence") or analysis.get("mappingConfidence"),
        "evidence": _safe_copy(analysis.get("evidence") or analysis.get("insights") or [], row_limit=100),
    }
    return {
        "datasetId": dataset_id,
        "metadata": metadata,
        "consumers": ANALYTICS_CONSUMERS,
        "filterContract": FILTER_CONTRACT,
        "metricContract": {
            "sourceOfTruth": "analytics_dataset",
            "requiredProductionStore": "postgresql_after_preprocessing",
            "activeStore": warehouse.active_store_name(),
            "upstreamStore": warehouse.active_store_name(),
            "dashboardMayRecalculate": False,
            "powerBiMayRecalculate": False,
            "openAIMayRecalculate": False,
            "reportsMayRecalculate": False,
            "exportsMayRecalculate": False,
        },
        "dashboard": {
            "kpis": kpis,
            "charts": charts,
            "dataQuality": data_quality,
            "dashboardPlan": dashboard_plan,
            "rows": rows,
            "columns": columns,
            "pagination": {"defaultPageSize": 100, "previewRowLimit": len(rows), "serverPagination": True},
            "filterContract": FILTER_CONTRACT,
        },
        "powerBi": {
            "semanticModelName": f"Byizon Analytics - {metadata.get('fileName') or dataset_id}",
            "connectionPolicy": "semantic_views_only",
            "metricsSource": "analytics_dataset",
            "semanticViews": [
                f"analytics_{dataset_id}_kpis",
                f"analytics_{dataset_id}_charts",
                f"analytics_{dataset_id}_quality",
                f"analytics_{dataset_id}_table_preview",
            ],
            "allowedViews": ["kpis", "charts", "quality", "table_preview", "filters", "manifest"],
            "rawTablesExposed": False,
            "temporaryTablesExposed": False,
            "oauthDataExposed": False,
            "sensitiveDataMasked": True,
            "filterContract": FILTER_CONTRACT,
        },
        "openAI": {"structuredJson": structured_json, "receivesRawData": False},
        "reports": {"kpis": kpis, "charts": charts, "dataQuality": data_quality, "source": "analytics_dataset"},
        "exports": {
            "formats": ["csv", "xlsx", "pdf", "report"],
            "source": "analytics_dataset",
            "mayRecalculate": False,
            "kpis": kpis,
            "charts": charts,
            "dataQuality": data_quality,
        },
        "refresh": {
            "manual": True,
            "scheduled": True,
            "incremental": True,
            "connectorSync": True,
            "refreshKind": refresh_kind,
            "strategy": "source_hash_and_dataset_version",
            "lastRefreshAt": _now(),
        },
        "security": {
            "workspaceIsolation": True,
            "rbacRequired": True,
            "sensitiveDataMasked": True,
            "rawConnectorDataExcluded": True,
        },
    }


def create_or_update_analytics_dataset(
    analysis: dict[str, Any],
    owner_user_id: str,
    *,
    refresh_kind: str = "initial",
) -> dict[str, Any]:
    payload = build_analytics_dataset_payload(analysis, owner_user_id, refresh_kind=refresh_kind)
    source_hash = _stable_hash(
        {
            "metadata": payload["metadata"],
            "kpis": payload["dashboard"]["kpis"],
            "charts": payload["dashboard"]["charts"],
            "quality": payload["dashboard"]["dataQuality"],
        }
    )
    return warehouse.upsert_analytics_dataset(
        payload["datasetId"],
        owner_user_id,
        payload,
        source_hash=source_hash,
        refresh_kind=refresh_kind,
    )


def get_analytics_dataset(
    dataset_id_or_analytics_id: str,
    owner_user_id: str,
    *,
    page: int = 1,
    page_size: int = 100,
    filters: dict[str, Any] | None = None,
) -> dict[str, Any] | None:
    record = warehouse.load_analytics_dataset(dataset_id_or_analytics_id, owner_user_id)
    if not record:
        return None
    payload = deepcopy(record["payload"])
    rows = payload.get("dashboard", {}).get("rows") or []
    if filters and isinstance(rows, list):
        rows = _apply_filters(rows, filters)
    start = max(page - 1, 0) * max(page_size, 1)
    end = start + max(page_size, 1)
    payload.setdefault("dashboard", {})["rows"] = rows[start:end]
    payload["dashboard"]["page"] = page
    payload["dashboard"]["pageSize"] = page_size
    payload["dashboard"]["totalRowsAfterFilter"] = len(rows)
    payload["dashboard"].setdefault("pagination", {}).update(
        {
            "page": page,
            "pageSize": page_size,
            "totalRowsAfterFilter": len(rows),
        }
    )
    return payload


def _apply_filters(rows: list[dict[str, Any]], filters: dict[str, Any]) -> list[dict[str, Any]]:
    active = {str(key).lower(): value for key, value in filters.items() if value not in (None, "", [], {})}
    if not active:
        return rows
    filtered = []
    for row in rows:
        normalized = {str(key).lower(): value for key, value in row.items()}
        keep = True
        for key, value in active.items():
            if key in {"page", "pagesize"}:
                continue
            if key in normalized and str(normalized[key]) != str(value):
                keep = False
                break
        if keep:
            filtered.append(row)
    return filtered


def build_power_bi_manifest(dataset_id_or_analytics_id: str, owner_user_id: str) -> dict[str, Any] | None:
    payload = get_analytics_dataset(dataset_id_or_analytics_id, owner_user_id, page=1, page_size=1)
    if not payload:
        return None
    return {
        "ok": True,
        "analyticsDatasetId": payload.get("analyticsDatasetId"),
        "datasetId": payload.get("datasetId"),
        "version": payload.get("version"),
        "model": payload.get("powerBi"),
        "refresh": payload.get("refresh"),
        "metricContract": payload.get("metricContract"),
        "security": payload.get("security"),
    }


def _quality_rows(payload: dict[str, Any]) -> list[dict[str, Any]]:
    quality = payload.get("dashboard", {}).get("dataQuality") or {}
    if not isinstance(quality, dict):
        return []
    rows = []
    for key, value in quality.items():
        if isinstance(value, (dict, list)):
            continue
        rows.append({"metric": key, "value": value})
    return rows


def get_power_bi_semantic_view(
    dataset_id_or_analytics_id: str,
    owner_user_id: str,
    view_name: str,
    *,
    page: int = 1,
    page_size: int = 100,
    filters: dict[str, Any] | None = None,
) -> dict[str, Any] | None:
    """Return Power BI-safe semantic view data from the analytics dataset only."""
    normalized = str(view_name or "").lower()
    if normalized in {"manifest", "model"} or normalized.endswith("_manifest"):
        return build_power_bi_manifest(dataset_id_or_analytics_id, owner_user_id)

    payload = get_analytics_dataset(
        dataset_id_or_analytics_id,
        owner_user_id,
        page=page,
        page_size=page_size,
        filters=filters,
    )
    if not payload:
        return None

    dashboard = payload.get("dashboard") or {}
    base = {
        "ok": True,
        "analyticsDatasetId": payload.get("analyticsDatasetId"),
        "datasetId": payload.get("datasetId"),
        "version": payload.get("version"),
        "source": "analytics_dataset",
        "mayRecalculate": False,
        "metricContract": payload.get("metricContract"),
        "filterContract": payload.get("filterContract"),
    }
    if normalized in {"kpis", "metrics"} or normalized.endswith("_kpis"):
        return {**base, "viewName": "kpis", "columns": ["id", "label", "value", "displayValue", "formula", "sourceColumns"], "rows": dashboard.get("kpis") or []}
    if normalized in {"charts", "visuals"} or normalized.endswith("_charts"):
        return {**base, "viewName": "charts", "columns": ["id", "title", "type", "data", "sourceColumns", "formula", "confidence"], "rows": dashboard.get("charts") or []}
    if normalized in {"quality", "data_quality"} or normalized.endswith("_quality"):
        return {**base, "viewName": "quality", "columns": ["metric", "value"], "rows": _quality_rows(payload)}
    if normalized in {"table_preview", "preview", "rows"} or normalized.endswith("_table_preview"):
        return {
            **base,
            "viewName": "table_preview",
            "columns": dashboard.get("columns") or [],
            "rows": dashboard.get("rows") or [],
            "pagination": dashboard.get("pagination") or {},
        }
    if normalized in {"filters", "filter_contract"} or normalized.endswith("_filters"):
        return {**base, "viewName": "filters", "columns": ["filter"], "rows": [{"filter": item} for item in FILTER_CONTRACT]}
    return None
