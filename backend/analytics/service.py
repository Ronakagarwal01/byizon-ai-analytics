from __future__ import annotations

import math
from typing import Any, Callable

import numpy as np
import pandas as pd

from .anomaly_engine import build_anomaly_analysis
from .chatbot_query_engine import answer_question
from .dashboard_planner import build_dashboard_plan
from .data_profiler import build_data_profile, clean_numeric
from .data_science_engine import run_data_science_workflow
from .domain_detector import detect_domain
from .file_parser import parse_file
from .insight_engine import generate_insights
from .metric_planner import compute_metrics
from .report_generator import generate_report
from .root_cause_engine import build_root_causes
from .schema_detector import detect_schema
from .semantic_understanding_engine import understand_schema
from .statistics_engine import build_statistics


ANALYSIS_VERSION = "2026-07-15-source-isolation-v8"


def _jsonable(value: Any) -> Any:
    if isinstance(value, dict):
        return {str(key): _jsonable(val) for key, val in value.items()}
    if isinstance(value, list):
        return [_jsonable(item) for item in value]
    if isinstance(value, tuple):
        return [_jsonable(item) for item in value]
    if isinstance(value, (np.integer,)):
        return int(value)
    if isinstance(value, (np.floating,)):
        if math.isnan(float(value)) or math.isinf(float(value)):
            return None
        return float(value)
    if isinstance(value, (pd.Timestamp,)):
        return value.isoformat()
    if isinstance(value, float) and (math.isnan(value) or math.isinf(value)):
        return None
    return value


def _build_llm_context(result: dict[str, Any]) -> dict[str, Any]:
    """Return only deterministic, compact evidence that an LLM may receive."""
    semantic_columns = []
    for column in (result.get("semanticColumns") or [])[:100]:
        if not isinstance(column, dict):
            continue
        semantic_columns.append({
            "name": column.get("name"),
            "semanticType": column.get("semanticType") or column.get("semantic_type"),
            "analyticalRole": column.get("analyticalRole") or column.get("analytical_role"),
            "importanceScore": column.get("importanceScore") or column.get("importance_score"),
        })

    compact_kpis = []
    for kpi in (result.get("kpis") or [])[:12]:
        if not isinstance(kpi, dict):
            continue
        explainability = kpi.get("explainability") if isinstance(kpi.get("explainability"), dict) else {}
        source_columns = (
            kpi.get("sourceColumns")
            or explainability.get("sourceColumns")
            or explainability.get("sourceColumn")
            or []
        )
        if isinstance(source_columns, str):
            source_columns = [source_columns]
        compact_kpis.append({
            "label": kpi.get("label") or kpi.get("title"),
            "value": kpi.get("value"),
            "formattedValue": kpi.get("formattedValue"),
            "formula": kpi.get("formula") or explainability.get("formula"),
            "sourceColumns": source_columns,
            "confidence": kpi.get("confidence") or explainability.get("confidence"),
        })

    compact_charts = []
    for chart in (result.get("charts") or [])[:6]:
        if not isinstance(chart, dict):
            continue
        compact_charts.append({
            "id": chart.get("id"),
            "title": chart.get("title"),
            "type": chart.get("type"),
            "sourceColumns": chart.get("sourceColumns") or [],
            "data": (chart.get("data") or [])[:12],
        })

    return {
        "schemaVersion": "1.0",
        "policy": "processed-evidence-only-no-raw-rows",
        "fileName": result.get("fileName"),
        "rowCount": result.get("rowCount"),
        "colCount": result.get("colCount"),
        "datasetType": result.get("datasetType"),
        "businessDomain": result.get("businessDomain"),
        "columns": semantic_columns,
        "dataQuality": result.get("dataQualitySummary") or result.get("dataQuality"),
        "kpis": compact_kpis,
        "charts": compact_charts,
        "insights": (result.get("insightObjects") or result.get("insights") or [])[:8],
        "hiddenPatterns": (result.get("hiddenPatterns") or [])[:8],
        "recommendations": (result.get("recommendations") or [])[:8],
        "summary": result.get("summary"),
    }


def _records(df: pd.DataFrame, limit: int = 5000) -> list[dict[str, Any]]:
    clean = df.head(limit).copy()
    for column in clean.columns:
        if pd.api.types.is_datetime64_any_dtype(clean[column]):
            clean[column] = clean[column].astype(str)
    clean = clean.replace({np.nan: ""})
    return _jsonable(clean.to_dict(orient="records"))


