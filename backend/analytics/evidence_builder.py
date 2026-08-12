from __future__ import annotations

from typing import Any

from .query_planner import build_query_context
from .runtime_query import execute_runtime_query_pipeline
from .sql_warehouse import query_dataset_evidence
from .warehouse import list_metrics, record_evidence


FORBIDDEN_KEYS = {
    "rows",
    "rawRows",
    "rawData",
    "raw_blob",
    "rawBlob",
    "messages",
    "records",
    "dataframe",
    "tables",
    "sampleRows",
}


def _strip_forbidden(value: Any) -> Any:
    if isinstance(value, dict):
        return {key: _strip_forbidden(child) for key, child in value.items() if key not in FORBIDDEN_KEYS}
    if isinstance(value, list):
        return [_strip_forbidden(item) for item in value[:120]]
    if isinstance(value, str) and len(value) > 3000:
        return value[:3000] + "...[truncated]"
    return value


def validate_model_payload(value: Any) -> None:
    if isinstance(value, dict):
        blocked = FORBIDDEN_KEYS.intersection(value.keys())
        if blocked:
            raise ValueError(f"Unsafe model payload contains raw-data keys: {', '.join(sorted(blocked))}")
        for child in value.values():
            validate_model_payload(child)
    elif isinstance(value, list):
        for child in value:
            validate_model_payload(child)


def build_evidence(
    question: str,
    analysis: dict[str, Any],
    owner_user_id: str,
    *,
    session_id: str | None = None,
) -> tuple[dict[str, Any], dict[str, Any]]:
    context, audit = build_query_context(question, analysis)
    dataset_id = str(analysis.get("datasetId") or "")
    runtime = execute_runtime_query_pipeline(question, analysis, owner_user_id, session_id=session_id)
    metrics = list_metrics(dataset_id, owner_user_id) if dataset_id else []
    runtime_evidence = runtime.get("processedEvidence", {}).get("structuredJson", {})
    sql_evidence = (
        query_dataset_evidence(dataset_id, owner_user_id, question)
        if dataset_id
        else {"available": False, "reason": "No persisted dataset is attached to this analysis."}
    )
    if sql_evidence.get("available"):
        runtime_evidence = {
            **runtime_evidence,
            "kpis": sql_evidence.get("kpis") or runtime_evidence.get("kpis"),
            "aggregations": sql_evidence.get("aggregations") or runtime_evidence.get("aggregations"),
            "topValues": sql_evidence.get("topValues"),
            "timeCoverage": sql_evidence.get("timeCoverage"),
            "dataQuality": sql_evidence.get("dataQuality") or runtime_evidence.get("dataQuality"),
            "sqlPolicy": sql_evidence.get("policy"),
        }
    evidence_validation = runtime.get("evidenceValidation", {})
    evidence = {
        "policy": "database-first-sql-evidence-pipeline",
        "question": question,
        "dataset": context.get("dataset", {}),
        "runtimeQueryRunId": runtime.get("runtimeQueryRunId"),
        "mandatoryFlow": runtime.get("mandatoryFlow", []),
        "intent": runtime.get("intent", {}),
        "queryPlan": {
            **(context.get("queryPlan", {}) or {}),
            **(runtime.get("queryPlan", {}) or {}),
        },
        "sqlExecution": runtime.get("sqlExecution", {}),
        "sqlWarehouseEvidence": sql_evidence,
        "evidence": context.get("evidence", {}),
        "runtimeEvidence": runtime_evidence,
        "postSqlProcessing": {
            "dataCleaning": runtime.get("processedEvidence", {}).get("dataCleaning", {}),
            "businessRules": runtime.get("processedEvidence", {}).get("businessRules", {}),
            "aggregation": runtime.get("processedEvidence", {}).get("aggregation", {}),
            "featureExtraction": runtime.get("processedEvidence", {}).get("featureExtraction", {}),
            "confidence": runtime.get("processedEvidence", {}).get("confidence"),
        },
        "contextOptimization": runtime.get("contextOptimization", {}),
        "evidenceValidation": evidence_validation,
        "metricRegistry": metrics[:60],
        "security": {
            "ownerUserId": owner_user_id,
            "datasetId": dataset_id,
            "rawRowsIncluded": False,
            "fullDatasetIncluded": False,
            "sensitiveColumnsRemoved": True,
            "modelReceivesOnly": "compact_structured_json_evidence",
        },
    }
    evidence = _strip_forbidden(evidence)
    validate_model_payload(evidence)
    metric_ids = [str(metric.get("metricId")) for metric in metrics if metric.get("metricId")]
    evidence_id = record_evidence(
        dataset_id or "unknown",
        owner_user_id,
        session_id=session_id,
        question=question,
        intent=str(evidence.get("queryPlan", {}).get("intent") or "unknown"),
        metric_ids=metric_ids,
        payload=evidence,
    )
    evidence["evidenceId"] = evidence_id
    audit = {
        **audit,
        "evidenceId": evidence_id,
        "runtimeQueryRunId": runtime.get("runtimeQueryRunId"),
        "sqlExecution": runtime.get("sqlExecution", {}),
        "evidenceValidation": evidence_validation,
        "metricRegistryCount": len(metrics),
        "sqlWarehouse": {
            "available": sql_evidence.get("available", False),
            "backend": sql_evidence.get("backend"),
            "policy": sql_evidence.get("policy"),
            "queryAudit": sql_evidence.get("queryAudit", {}),
        },
        "modelBoundary": evidence["security"],
        "mandatoryFlow": runtime.get("mandatoryFlow", []),
    }
    return evidence, audit
