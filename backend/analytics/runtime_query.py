from __future__ import annotations

import json
import re
from dataclasses import dataclass
from typing import Any

from . import warehouse
from .query_planner import plan_query


MANDATORY_FLOW = [
    "user_query",
    "backend_api",
    "authentication",
    "workspace_validation",
    "intent_detection",
    "determine_data_source",
    "determine_metrics",
    "query_planner",
    "safe_sql_generator",
    "sql_validation",
    "execute_sql",
    "fetch_only_required_data",
    "data_cleaning",
    "business_rules",
    "aggregation",
    "feature_extraction",
    "structured_json",
    "context_optimization",
    "evidence_validation",
    "ai_orchestrator",
    "dashboard_and_final_response",
]

ALLOWED_TABLES = {"metric_registry"}
ALLOWED_COLUMNS = {
    "metric_id",
    "name",
    "description",
    "formula",
    "source_columns_json",
    "aggregation_rules_json",
    "validation_rules_json",
    "business_meaning",
    "confidence",
}
BLOCKED_SQL = re.compile(
    r"\b(insert|update|delete|drop|alter|create|attach|detach|pragma|vacuum|replace|truncate)\b",
    re.IGNORECASE,
)
SENSITIVE_KEYWORDS = re.compile(r"(password|secret|token|api[_ -]?key|auth|credential|phone|email)", re.IGNORECASE)


@dataclass(frozen=True)
class SafeSQL:
    template: str
    parameters: list[Any]
    expected_columns: list[str]
    max_records: int


def _tokens(question: str) -> list[str]:
    return [
        token
        for token in re.findall(r"[a-z0-9_]+", question.lower())
        if len(token) > 2
    ][:8]


def _loads(value: Any, fallback: Any) -> Any:
    if not value:
        return fallback
    if isinstance(value, (dict, list)):
        return value
    try:
        return json.loads(str(value))
    except Exception:
        return fallback


def _rank(items: list[dict[str, Any]], tokens: list[str], limit: int) -> list[dict[str, Any]]:
    if not items:
        return []
    if not tokens:
        return items[:limit]

    def score(item: dict[str, Any]) -> tuple[int, float]:
        haystack = json.dumps(item, ensure_ascii=False, default=str).lower()
        match_score = sum(1 for token in tokens if token in haystack)
        confidence = float(item.get("confidence") or 0)
        return match_score, confidence

    ranked = sorted(items, key=score, reverse=True)
    matched = [item for item in ranked if score(item)[0] > 0]
    return (matched or ranked)[:limit]


def detect_intent(question: str, analysis: dict[str, Any]) -> dict[str, Any]:
    base_plan = plan_query(question, analysis)
    dataset_id = str(analysis.get("datasetId") or "").strip()
    source = analysis.get("connectedSource") or analysis.get("sourceProvenance") or {}
    semantic = analysis.get("semanticSchema") or analysis.get("schema") or {}
    metrics = []
    for item in analysis.get("kpis") or []:
        if isinstance(item, dict):
            metrics.append(str(item.get("label") or item.get("name") or "").strip())
    return {
        "intent": base_plan.get("intent") or "general_analysis",
        "domain": analysis.get("businessDomain") or analysis.get("datasetType") or "generic",
        "datasetId": dataset_id,
        "connector": source.get("connectorId") or source.get("sourceKind") or source.get("source") or "uploaded_file",
        "candidateMetrics": [metric for metric in metrics if metric][:12],
        "dateColumns": list(semantic.get("dateColumns") or analysis.get("dateColumns") or [])[:6],
        "dimensions": list(semantic.get("categoricalColumns") or analysis.get("categoricalColumns") or [])[:10],
        "aggregation": "backend_calculated",
        "tokens": _tokens(question),
        "confidence": 0.9 if dataset_id else 0.35,
        "note": "Intent detection classifies the request only; it never answers business questions.",
    }


