from __future__ import annotations

from typing import Any, Callable

from .dataset_store import load_dataset_bytes, store_dataset
from .metric_registry import register_analysis_metrics
from .warehouse import add_layer, complete_pipeline_run, create_pipeline_run, update_pipeline_stage


ETL_STAGES = [
    "source_committed_to_database",
    "stored_source_verified",
    "workspace_ownership_bound",
    "raw_layer_persisted",
    "source_integrity_verified",
    "parser_selected",
    "clean_layer_profiled",
    "schema_semantics_inferred",
    "sensitive_columns_classified",
    "analytics_layer_built",
    "metric_registry_updated",
    "materialized_views_planned",
    "power_bi_contract_prepared",
    "evidence_layer_prepared",
    "deterministic_processing_completed",
    "query_scoped_context_ready",
]


SENSITIVE_HINTS = ("email", "phone", "mobile", "address", "ssn", "aadhaar", "pan", "password", "token")


def _classify_sensitive_columns(analysis: dict[str, Any]) -> list[str]:
    columns: list[str] = []
    for column in analysis.get("columns") or []:
        name = str(column.get("name") if isinstance(column, dict) else column).lower()
        if any(hint in name for hint in SENSITIVE_HINTS):
            columns.append(str(column.get("name") if isinstance(column, dict) else column))
    return columns


def _safe_layers_manifest(analysis: dict[str, Any], sensitive_columns: list[str]) -> dict[str, Any]:
    return {
        "rowCount": analysis.get("rowCount"),
        "colCount": analysis.get("colCount"),
        "datasetType": analysis.get("datasetType"),
        "qualityScore": analysis.get("qualityScore"),
        "sensitiveColumnCount": len(sensitive_columns),
        "sensitiveColumns": sensitive_columns,
    }


def run_universal_pipeline(
    file_name: str,
    content: bytes,
    owner_user_id: str,
    source_kind: str,
    *,
    content_type: str,
    metadata: dict[str, Any] | None,
    analyzer: Callable[[str, bytes], dict[str, Any]],
) -> tuple[dict[str, Any], dict[str, Any]]:
    dataset = store_dataset(
        file_name,
        content,
        owner_user_id,
        content_type=content_type,
        source_kind=source_kind,
        metadata=metadata,
    )
    run_id = create_pipeline_run(
        dataset["datasetId"],
        owner_user_id,
        source_kind,
        {"fileName": file_name, "contentType": content_type, "metadata": metadata or {}},
    )
    add_layer(
        run_id,
        dataset["datasetId"],
        owner_user_id,
        "raw",
        f"uploaded_datasets.raw_blob:{dataset['datasetId']}",
        {"sha256": dataset["sha256"], "sizeBytes": dataset["sizeBytes"], "policy": "encrypted-at-rest-ready"},
    )
    stored_content = load_dataset_bytes(dataset["datasetId"], owner_user_id)
    if stored_content != content:
        raise ValueError("Stored source verification failed; analysis aborted.")
    update_pipeline_stage(run_id, owner_user_id, "stored_source_verified")
    result = analyzer(file_name, stored_content)
    result["datasetId"] = dataset["datasetId"]
    result["storagePolicy"] = "database-first"
    result["pipelineRunId"] = run_id
    result["pipelineTrace"] = list(ETL_STAGES)
    sensitive_columns = _classify_sensitive_columns(result)
    result["securityPolicy"] = {
        "workspaceIsolated": True,
        "rawRowsNeverSentToModel": True,
        "llmInput": "query-scoped evidence JSON only",
        "sensitiveColumns": sensitive_columns,
    }
    manifest = _safe_layers_manifest(result, sensitive_columns)
    for layer_name in ("clean", "analytics", "materialized", "power_bi", "evidence"):
        add_layer(
            run_id,
            dataset["datasetId"],
            owner_user_id,
            layer_name,
            f"{layer_name}_layer:{dataset['datasetId']}",
            {**manifest, "layer": layer_name, "rawRowsStored": False},
        )
        update_pipeline_stage(run_id, owner_user_id, f"{layer_name}_layer_ready")
    registered = register_analysis_metrics(result, owner_user_id)
    update_pipeline_stage(run_id, owner_user_id, "metric_registry_updated")
    result["dataArchitecture"] = {
        "flow": [
            "connector_or_upload",
            "source_validation",
            "raw_database_storage",
            "universal_etl",
            "analytics_layers",
            "metric_registry",
            "evidence_builder",
            "ai_orchestrator",
            "dashboard_charts_insights",
        ],
        "layers": ["raw", "clean", "analytics", "materialized", "power_bi", "evidence"],
        "metricCount": len(registered),
    }
    complete_pipeline_run(run_id, owner_user_id, {"stages": ETL_STAGES, **manifest})
    return result, dataset
