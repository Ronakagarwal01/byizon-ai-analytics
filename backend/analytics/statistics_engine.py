from __future__ import annotations

from typing import Any

import numpy as np
import pandas as pd

from .data_profiler import clean_datetime, clean_numeric


def _column_semantics(schema: dict[str, Any], table_name: str) -> dict[str, dict[str, Any]]:
    table = next((item for item in schema["tables"] if item["name"] == table_name), None)
    return {col["name"]: col for col in (table or {}).get("columns", [])}


def _is_valid_measure(semantic: dict[str, Any]) -> bool:
    return bool(semantic.get("isMeasure")) and not semantic.get("isIdentifier") and semantic.get("semanticType") not in {"latitude", "longitude"}


def descriptive_statistics(parsed: dict[str, Any], schema: dict[str, Any], profile: dict[str, Any]) -> list[dict[str, Any]]:
    primary = next(table for table in parsed["tables"] if table.name == schema["primaryTable"])
    semantics = _column_semantics(schema, primary.name)
    rows: list[dict[str, Any]] = []
    for column in primary.dataframe.columns:
        semantic = semantics.get(column, {})
        if not _is_valid_measure(semantic):
            continue
        values = clean_numeric(primary.dataframe[column]).dropna()
        if values.empty:
            continue
        rows.append({
            "column": column,
            "semanticType": semantic.get("semanticType"),
            "count": int(values.count()),
            "sum": float(values.sum()) if semantic.get("isAdditive") else None,
            "mean": float(values.mean()),
            "median": float(values.median()),
            "min": float(values.min()),
            "max": float(values.max()),
            "std": float(values.std(ddof=0)) if len(values) > 1 else 0.0,
            "variance": float(values.var(ddof=0)) if len(values) > 1 else 0.0,
            "p05": float(values.quantile(0.05)),
            "p25": float(values.quantile(0.25)),
            "p75": float(values.quantile(0.75)),
            "p95": float(values.quantile(0.95)),
            "skewness": float(values.skew()) if len(values) > 2 else 0.0,
            "kurtosis": float(values.kurt()) if len(values) > 3 else 0.0,
            "normalityHint": "approximately symmetric" if abs(float(values.skew()) if len(values) > 2 else 0) < 0.5 else "skewed",
        })
    return rows


def categorical_statistics(parsed: dict[str, Any], schema: dict[str, Any]) -> list[dict[str, Any]]:
    primary = next(table for table in parsed["tables"] if table.name == schema["primaryTable"])
    semantics = _column_semantics(schema, primary.name)
    rows: list[dict[str, Any]] = []
    for column in primary.dataframe.columns:
        semantic = semantics.get(column, {})
        if not semantic.get("isDimension"):
            continue
        values = primary.dataframe[column].astype(str).str.strip()
        values = values[values != ""]
        if values.empty:
            continue
        counts = values.value_counts()
        probabilities = counts / counts.sum()
        entropy = float(-(probabilities * np.log2(probabilities)).sum()) if len(probabilities) else 0.0
        top_name = str(counts.index[0])
        top_count = int(counts.iloc[0])
        rows.append({
            "column": column,
            "semanticType": semantic.get("semanticType"),
            "uniqueCount": int(values.nunique()),
            "topValue": top_name,
            "topCount": top_count,
            "topShare": round(top_count / max(len(values), 1) * 100, 2),
            "entropy": round(entropy, 3),
            "topValues": [
                {"name": str(name), "count": int(count), "share": round(count / max(len(values), 1) * 100, 2)}
                for name, count in counts.head(10).items()
            ],
        })
    return rows


