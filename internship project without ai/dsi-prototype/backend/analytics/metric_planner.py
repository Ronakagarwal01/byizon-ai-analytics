from __future__ import annotations

import re
from typing import Any

import pandas as pd

from .data_profiler import clean_datetime, clean_numeric


def _safe_id(label: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", label.lower()).strip("_") or "metric"


def _format_number(value: float | int | None, decimals: int = 2) -> str:
    if value is None:
        return "Not calculated"
    number = float(value)
    if abs(number - round(number)) < 1e-9:
        return f"{int(round(number)):,}"
    return f"{number:,.{decimals}f}"


def _format_value(value: float | int | None, semantic: dict[str, Any] | None = None) -> str:
    if value is None:
        return "Not calculated"
    semantic = semantic or {}
    if semantic.get("semanticType") == "currency":
        symbol = semantic.get("currencySymbol") or ""
        return f"{symbol}{float(value):,.2f}" if symbol else _format_number(value, 2)
    if semantic.get("semanticType") == "percentage":
        number = float(value)
        if abs(number) <= 1:
            number *= 100
        return f"{number:,.2f}%"
    return _format_number(value, 2)


def _total_label(column: str) -> str:
    clean = re.sub(r"[^a-z0-9]+", " ", column.lower()).strip()
    return column if clean.startswith("total ") else f"Total {column}"


def _kpi(label: str, raw: float | int | str | None, value: str, desc: str, formula: str, source: str | None, why: str, confidence: str = "High") -> dict[str, Any]:
    return {
        "id": _safe_id(label),
        "label": label,
        "rawValue": raw,
        "value": value,
        "desc": desc,
        "trend": "neutral",
        "trendValue": "N/A",
        "whyUseful": why,
        "explainability": {
            "formula": formula,
            "sourceColumn": source or "Whole table",
            "confidence": confidence,
        },
    }


def _semantics(schema: dict[str, Any], table_name: str) -> dict[str, dict[str, Any]]:
    table = next((item for item in schema["tables"] if item["name"] == table_name), None)
    return {col["name"]: col for col in (table or {}).get("columns", [])}


def _valid_measures(semantics: dict[str, dict[str, Any]]) -> list[dict[str, Any]]:
    measures = [
        col for col in semantics.values()
        if col.get("isMeasure") and not col.get("isIdentifier") and col.get("semanticType") not in {"latitude", "longitude"}
    ]
    return sorted(measures, key=_measure_priority, reverse=True)


def _measure_priority(col: dict[str, Any]) -> tuple[float, float, float, float, float]:
    clean = re.sub(r"[^a-z0-9]+", " ", str(col.get("name", "")).lower()).strip()
    aggregate_signal = 0
    if re.search(r"\bnet\b", clean):
        aggregate_signal += 1
    for token in ["net", "gross", "total", "balance", "amount", "value"]:
        if re.search(rf"\b{token}\b", clean):
            aggregate_signal += 2
    for token in ["unit", "rate", "ratio", "percent", "percentage", "margin"]:
        if re.search(rf"\b{token}\b", clean):
            aggregate_signal -= 3
    for token in ["discount", "adjustment", "tax"]:
        if re.search(rf"\b{token}\b", clean):
            aggregate_signal -= 1
    return (
        1 if col.get("semanticType") == "currency" else 0,
        1 if col.get("isAdditive") else 0,
        aggregate_signal,
        -float(col.get("missingRate") or 0),
        float(col.get("confidence") or 0),
    )


def _group_count(df: pd.DataFrame, column: str | None, limit: int = 10) -> list[dict[str, Any]]:
    if not column or column not in df.columns:
        return []
    values = df[column].astype(str).str.strip().replace("", "Unknown")
    counts = values.value_counts().head(limit)
    return [{"name": str(name), "count": int(count), "value": int(count), "rank": idx + 1} for idx, (name, count) in enumerate(counts.items())]


def _group_measure(df: pd.DataFrame, dimension: str | None, measure: str | None, measure_semantic: dict[str, Any], limit: int = 10) -> list[dict[str, Any]]:
    if not dimension or not measure or dimension not in df.columns or measure not in df.columns:
        return []
    values = clean_numeric(df[measure])
    working = pd.DataFrame({"name": df[dimension].astype(str).str.strip().replace("", "Unknown"), "value": values}).dropna()
    if working.empty:
        return []
    agg = "sum" if measure_semantic.get("isAdditive") else "mean"
    grouped = working.groupby("name")["value"].sum() if agg == "sum" else working.groupby("name")["value"].mean()
    grouped = grouped.sort_values(ascending=False).head(limit)
    return [
        {
            "name": str(name),
            "rawValue": float(value),
            "value": _format_value(float(value), measure_semantic),
            "rank": idx + 1,
            "aggregation": agg,
        }
        for idx, (name, value) in enumerate(grouped.items())
    ]


def _date_range_kpi(df: pd.DataFrame, date_col: str | None) -> dict[str, Any] | None:
    if not date_col or date_col not in df.columns:
        return None
    dates = clean_datetime(df[date_col]).dropna()
    if dates.empty:
        return None
    value = f"{dates.min().date().isoformat()} to {dates.max().date().isoformat()}"
    return _kpi(
        "Date Range",
        value,
        value,
        "Earliest and latest valid dates detected in the primary table.",
        f"MIN({date_col}) to MAX({date_col})",
        date_col,
        "Useful for confirming the time coverage of the dataset.",
    )


def compute_metrics(parsed: dict[str, Any], schema: dict[str, Any], profile: dict[str, Any], stats: dict[str, Any]) -> dict[str, Any]:
    primary = next(table for table in parsed["tables"] if table.name == schema["primaryTable"])
    df = primary.dataframe
    semantics = _semantics(schema, primary.name)
    roles = schema.get("columnRoles", {})
    measures = _valid_measures(semantics)
    dimensions = [
        col for col in semantics.values()
        if col.get("isDimension") and 1 < col.get("uniqueCount", 0) <= 50 and col.get("missingRate", 1) < 0.5
    ]
    dimensions = sorted(dimensions, key=_dimension_priority, reverse=True)
    primary_measure_name = roles.get("metric") or (measures[0]["name"] if measures else None)
    primary_measure = semantics.get(primary_measure_name or "", {})
    primary_dimension_name = roles.get("category") or (dimensions[0]["name"] if dimensions else None)

    # Keep this legacy-compatible list intentionally small. The visible dashboard
    # card set is selected by dashboard_planner.py, not by broad numeric loops.
    kpis: list[dict[str, Any]] = [
        _kpi("Total Records", len(df), _format_number(len(df), 0), "Number of records in the primary table.", "COUNT(*)", None, "Baseline size for every analysis."),
        _kpi("Total Columns", len(df.columns), _format_number(len(df.columns), 0), "Number of columns in the primary table.", "COUNT(columns)", None, "Shows dataset width and feature availability."),
        _kpi("Completeness Score", profile["overall"]["completeness"], f"{profile['overall']['completeness']}%", "Percentage of non-missing cells.", "1 - missing_cells / total_cells", None, "Measures whether the dataset is complete enough to trust.", "High"),
    ]

    additive_measures = [measure for measure in measures if measure.get("isAdditive")]
    calculated_metrics: list[dict[str, Any]] = []

    for measure in additive_measures:
        column = measure["name"]
        values = clean_numeric(df[column]).dropna()
        if values.empty:
            continue
        total = float(values.sum())
        metric = _kpi(
            _total_label(column),
            total,
            _format_value(total, measure),
            f"Sum of valid numeric values in {column}.",
            f"SUM({column})",
            column,
            "Valid because the column is detected as additive/currency-like.",
        )
        calculated_metrics.append(metric)
        if len(kpis) < 5:
            kpis.append(metric)

    for measure in measures:
        column = measure["name"]
        values = clean_numeric(df[column]).dropna()
        if values.empty:
            continue
        average = float(values.mean())
        calculated_metrics.append(_kpi(
            f"Average {column}" if measure.get("semanticType") != "percentage" else f"Rate of {column}",
            average,
            _format_value(average, measure),
            f"Mean of valid numeric values in {column}.",
            f"AVG({column})",
            column,
            "Searchable calculation only; not automatically promoted to a dashboard card.",
        ))

    if primary_dimension_name:
        unique_count = int(df[primary_dimension_name].astype(str).str.strip().replace("", pd.NA).dropna().nunique())
        kpis.append(_kpi(
            f"Unique {primary_dimension_name}",
            unique_count,
            _format_number(unique_count, 0),
            f"Distinct non-empty values in {primary_dimension_name}.",
            f"COUNT_DISTINCT({primary_dimension_name})",
            primary_dimension_name,
            "Useful for understanding segment cardinality.",
        ))

    primary_breakdown = _group_measure(df, primary_dimension_name, primary_measure_name, primary_measure, 10)
    if not primary_breakdown and primary_dimension_name:
        primary_breakdown = _group_count(df, primary_dimension_name, 10)
    top_bottom = {
        "topSegments": primary_breakdown[:5],
        "bottomSegments": list(reversed(primary_breakdown[-5:])) if primary_breakdown else [],
    }

    business_summary = {
        "salesLabel": primary_measure_name or "Records",
        "columns": {
            "sales": primary_measure_name,
            "metric": primary_measure_name,
            "category": primary_dimension_name,
            "date": roles.get("date"),
        },
        "overall": {
            "totalSales": None,
            "totalSalesFormatted": "Not calculated",
            "totalProfit": None,
            "totalProfitFormatted": "Not calculated",
            "totalCost": None,
            "totalCostFormatted": "Not calculated",
            "avgProfitMargin": None,
            "avgProfitMarginFormatted": "Not calculated",
            "totalUnits": None,
            "totalUnitsFormatted": "Not calculated",
        },
        "categoryWise": primary_breakdown,
        "regionWise": [],
        "topSalesReps": [],
        "topProducts": [],
        "paymentModes": _group_count(df, primary_dimension_name, 10) if primary_dimension_name else [],
        "regionProfitability": [],
        "categoryProfitability": [],
    }
    if primary_measure_name:
        values = clean_numeric(df[primary_measure_name]).dropna()
        if not values.empty:
            total_or_mean = float(values.sum()) if primary_measure.get("isAdditive") else float(values.mean())
            business_summary["overall"]["totalSales"] = total_or_mean
            business_summary["overall"]["totalSalesFormatted"] = _format_value(total_or_mean, primary_measure)

    return {
        "kpis": kpis[:6],
        "calculatedMetrics": calculated_metrics[:80],
        "businessSummary": business_summary,
        "trendData": stats.get("trendData", []),
        "summaryStats": stats.get("summaryStats", []),
        "categoricalStats": stats.get("categoricalStats", []),
        "correlationAnalysis": stats.get("correlationAnalysis", {"pairs": [], "matrix": []}),
        "distributionAnalysis": stats.get("distributionAnalysis", []),
        "topBottom": top_bottom,
        "advancedAnalyses": {
            "regressionReadiness": "Ready" if len(measures) >= 2 and len(df) >= 30 else "Not enough numeric columns available",
            "clusteringReadiness": "Ready" if len(measures) >= 2 and len(df) >= 30 else "Not enough numeric columns available",
            "timeSeriesReadiness": "Ready" if roles.get("date") and primary_measure_name else "Not enough date/measure columns available",
        },
        "primaryMetricColumn": primary_measure_name,
        "primaryDateColumn": roles.get("date"),
    }


def _dimension_priority(col: dict[str, Any]) -> tuple[float, float, float, float]:
    clean = re.sub(r"[^a-z0-9]+", " ", str(col.get("name", "")).lower()).strip()
    penalty = 0
    for token in ["note", "comment", "description", "remark", "text"]:
        if re.search(rf"\b{token}\b", clean):
            penalty -= 3
    if col.get("semanticType") == "binary_category":
        penalty -= 1
    useful_cardinality = 1 if 3 <= int(col.get("uniqueCount") or 0) <= 25 else 0
    return (
        useful_cardinality,
        penalty,
        -float(col.get("missingRate") or 0),
        float(col.get("confidence") or 0),
    )
