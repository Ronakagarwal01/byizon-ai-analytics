from __future__ import annotations

from typing import Any

import pandas as pd

from .data_profiler import clean_numeric


def _numeric_mean_by(df: pd.DataFrame, group_col: str, value_col: str, ascending: bool = False) -> list[dict[str, Any]]:
    working = pd.DataFrame({
        "group": df[group_col].astype(str).replace("", "Unknown"),
        "value": clean_numeric(df[value_col]),
    }).dropna()
    if working.empty:
        return []
    grouped = working.groupby("group")["value"].agg(["mean", "count"]).sort_values("mean", ascending=ascending).head(10)
    return [
        {"name": str(name), "average": round(float(row["mean"]), 2), "count": int(row["count"])}
        for name, row in grouped.iterrows()
    ]


def _count_by(df: pd.DataFrame, group_col: str, filter_col: str | None = None, filter_terms: list[str] | None = None) -> list[dict[str, Any]]:
    working = df.copy()
    if filter_col and filter_terms:
        pattern = "|".join(filter_terms)
        working = working[working[filter_col].astype(str).str.lower().str.contains(pattern, na=False)]
    if working.empty:
        return []
    counts = working[group_col].astype(str).replace("", "Unknown").value_counts().head(10)
    return [{"name": str(name), "count": int(count)} for name, count in counts.items()]


def build_root_causes(parsed: dict[str, Any], schema: dict[str, Any], kpi_result: dict[str, Any], anomaly_result: dict[str, Any] | None = None) -> dict[str, Any]:
    primary = next(table for table in parsed["tables"] if table.name == schema["primaryTable"])
    df = primary.dataframe
    anomaly_result = anomaly_result or {"outlierSummary": []}
    table_schema = next((table for table in schema["tables"] if table["name"] == schema["primaryTable"]), {})
    semantic_cols = table_schema.get("columns", [])
    dimensions = [col["name"] for col in semantic_cols if col.get("isDimension") and 1 < col.get("uniqueCount", 0) <= 50]
    measures = [col["name"] for col in semantic_cols if col.get("isMeasure") and not col.get("isIdentifier")]

    root_causes: list[dict[str, Any]] = []
    segment_performance: dict[str, Any] = {}

    for measure in measures[:5]:
        for dimension in dimensions[:5]:
            values = _numeric_mean_by(df, dimension, measure)
            if not values:
                continue
            segment_performance[f"{measure} by {dimension}"] = values
            if len(values) >= 2 and values[0]["average"] > values[-1]["average"] * 1.5:
                root_causes.append({
                    "title": f"{measure} varies by {dimension}",
                    "whatHappened": f"{values[0]['name']} has the highest average {measure} at {values[0]['average']}.",
                    "whyItMatters": "Segment concentration can explain why overall averages or outliers are high.",
                    "evidence": f"Average calculated from {values[0]['count']:,} rows in the highest segment.",
                    "recommendedAction": "Compare top and bottom segments and inspect source rows before making a decision.",
                    "sourceColumns": [dimension, measure],
                    "confidence": "Medium",
                })

    for outlier in anomaly_result.get("outlierSummary", [])[:5]:
        column = outlier["column"]
        details = outlier.get("details", [])
        if not details or not dimensions:
            continue
        row_numbers = {int(item["row"]) - 1 for item in details if item.get("row")}
        outlier_df = df.loc[df.index.intersection(row_numbers)]
        if outlier_df.empty:
            continue
        for dimension in dimensions[:5]:
            overall_counts = df[dimension].astype(str).value_counts(normalize=True)
            outlier_counts = outlier_df[dimension].astype(str).value_counts(normalize=True)
            if outlier_counts.empty:
                continue
            top_value = outlier_counts.index[0]
            lift = float(outlier_counts.iloc[0] / max(overall_counts.get(top_value, 0.0001), 0.0001))
            if lift >= 1.8 and len(outlier_df) >= 3:
                root_causes.append({
                    "title": f"{column} outliers are concentrated in {dimension}",
                    "whatHappened": f"{top_value} is over-represented among {column} outlier rows.",
                    "whyItMatters": "Outlier concentration in a segment can point to a process, data-entry, or population difference.",
                    "evidence": f"Segment lift among outlier rows is {lift:.1f}x versus the full dataset.",
                    "recommendedAction": "Review source records for this segment and confirm whether the extreme values are valid.",
                    "sourceColumns": [dimension, column],
                    "confidence": "Medium",
                })
                break

    unavailable = []
    if not measures:
        unavailable.append("Root cause analysis: Not enough valid numeric measure columns available")
    if not dimensions:
        unavailable.append("Segment root cause analysis: Not enough categorical/boolean segment columns available")

    return {
        "possibleRootCauses": root_causes,
        "segmentPerformance": segment_performance,
        "unavailableRootCauseChecks": unavailable,
    }