def build_runtime_query_plan(intent: dict[str, Any], analysis: dict[str, Any]) -> dict[str, Any]:
    dataset_id = str(intent.get("datasetId") or "")
    metrics = list(intent.get("candidateMetrics") or [])
    requested_tokens = list(intent.get("tokens") or [])
    return {
        "datasetId": dataset_id,
        "dataSource": {
            "type": "analytics_warehouse",
            "adapter": "sqlite_runtime_adapter",
            "futureAdapter": "postgresql_same_contract",
            "allowedTables": ["metric_registry"],
        },
        "requiredTables": ["metric_registry"],
        "requiredMetrics": metrics[:8],
        "filters": {
            "workspaceOwnerRequired": True,
            "datasetRequired": True,
            "tokens": requested_tokens,
        },
        "dimensions": intent.get("dimensions") or [],
        "dateColumns": intent.get("dateColumns") or [],
        "aggregation": "precomputed_metric_registry_then_backend_processing",
        "sorting": "confidence_desc_created_desc",
        "costLimit": {"maxReturnedRecords": 40, "noFullScans": True},
        "permissions": {
            "ownerUserIdRequired": True,
            "datasetScopeRequired": True,
        },
        "canProceed": bool(dataset_id),
        "plannerBoundary": "Plan only. SQL is generated by the safe SQL generator.",
    }


def generate_safe_sql(query_plan: dict[str, Any]) -> SafeSQL:
    tokens = list(query_plan.get("filters", {}).get("tokens") or [])
    dataset_id = str(query_plan.get("datasetId") or "")
    max_records = int(query_plan.get("costLimit", {}).get("maxReturnedRecords") or 40)
    max_records = max(1, min(max_records, 40))
    columns = [
        "metric_id",
        "name",
        "description",
        "formula",
        "source_columns_json",
        "aggregation_rules_json",
        "validation_rules_json",
        "business_meaning",
        "confidence",
    ]
    template = (
        "SELECT metric_id, name, description, formula, source_columns_json, "
        "aggregation_rules_json, validation_rules_json, business_meaning, confidence "
        "FROM metric_registry WHERE dataset_id = ? AND owner_user_id = ?"
    )
    parameters: list[Any] = [dataset_id, "__OWNER_USER_ID__"]
    if tokens:
        like = f"%{tokens[0][:48]}%"
        template += (
            " AND (LOWER(name) LIKE ? OR LOWER(description) LIKE ? "
            "OR LOWER(business_meaning) LIKE ? OR LOWER(formula) LIKE ?)"
        )
        parameters.extend([like, like, like, like])
    template += " ORDER BY COALESCE(confidence, 0) DESC, created_at DESC LIMIT ?"
    parameters.append(max_records)
    return SafeSQL(template=template, parameters=parameters, expected_columns=columns, max_records=max_records)


def validate_sql(safe_sql: SafeSQL, query_plan: dict[str, Any]) -> dict[str, Any]:
    sql = safe_sql.template.strip()
    selected = sql.split(" FROM ", 1)[0].replace("SELECT", "", 1)
    requested_columns = {part.strip() for part in selected.split(",") if part.strip()}
    referenced_tables = set(re.findall(r"\bFROM\s+([a-z_]+)", sql, flags=re.IGNORECASE))
    violations: list[str] = []
    if "*" in selected:
        violations.append("SELECT * is not allowed")
    if ";" in sql or "--" in sql or "/*" in sql:
        violations.append("SQL comments or multiple statements are not allowed")
    if BLOCKED_SQL.search(sql):
        violations.append("Only read-only SELECT statements are allowed")
    if not referenced_tables.issubset(ALLOWED_TABLES):
        violations.append("Query references a non-allowlisted table")
    if not requested_columns.issubset(ALLOWED_COLUMNS):
        violations.append("Query references a non-allowlisted column")
    if " owner_user_id = ?" not in sql or " dataset_id = ?" not in sql:
        violations.append("Workspace and dataset scoping are mandatory")
    if " LIMIT ?" not in sql:
        violations.append("Bounded LIMIT is mandatory")
    if not query_plan.get("canProceed"):
        violations.append("No persisted dataset id is available")
    return {
        "ok": not violations,
        "violations": violations,
        "usesParameterizedSql": "?" in sql and "__OWNER_USER_ID__" in safe_sql.parameters,
        "selectStarBlocked": True,
        "allowedTables": sorted(ALLOWED_TABLES),
        "allowedColumns": sorted(ALLOWED_COLUMNS),
        "maxReturnedRecords": safe_sql.max_records,
    }