def prepare_analysis(parsed: dict[str, Any]) -> dict[str, Any]:
    """Compute the deterministic dashboard once and retain reusable deep-analysis inputs."""
    base_schema = detect_schema(parsed)
    profile = build_data_profile(parsed, base_schema)
    domain_result = detect_domain(parsed, profile)
    schema = understand_schema(parsed, profile, domain_result)
    stats_result = build_statistics(parsed, schema, profile)
    kpi_result = compute_metrics(parsed, schema, profile, stats_result)
    anomaly_result = build_anomaly_analysis(profile, schema)
    dashboard_plan = build_dashboard_plan(parsed, schema, profile, stats_result, anomaly_result)
    planned_kpis = dashboard_plan["overview_cards"] + dashboard_plan["story_cards"]
    kpi_result["kpis"] = planned_kpis
    root_cause_result = build_root_causes(parsed, schema, kpi_result, anomaly_result)
    chart_result = _chart_result_from_dashboard_plan(dashboard_plan)
    insight_result = generate_insights(schema, profile, kpi_result, anomaly_result)
    _merge_dashboard_plan_insights(insight_result, dashboard_plan)
    _merge_root_cause_patterns(insight_result, root_cause_result)
    primary_table = next(table for table in parsed["tables"] if table.name == schema["primaryTable"])
    primary_profile = next(table for table in profile["tableProfiles"] if table["name"] == schema["primaryTable"])
    data_quality = {
        **profile["overall"],
        "negativeValues": 0,
        "zeroValues": 0,
        # Legacy frontend compatibility keys. They are not used for planning.
        "negativeRevenue": 0,
        "negativeQuantity": 0,
        "zeroRevenue": 0,
        "zeroQuantity": 0,
        "missingValuesByColumn": primary_profile["missingValuesByColumn"],
        "severity": anomaly_result["dataQualitySummary"]["severity"],
    }

    table_summaries = [
        {
            "name": table.name,
            "sourceType": table.source_type,
            "rowCount": len(table.dataframe),
            "columnCount": len(table.dataframe.columns),
            "columns": list(table.dataframe.columns),
        }
        for table in parsed["tables"]
    ]

    return {
        "parsed": parsed,
        "profile": profile,
        "schema": schema,
        "statsResult": stats_result,
        "kpiResult": kpi_result,
        "anomalyResult": anomaly_result,
        "dashboardPlan": dashboard_plan,
        "rootCauseResult": root_cause_result,
        "chartResult": chart_result,
        "insightResult": insight_result,
        "primaryTable": primary_table,
        "dataQuality": data_quality,
        "tableSummaries": table_summaries,
    }