def correlation_analysis(parsed: dict[str, Any], schema: dict[str, Any]) -> dict[str, Any]:
    primary = next(table for table in parsed["tables"] if table.name == schema["primaryTable"])
    semantics = _column_semantics(schema, primary.name)
    numeric_columns = [col for col, semantic in semantics.items() if _is_valid_measure(semantic)]
    if len(numeric_columns) < 2:
        return {"pairs": [], "matrix": []}
    numeric_df = pd.DataFrame({col: clean_numeric(primary.dataframe[col]) for col in numeric_columns}).dropna(axis=1, how="all")
    if len(numeric_df.columns) < 2:
        return {"pairs": [], "matrix": []}
    corr = numeric_df.corr(numeric_only=True).fillna(0)
    cov = numeric_df.cov(numeric_only=True).fillna(0)
    pairs: list[dict[str, Any]] = []
    for left in corr.columns:
        for right in corr.columns:
            if left >= right:
                continue
            value = float(corr.loc[left, right])
            if abs(value) >= 0.5:
                pairs.append({
                    "x": left,
                    "y": right,
                    "correlation": round(value, 3),
                    "covariance": round(float(cov.loc[left, right]), 3),
                    "strength": "strong" if abs(value) >= 0.75 else "moderate",
                    "direction": "positive" if value >= 0 else "negative",
                    "confidence": "High" if numeric_df[[left, right]].dropna().shape[0] >= 30 else "Medium",
                })
    pairs.sort(key=lambda item: abs(item["correlation"]), reverse=True)
    matrix = [
        {"x": left, "y": right, "value": round(float(corr.loc[left, right]), 3)}
        for left in corr.columns
        for right in corr.columns
    ]
    return {"pairs": pairs[:20], "matrix": matrix}


def distribution_analysis(parsed: dict[str, Any], schema: dict[str, Any]) -> list[dict[str, Any]]:
    primary = next(table for table in parsed["tables"] if table.name == schema["primaryTable"])
    semantics = _column_semantics(schema, primary.name)
    distributions: list[dict[str, Any]] = []
    for column, semantic in semantics.items():
        if not _is_valid_measure(semantic):
            continue
        values = clean_numeric(primary.dataframe[column]).dropna()
        if len(values) < 5:
            continue
        bins = min(12, max(4, int(np.sqrt(len(values)))))
        counts, edges = np.histogram(values, bins=bins)
        distributions.append({
            "column": column,
            "semanticType": semantic.get("semanticType"),
            "bins": [
                {
                    "name": f"{edges[index]:.2f} to {edges[index + 1]:.2f}",
                    "count": int(count),
                    "start": float(edges[index]),
                    "end": float(edges[index + 1]),
                }
                for index, count in enumerate(counts)
            ],
            "skewness": float(values.skew()) if len(values) > 2 else 0.0,
            "kurtosis": float(values.kurt()) if len(values) > 3 else 0.0,
        })
    return distributions[:8]


def build_time_series(parsed: dict[str, Any], schema: dict[str, Any], measure_column: str | None = None) -> list[dict[str, Any]]:
    primary = next(table for table in parsed["tables"] if table.name == schema["primaryTable"])
    roles = schema.get("columnRoles", {})
    date_col = roles.get("date")
    measure_col = measure_column or roles.get("metric")
    if not date_col or not measure_col or date_col not in primary.dataframe.columns or measure_col not in primary.dataframe.columns:
        return []
    semantics = _column_semantics(schema, primary.name)
    measure_semantic = semantics.get(measure_col, {})
    dates = clean_datetime(primary.dataframe[date_col])
    values = clean_numeric(primary.dataframe[measure_col])
    working = pd.DataFrame({"date": dates, "value": values}).dropna()
    if working.empty:
        return []
    working["period"] = working["date"].dt.to_period("M").astype(str)
    agg = "sum" if measure_semantic.get("isAdditive") else "mean"
    grouped = working.groupby("period")["value"].sum() if agg == "sum" else working.groupby("period")["value"].mean()
    return [
        {"month": str(period), "name": str(period), "value": float(value), "revenue": float(value), "aggregation": agg}
        for period, value in grouped.sort_index().items()
    ]


def build_statistics(parsed: dict[str, Any], schema: dict[str, Any], profile: dict[str, Any]) -> dict[str, Any]:
    return {
        "summaryStats": descriptive_statistics(parsed, schema, profile),
        "categoricalStats": categorical_statistics(parsed, schema),
        "correlationAnalysis": correlation_analysis(parsed, schema),
        "distributionAnalysis": distribution_analysis(parsed, schema),
        "trendData": build_time_series(parsed, schema),
    }