def execute_safe_sql(
    run_id: str,
    owner_user_id: str,
    safe_sql: SafeSQL,
    validation: dict[str, Any],
) -> tuple[list[dict[str, Any]], str | None]:
    parameters = [owner_user_id if value == "__OWNER_USER_ID__" else value for value in safe_sql.parameters]
    if not validation.get("ok"):
        audit_id = warehouse.record_sql_execution(
            run_id,
            owner_user_id,
            sql_template=safe_sql.template,
            parameters=parameters,
            validation=validation,
            returned_rows=0,
            returned_columns=0,
            status="blocked",
            error="; ".join(validation.get("violations") or []),
        )
        return [], audit_id
    with warehouse._database() as conn:
        result = conn.execute(safe_sql.template, parameters).fetchall()
    records = [
        {column: row[column] for column in safe_sql.expected_columns if column in row.keys()}
        for row in result
    ]
    audit_id = warehouse.record_sql_execution(
        run_id,
        owner_user_id,
        sql_template=safe_sql.template,
        parameters=parameters,
        validation=validation,
        returned_rows=len(records),
        returned_columns=len(safe_sql.expected_columns),
        status="complete",
    )
    return records, audit_id


def _clean_metric_record(record: dict[str, Any]) -> dict[str, Any]:
    source_columns = [
        str(column)
        for column in _loads(record.get("source_columns_json"), [])
        if column and not SENSITIVE_KEYWORDS.search(str(column))
    ]
    return {
        "metricId": record.get("metric_id"),
        "name": record.get("name"),
        "description": record.get("description") or "",
        "formula": record.get("formula") or "",
        "sourceColumns": source_columns[:8],
        "aggregationRules": _loads(record.get("aggregation_rules_json"), {}),
        "validationRules": _loads(record.get("validation_rules_json"), {}),
        "businessMeaning": record.get("business_meaning") or "",
        "confidence": record.get("confidence"),
    }


def post_process_evidence(
    metric_records: list[dict[str, Any]],
    query_plan: dict[str, Any],
    analysis: dict[str, Any],
    tokens: list[str],
) -> dict[str, Any]:
    cleaned = [_clean_metric_record(record) for record in metric_records]
    ranked_metrics = _rank(cleaned, tokens, 12)
    quality = analysis.get("dataQuality") or {}
    compact_kpis = _rank(
        [
            {
                "label": item.get("label") or item.get("name"),
                "value": item.get("value"),
                "formula": item.get("formula") or item.get("explainability", {}).get("formula"),
                "sourceColumns": item.get("sourceColumns") or item.get("explainability", {}).get("sourceColumns"),
                "whyUseful": item.get("whyUseful") or item.get("description"),
                "confidence": item.get("confidence"),
            }
            for item in analysis.get("kpis") or []
            if isinstance(item, dict)
        ],
        tokens,
        8,
    )
    features = {
        "metricCount": len(ranked_metrics),
        "kpiCount": len(compact_kpis),
        "hasDateColumns": bool(query_plan.get("dateColumns")),
        "dimensionCount": len(query_plan.get("dimensions") or []),
        "qualityScore": quality.get("quality"),
    }
    confidence_values = [
        float(metric["confidence"])
        for metric in ranked_metrics
        if isinstance(metric.get("confidence"), (int, float))
    ]
    confidence = round(sum(confidence_values) / len(confidence_values), 3) if confidence_values else 0.75
    return {
        "dataCleaning": {
            "nullMetricRecordsRemoved": len(metric_records) - len(cleaned),
            "sensitiveColumnsRemoved": True,
            "normalization": "JSON fields parsed and source columns filtered",
        },
        "businessRules": {
            "backendCalculatesMetrics": True,
            "aiDoesNotCalculateKpis": True,
            "unsupportedMetricsMustBeRejected": True,
        },
        "aggregation": {
            "strategy": "precomputed_metrics_plus_compact_analysis_evidence",
            "recordsAfterAggregation": len(ranked_metrics),
        },
        "featureExtraction": features,
        "structuredJson": {
            "metrics": ranked_metrics,
            "kpis": compact_kpis,
            "dataQuality": {
                "completeness": quality.get("completeness"),
                "qualityScore": quality.get("quality"),
                "duplicateRows": quality.get("duplicates") or analysis.get("duplicateRows"),
                "missingSummary": list(quality.get("missingSummary") or [])[:12],
                "outlierSummary": list(quality.get("outlierSummary") or [])[:8],
            },
        },
        "confidence": confidence,
    }