def build_analysis_result(
    prepared: dict[str, Any],
    *,
    include_data_science: bool = True,
    on_progress: Callable[[int, str, str], None] | None = None,
) -> dict[str, Any]:
    """Render a quick dashboard or enrich the same prepared analysis with ML outputs."""
    parsed = prepared["parsed"]
    profile = prepared["profile"]
    schema = prepared["schema"]
    stats_result = prepared["statsResult"]
    kpi_result = prepared["kpiResult"]
    anomaly_result = prepared["anomalyResult"]
    dashboard_plan = prepared["dashboardPlan"]
    root_cause_result = prepared["rootCauseResult"]
    chart_result = prepared["chartResult"]
    insight_result = prepared["insightResult"]
    primary_table = prepared["primaryTable"]

    if include_data_science:
        if on_progress:
            on_progress(78, "advanced_analysis", "Running advanced statistical and ML analysis...")
        data_science_result = _safe_data_science_workflow(
            parsed,
            schema,
            profile,
            stats_result,
            anomaly_result,
        )
        if on_progress:
            on_progress(92, "report_generation", "Preparing the enriched dashboard and report...")
    else:
        data_science_result = _pending_data_science_result()

    report_result = generate_report(
        parsed,
        schema,
        profile,
        kpi_result,
        chart_result,
        insight_result,
        anomaly_result,
        root_cause_result,
        data_science_result if include_data_science else None,
    )

    result = {
        "analysisVersion": ANALYSIS_VERSION,
        "pipelineVersion": "3.1-single-parse-background-enrichment",
        "engineType": "python-pandas",
        "model": "Universal File Analytics Engine",
        "provider": "local-python",
        "isAIUnavailable": False,
        "fileName": parsed["file_name"],
        "fileType": parsed["file_type"],
        "datasetType": schema["datasetType"],
        "businessDomain": schema["businessDomain"],
        "detectionConfidence": schema["confidence"],
        "primaryTable": schema["primaryTable"],
        "tables": prepared["tableSummaries"],
        "tableProfiles": profile["tableProfiles"],
        "relationships": schema["relationships"],
        "schema": schema,
        "columns": list(primary_table.dataframe.columns),
        "rows": _records(primary_table.dataframe),
        "rowCount": len(primary_table.dataframe),
        "colCount": len(primary_table.dataframe.columns),
        "columnRoles": schema["columnRoles"],
        "mappedCols": schema["columnRoles"],
        "semanticColumns": next((table["columns"] for table in schema.get("tables", []) if table["name"] == schema["primaryTable"]), []),
        "dashboardPlan": dashboard_plan,
        "dashboard_plan": dashboard_plan,
        "dataScience": data_science_result,
        "mlAnalysis": data_science_result,
        "dataQuality": prepared["dataQuality"],
        "dataQualitySummary": anomaly_result["dataQualitySummary"],
        "missingValueSummary": anomaly_result["missingValueSummary"],
        "outlierSummary": anomaly_result["outlierSummary"],
        "anomalyBusinessImpacts": anomaly_result["anomalyBusinessImpacts"],
        "anomalies": anomaly_result["groupedAnomalies"],
        "kpis": kpi_result["kpis"],
        "calculatedMetrics": kpi_result.get("calculatedMetrics", []),
        "businessSummary": kpi_result["businessSummary"],
        "summaryStats": kpi_result["summaryStats"],
        "columnAggregates": _column_aggregates(primary_table.dataframe, schema),
        "trendData": kpi_result["trendData"],
        "chartData": chart_result["chartData"],
        "charts": chart_result["charts"],
        "correlationAnalysis": kpi_result["correlationAnalysis"],
        "distributionAnalysis": kpi_result["distributionAnalysis"],
        "topBottom": kpi_result["topBottom"],
        "advancedAnalyses": kpi_result["advancedAnalyses"],
        "possibleRootCauses": root_cause_result["possibleRootCauses"],
        "segmentPerformance": root_cause_result["segmentPerformance"],
        "unavailableRootCauseChecks": root_cause_result["unavailableRootCauseChecks"],
        "insights": insight_result["insights"],
        "insightObjects": insight_result["insightObjects"],
        "hiddenPatterns": insight_result["hiddenPatterns"],
        "recommendations": insight_result["recommendations"],
        "risks": insight_result["risks"],
        "strengths": insight_result["strengths"],
        "weaknesses": insight_result["weaknesses"],
        "opportunities": insight_result["opportunities"],
        "conclusion": insight_result["conclusion"],
        "summary": report_result["summary"],
        "report": report_result["report"],
        "reportText": report_result["reportText"],
        "currency": "INR",
        "currencySymbol": "Rs",
        "autoFilterColumns": _auto_filter_columns(primary_table.dataframe, schema),
    }
    result["llmContext"] = _build_llm_context(result)
    return _jsonable(result)


def analyze_parsed_file(
    file_name: str,
    parsed: dict[str, Any],
    *,
    include_data_science: bool = True,
) -> dict[str, Any]:
    del file_name  # The verified parser result is the source of truth for the file name.
    prepared = prepare_analysis(parsed)
    return build_analysis_result(prepared, include_data_science=include_data_science)


def analyze_file(file_name: str, content: bytes) -> dict[str, Any]:
    parsed = parse_file(file_name, content)
    return analyze_parsed_file(file_name, parsed)


def _pending_data_science_result() -> dict[str, Any]:
    return {
        "enabled": False,
        "status": "processing",
        "eda": {},
        "taskDetection": {
            "taskType": "processing",
            "reason": "The quick dashboard is ready while advanced analysis runs in the background.",
            "requiresTargetSelection": False,
        },
        "featureEngineering": {"createdFeatures": [], "featureCount": 0},
        "preprocessing": {"steps": [], "numericFeatures": [], "categoricalFeatures": [], "skippedFeatures": []},
        "modelTraining": {"trained": False, "reason": "Background analysis is still running.", "modelComparison": [], "bestModel": None, "featureImportance": []},
        "clustering": {"trained": False, "reason": "Background analysis is still running.", "models": [], "bestModel": None},
        "visualizations": {"plots": [], "plotCount": 0},
        "insights": [],
        "recommendations": [],
        "conclusion": "The deterministic dashboard is ready. Advanced analysis is still running.",
        "dashboard": {"cards": [], "plots": [], "sections": []},
    }


def _safe_data_science_workflow(
    parsed: dict[str, Any],
    schema: dict[str, Any],
    profile: dict[str, Any],
    stats_result: dict[str, Any],
    anomaly_result: dict[str, Any],
) -> dict[str, Any]:
    try:
        return run_data_science_workflow(parsed, schema, profile, stats_result, anomaly_result)
    except Exception as exc:
        return {
            "enabled": False,
            "error": str(exc),
            "eda": {},
            "taskDetection": {"taskType": "unavailable", "reason": str(exc), "requiresTargetSelection": True},
            "featureEngineering": {"createdFeatures": [], "featureCount": 0},
            "preprocessing": {"steps": [], "numericFeatures": [], "categoricalFeatures": [], "skippedFeatures": []},
            "modelTraining": {"trained": False, "reason": str(exc), "modelComparison": [], "bestModel": None, "featureImportance": []},
            "clustering": {"trained": False, "reason": str(exc), "models": [], "bestModel": None},
            "visualizations": {"plots": [], "plotCount": 0},
            "insights": [],
            "recommendations": ["Fix the data-science workflow error before using ML outputs."],
            "conclusion": "Data science workflow could not complete.",
            "dashboard": {"cards": [], "plots": [], "sections": []},
        }


