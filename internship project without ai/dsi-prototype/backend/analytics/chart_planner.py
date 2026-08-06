from __future__ import annotations

from typing import Any

import pandas as pd

from .data_profiler import clean_numeric


def _chart(chart_id: str, chart_type: str, title: str, data: list[dict[str, Any]], description: str = "", source_columns: list[str] | None = None) -> dict[str, Any]:
    return {
        "id": chart_id,
        "type": chart_type,
        "title": title,
        "description": description,
        "sourceColumns": source_columns or [],
        "data": data,
    }


def _semantics(schema: dict[str, Any], table_name: str) -> dict[str, dict[str, Any]]:
    table = next((item for item in schema["tables"] if item["name"] == table_name), None)
    return {col["name"]: col for col in (table or {}).get("columns", [])}


def _safe_id(value: str) -> str:
    return "".join(ch if ch.isalnum() else "_" for ch in value.lower()).strip("_")


def _dimension_counts(df: pd.DataFrame, column: str, limit: int = 12) -> list[dict[str, Any]]:
    counts = df[column].astype(str).str.strip().replace("", "Unknown").value_counts().head(limit)
    return [{"name": str(name), "value": int(count), "count": int(count)} for name, count in counts.items()]


def _dimension_measure(df: pd.DataFrame, dimension: str, measure: str, measure_semantic: dict[str, Any], limit: int = 12) -> list[dict[str, Any]]:
    working = pd.DataFrame({
        "name": df[dimension].astype(str).str.strip().replace("", "Unknown"),
        "value": clean_numeric(df[measure]),
    }).dropna()
    if working.empty:
        return []
    agg = "sum" if measure_semantic.get("isAdditive") else "mean"
    grouped = working.groupby("name")["value"].sum() if agg == "sum" else working.groupby("name")["value"].mean()
    return [{"name": str(name), "value": float(value), "rawValue": float(value), "aggregation": agg} for name, value in grouped.sort_values(ascending=False).head(limit).items()]


def build_chart_plan(parsed: dict[str, Any], schema: dict[str, Any], profile: dict[str, Any], metric_result: dict[str, Any], anomaly_result: dict[str, Any]) -> dict[str, Any]:
    primary = next(table for table in parsed["tables"] if table.name == schema["primaryTable"])
    df = primary.dataframe
    semantics = _semantics(schema, primary.name)
    charts: list[dict[str, Any]] = []

    if metric_result.get("trendData"):
        source = [schema.get("columnRoles", {}).get("date"), metric_result.get("primaryMetricColumn")]
        charts.append(_chart(
            "trend_primary_measure",
            "line",
            f"Trend: {metric_result.get('primaryMetricColumn')}",
            metric_result["trendData"],
            "Time-based trend using the detected date column and primary valid measure.",
            [col for col in source if col],
        ))

    dimensions = [col for col in semantics.values() if col.get("isDimension") and 1 < col.get("uniqueCount", 0) <= 50]
    measures = [col for col in semantics.values() if col.get("isMeasure") and not col.get("isIdentifier")]
    primary_measure_name = metric_result.get("primaryMetricColumn")
    primary_measure = semantics.get(primary_measure_name or "", {})

    for dimension in dimensions[:4]:
        data = _dimension_counts(df, dimension["name"])
        if data:
            charts.append(_chart(
                f"count_by_{_safe_id(dimension['name'])}",
                "bar",
                f"Count by {dimension['name']}",
                data,
                "Frequency distribution for a valid categorical/boolean column.",
                [dimension["name"]],
            ))
        if primary_measure_name and primary_measure_name in df.columns:
            measure_data = _dimension_measure(df, dimension["name"], primary_measure_name, primary_measure)
            if measure_data:
                charts.append(_chart(
                    f"measure_by_{_safe_id(dimension['name'])}",
                    "bar",
                    f"{primary_measure_name} by {dimension['name']}",
                    measure_data,
                    "Segment comparison using mean or sum depending on the detected measure semantics.",
                    [dimension["name"], primary_measure_name],
                ))

    for measure in measures[:4]:
        values = clean_numeric(df[measure["name"]]).dropna()
        if len(values) < 5:
            continue
        counts = pd.cut(values, bins=min(12, max(4, int(len(values) ** 0.5))), duplicates="drop").value_counts().sort_index()
        data = [{"name": str(interval), "value": int(count), "count": int(count)} for interval, count in counts.items()]
        charts.append(_chart(
            f"distribution_{_safe_id(measure['name'])}",
            "histogram",
            f"Distribution: {measure['name']}",
            data,
            "Histogram for a valid numeric measure.",
            [measure["name"]],
        ))

    missing_data = []
    for table in profile["tableProfiles"]:
        for item in table["missingValuesByColumn"]:
            missing_data.append({"name": f"{table['name']}.{item['column']}", "value": item["missing"], "missingRate": item["missingRate"]})
    if missing_data:
        charts.append(_chart("missing_values", "bar", "Missing Values by Column", sorted(missing_data, key=lambda row: row["value"], reverse=True)[:20]))

    outlier_data = [{"name": item["column"], "value": item["totalOutliers"], "severity": item["severity"]} for item in anomaly_result.get("outlierSummary", [])]
    if outlier_data:
        charts.append(_chart("outlier_summary", "bar", "Outliers by Column", outlier_data[:20]))

    correlations = metric_result.get("correlationAnalysis", {})
    if correlations.get("matrix"):
        charts.append(_chart("correlation_heatmap", "heatmap", "Correlation Heatmap", correlations["matrix"]))
    if correlations.get("pairs"):
        top = correlations["pairs"][0]
        scatter_df = pd.DataFrame({
            "x": clean_numeric(df[top["x"]]),
            "y": clean_numeric(df[top["y"]]),
        }).dropna().head(500)
        scatter = [{"x": float(row["x"]), "y": float(row["y"])} for _, row in scatter_df.iterrows()]
        if scatter:
            charts.append(_chart(
                "top_correlation_scatter",
                "scatter",
                f"{top['x']} vs {top['y']}",
                scatter,
                f"Scatter plot for strongest detected correlation (r={top['correlation']}).",
                [top["x"], top["y"]],
            ))

    chart_data = []
    for chart in charts:
        if chart["type"] == "bar" and chart["data"]:
            chart_data = chart["data"]
            break
    return {"charts": charts, "chartData": chart_data}
