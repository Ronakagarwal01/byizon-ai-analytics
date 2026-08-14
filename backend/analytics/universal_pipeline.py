from __future__ import annotations

from typing import Any, Callable

from .dataset_store import load_dataset_bytes, store_dataset
from .file_parser import parse_file
from .metric_registry import register_analysis_metrics
from .sql_warehouse import finalize_dataset_metadata, ingest_parsed_dataset
from .warehouse import add_layer, complete_pipeline_run, create_pipeline_run, update_pipeline_stage


ETL_STAGES = [
    "source_committed_to_database",
    "stored_source_verified",
    "workspace_ownership_bound",
    "raw_layer_persisted",
    "sql_warehouse_ingested",
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
    analyzer: Callable[[str, dict[str, Any]], dict[str, Any]],
) -> tuple[dict[str, Any], dict[str, Any]]:
    prepared = prepare_universal_pipeline(
        file_name,
        content,
        owner_user_id,
        source_kind,
        content_type=content_type,
        metadata=metadata,
    )
    result = analyzer(file_name, prepared["parsed"])
    finalize_universal_pipeline(result, prepared)
    return result, prepared["dataset"]


def prepare_universal_pipeline(
    file_name: str,
    content: bytes,
    owner_user_id: str,
    source_kind: str,
    *,
    content_type: str,
    metadata: dict[str, Any] | None,
) -> dict[str, Any]:
    """Commit, verify, parse once, and bulk-load the uploaded dataset."""
    prepared = prepare_upload_source(
        file_name,
        content,
        owner_user_id,
        source_kind,
        content_type=content_type,
        metadata=metadata,
    )
    ingest_prepared_pipeline(prepared)
    return prepared


def prepare_upload_source(
    file_name: str,
    content: bytes,
    owner_user_id: str,
    source_kind: str,
    *,
    content_type: str,
    metadata: dict[str, Any] | None,
) -> dict[str, Any]:
    """Persist, verify, and parse an upload without waiting for warehouse expansion."""
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
    parsed = parse_file(file_name, stored_content)
    return {
        "fileName": file_name,
        "content": stored_content,
        "ownerUserId": owner_user_id,
        "sourceKind": source_kind,
        "dataset": dataset,
        "runId": run_id,
        "parsed": parsed,
        "sqlWarehouse": {
            "backend": "queued",
            "datasetId": dataset["datasetId"],
            "databaseFirst": True,
            "fullRowsStored": 0,
            "normalizedCellCount": 0,
            "prebuiltQueryCount": 5,
            "rawRowsSentToModel": False,
            "status": "processing",
        },
    }


def ingest_prepared_pipeline(prepared: dict[str, Any]) -> dict[str, Any]:
    """Bulk-load a verified parsed upload into the SQL warehouse in a worker."""
    dataset = prepared["dataset"]
    stored_content = prepared["content"]
    parsed = prepared["parsed"]
    owner_user_id = prepared["ownerUserId"]
    run_id = prepared["runId"]
    sql_warehouse = ingest_parsed_dataset(
        dataset=dataset,
        content=stored_content,
        parsed=parsed,
    )
    add_layer(
        run_id,
        dataset["datasetId"],
        owner_user_id,
        "sql_warehouse",
        f"analytics_sources:{dataset['datasetId']}",
        {
            "backend": sql_warehouse["backend"],
            "fullRowsStored": sql_warehouse["fullRowsStored"],
            "normalizedCellCount": sql_warehouse["normalizedCellCount"],
            "queryCatalogVersion": sql_warehouse["queryCatalogVersion"],
            "rawRowsSentToModel": False,
        },
    )
    update_pipeline_stage(run_id, owner_user_id, "sql_warehouse_ingested")
    prepared["sqlWarehouse"] = {**sql_warehouse, "status": "complete"}
    return prepared["sqlWarehouse"]


def attach_universal_metadata(
    result: dict[str, Any],
    prepared: dict[str, Any],
    *,
    analysis_status: str,
    progress_value: int,
    progress_stage: str,
    progress_message: str,
) -> dict[str, Any]:
    dataset = prepared["dataset"]
    run_id = prepared["runId"]
    owner_user_id = prepared["ownerUserId"]
    sql_warehouse = prepared["sqlWarehouse"]
    result["datasetId"] = dataset["datasetId"]
    result["storagePolicy"] = "database-first"
    result["pipelineRunId"] = run_id
    result["pipelineTrace"] = list(ETL_STAGES)
    result["analysisStatus"] = analysis_status
    result["processing"] = {
        "status": analysis_status,
        "progress": max(0, min(int(progress_value), 100)),
        "stage": progress_stage,
        "message": progress_message,
    }
    sensitive_columns = _classify_sensitive_columns(result)
    result["securityPolicy"] = {
        "workspaceIsolated": True,
        "rawRowsNeverSentToModel": True,
        "llmInput": "query-scoped evidence JSON only",
        "sensitiveColumns": sensitive_columns,
    }
    result["sqlWarehouse"] = sql_warehouse
    return result


def finalize_universal_pipeline(result: dict[str, Any], prepared: dict[str, Any]) -> dict[str, Any]:
    dataset = prepared["dataset"]
    run_id = prepared["runId"]
    owner_user_id = prepared["ownerUserId"]
    sql_warehouse = prepared["sqlWarehouse"]
    attach_universal_metadata(
        result,
        prepared,
        analysis_status="complete",
        progress_value=100,
        progress_stage="complete",
        progress_message="Dashboard and advanced analysis are ready.",
    )
    sensitive_columns = result["securityPolicy"]["sensitiveColumns"]
    finalize_dataset_metadata(dataset["datasetId"], owner_user_id, result)
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
            "postgresql_analytics_warehouse",
            "universal_etl",
            "analytics_layers",
            "metric_registry",
            "evidence_builder",
            "ai_orchestrator",
            "dashboard_charts_insights",
        ],
        "layers": ["raw", "sql_warehouse", "clean", "analytics", "materialized", "power_bi", "evidence"],
        "metricCount": len(registered),
        "sqlWarehouse": {
            "backend": sql_warehouse["backend"],
            "fullRowsStored": sql_warehouse["fullRowsStored"],
            "prebuiltQueryCount": sql_warehouse["prebuiltQueryCount"],
            "rawRowsSentToModel": False,
        },
    }
    complete_pipeline_run(run_id, owner_user_id, {"stages": ETL_STAGES, **manifest})
    return result