def _chart_result_from_dashboard_plan(dashboard_plan: dict[str, Any]) -> dict[str, Any]:
    charts = dashboard_plan.get("charts", [])
    chart_data: list[dict[str, Any]] = []
    for chart in charts:
        if chart.get("type") == "bar" and chart.get("data"):
            chart_data = chart["data"]
            break
    return {"charts": charts, "chartData": chart_data}


def _merge_dashboard_plan_insights(insight_result: dict[str, Any], dashboard_plan: dict[str, Any]) -> None:
    planned = dashboard_plan.get("insights", [])
    if not planned:
        return
    insight_result["insightObjects"] = planned
    insight_result["insights"] = [
        f"{item['observation']} Evidence: {item['evidence']} Recommendation: {item['recommendation']}"
        for item in planned
    ]
    insight_result["hiddenPatterns"] = [
        f"{item['observation']} Evidence: {item['evidence']}"
        for item in dashboard_plan.get("hidden_patterns", [])
    ]


def _auto_filter_columns(df: pd.DataFrame, schema: dict[str, Any]) -> list[dict[str, Any]]:
    primary_schema = next((table for table in schema.get("tables", []) if table["name"] == schema.get("primaryTable")), {})
    candidates = [
        column["name"]
        for column in primary_schema.get("columns", [])
        if column.get("isDimension") and 1 < column.get("uniqueCount", 0) <= 100
    ]
    output = []
    for column in candidates:
        if not column or column not in df.columns:
            continue
        values = [str(value) for value in df[column].dropna().astype(str).unique().tolist() if str(value).strip()]
        if 1 < len(values) <= 100:
            output.append({"column": column, "values": sorted(values)[:100]})
    return output


def _merge_root_cause_patterns(insight_result: dict[str, Any], root_cause_result: dict[str, Any]) -> None:
    hidden_patterns = insight_result.setdefault("hiddenPatterns", [])
    recommendations = insight_result.setdefault("recommendations", [])

    for key, rows in root_cause_result.get("segmentPerformance", {}).items():
        if not rows:
            continue
        top = rows[0]
        if "average" in top:
            hidden_patterns.append(f"{key}: {top['name']} has the highest average value at {top['average']} across {top['count']:,} records.")
        elif "count" in top:
            hidden_patterns.append(f"{key}: {top['name']} appears most often with {top['count']:,} records.")

    for cause in root_cause_result.get("possibleRootCauses", [])[:5]:
        recommendations.append({
            "title": cause["title"],
            "desc": cause["recommendedAction"],
            "category": "Root Cause",
        })

    # Keep deterministic output concise and remove duplicates while preserving order.
    seen_patterns = set()
    insight_result["hiddenPatterns"] = [
        pattern for pattern in hidden_patterns
        if not (pattern in seen_patterns or seen_patterns.add(pattern))
    ][:12]


def _column_aggregates(df: pd.DataFrame, schema: dict[str, Any]) -> list[dict[str, Any]]:
    """Store exact full-table numeric aggregates for grounded chatbot answers."""
    primary_schema = next((table for table in schema.get("tables", []) if table["name"] == schema.get("primaryTable")), {})
    semantics = {column["name"]: column for column in primary_schema.get("columns", [])}
    rows: list[dict[str, Any]] = []
    for column in df.columns:
        values = clean_numeric(df[column]).dropna()
        if values.empty:
            continue
        numeric_share = float(values.count()) / max(len(df), 1)
        if numeric_share < 0.6:
            continue
        semantic = semantics.get(column, {})
        rows.append({
            "column": column,
            "count": int(values.count()),
            "sum": float(values.sum()),
            "mean": float(values.mean()),
            "median": float(values.median()),
            "min": float(values.min()),
            "max": float(values.max()),
            "nonNullShare": round(numeric_share * 100, 2),
            "semanticType": semantic.get("semanticType"),
            "isIdentifier": bool(semantic.get("isIdentifier")),
            "isMeasure": bool(semantic.get("isMeasure")),
            "isAdditive": bool(semantic.get("isAdditive")),
            "currencySymbol": semantic.get("currencySymbol"),
        })
    return rows


def chat_answer(question: str, analysis: dict[str, Any]) -> str:
    return answer_question(question, analysis)