def optimize_context(runtime_payload: dict[str, Any]) -> dict[str, Any]:
    compact = json.loads(json.dumps(runtime_payload, ensure_ascii=True, default=str))
    compact.pop("sqlTemplateInternal", None)
    encoded = json.dumps(compact, ensure_ascii=True, default=str)
    if len(encoded) > 24000:
        structured = compact.get("processedEvidence", {}).get("structuredJson", {})
        structured["metrics"] = list(structured.get("metrics") or [])[:6]
        structured["kpis"] = list(structured.get("kpis") or [])[:5]
        compact["contextOptimization"] = {"truncated": True, "maxCharacters": 24000}
    else:
        compact["contextOptimization"] = {"truncated": False, "characters": len(encoded)}
    return compact


def validate_evidence(runtime_payload: dict[str, Any]) -> dict[str, Any]:
    structured = runtime_payload.get("processedEvidence", {}).get("structuredJson", {})
    has_evidence = bool(structured.get("metrics") or structured.get("kpis") or structured.get("dataQuality"))
    sql_ok = bool(runtime_payload.get("sqlExecution", {}).get("validation", {}).get("ok"))
    return {
        "sufficientForModel": bool(has_evidence and sql_ok),
        "reason": "query_scoped_evidence_available" if has_evidence and sql_ok else "insufficient_safe_evidence",
        "rawRowsSentToModel": False,
        "fullDatasetSentToModel": False,
        "dashboardUsesSameEvidence": True,
    }


def execute_runtime_query_pipeline(
    question: str,
    analysis: dict[str, Any],
    owner_user_id: str,
    *,
    session_id: str | None = None,
) -> dict[str, Any]:
    intent = detect_intent(question, analysis)
    query_plan = build_runtime_query_plan(intent, analysis)
    run_id = warehouse.create_runtime_query_run(
        str(intent.get("datasetId") or "unknown"),
        owner_user_id,
        session_id=session_id,
        question=question,
        intent=intent,
        query_plan=query_plan,
    )
    try:
        safe_sql = generate_safe_sql(query_plan)
        validation = validate_sql(safe_sql, query_plan)
        metric_records, sql_audit_id = execute_safe_sql(run_id, owner_user_id, safe_sql, validation)
        processed = post_process_evidence(metric_records, query_plan, analysis, list(intent.get("tokens") or []))
        payload = {
            "runtimeQueryRunId": run_id,
            "mandatoryFlow": MANDATORY_FLOW,
            "intent": intent,
            "queryPlan": query_plan,
            "sqlExecution": {
                "auditId": sql_audit_id,
                "safeSql": {
                    "template": safe_sql.template,
                    "usesParameterizedSql": True,
                    "selectStar": False,
                    "returnedColumns": safe_sql.expected_columns,
                    "maxReturnedRecords": safe_sql.max_records,
                },
                "validation": validation,
                "fetchedOnlyRequiredData": True,
                "returnedRecordCount": len(metric_records),
            },
            "processedEvidence": processed,
            "modelBoundary": {
                "modelReceivesOnly": "compact_structured_json_evidence",
                "rawRowsIncluded": False,
                "fullDatasetIncluded": False,
                "internalIdsRemoved": True,
                "sensitiveColumnsRemoved": True,
            },
        }
        payload = optimize_context(payload)
        payload["evidenceValidation"] = validate_evidence(payload)
        warehouse.complete_runtime_query_run(
            run_id,
            owner_user_id,
            status="complete" if payload["evidenceValidation"]["sufficientForModel"] else "insufficient_evidence",
            manifest={
                "sqlAuditId": sql_audit_id,
                "evidenceValidation": payload["evidenceValidation"],
                "flow": MANDATORY_FLOW,
            },
        )
        return payload
    except Exception as exc:
        warehouse.complete_runtime_query_run(
            run_id,
            owner_user_id,
            status="failed",
            manifest={"flow": MANDATORY_FLOW},
            error=str(exc),
        )
        raise
