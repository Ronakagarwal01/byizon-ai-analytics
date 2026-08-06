from __future__ import annotations

from typing import Any

import numpy as np
import pandas as pd

from .data_profiler import clean_numeric


def _primary_table(parsed: dict[str, Any], schema: dict[str, Any]):
    return next(table for table in parsed["tables"] if table.name == schema["primaryTable"])


def _semantic_columns(schema: dict[str, Any]) -> list[dict[str, Any]]:
    table = next((item for item in schema.get("tables", []) if item.get("name") == schema.get("primaryTable")), {})
    return list(table.get("columns", []))


def _column_type_counts(columns: list[dict[str, Any]]) -> dict[str, int]:
    counts: dict[str, int] = {}
    for column in columns:
        key = column.get("semanticType") or "unknown"
        counts[key] = counts.get(key, 0) + 1
    return counts


def _class_imbalance(df: pd.DataFrame, target_col: str | None) -> dict[str, Any] | None:
    if not target_col or target_col not in df.columns:
        return None
    values = df[target_col].astype(str).str.strip()
    values = values[values != ""]
    if values.empty or values.nunique() > 30:
        return None
    counts = values.value_counts()
    majority_share = float(counts.iloc[0] / counts.sum() * 100)
    return {
        "target": target_col,
        "classes": [{"name": str(name), "count": int(count), "share": round(count / counts.sum() * 100, 2)} for name, count in counts.items()],
        "majorityClass": str(counts.index[0]),
        "majorityShare": round(majority_share, 2),
        "severity": "High" if majority_share >= 85 else "Medium" if majority_share >= 70 else "Low",
    }


def _leakage_warnings(df: pd.DataFrame, target_col: str | None, columns: list[dict[str, Any]]) -> list[dict[str, Any]]:
    if not target_col or target_col not in df.columns:
        return []
    warnings: list[dict[str, Any]] = []
    target_text = df[target_col].astype(str).str.strip()
    target_numeric = clean_numeric(df[target_col])
    for column in columns:
        name = column["name"]
        if name == target_col or name not in df.columns or column.get("isIdentifier"):
            continue
        clean_name = name.lower()
        if target_col.lower() in clean_name or clean_name in target_col.lower():
            warnings.append({
                "column": name,
                "risk": "High",
                "reason": "Column name strongly overlaps with the target name.",
            })
        if column.get("isMeasure") and target_numeric.notna().sum() >= 20:
            values = clean_numeric(df[name])
            pair = pd.DataFrame({"x": values, "y": target_numeric}).dropna()
            if len(pair) >= 20:
                corr = float(pair["x"].corr(pair["y"]))
                if np.isfinite(corr) and abs(corr) >= 0.98:
                    warnings.append({
                        "column": name,
                        "risk": "High",
                        "reason": f"Near-perfect numeric correlation with target (r={corr:.3f}).",
                    })
        else:
            same_rate = float((df[name].astype(str).str.strip() == target_text).mean())
            if same_rate >= 0.98:
                warnings.append({
                    "column": name,
                    "risk": "High",
                    "reason": "Values almost exactly duplicate the target.",
                })
    return warnings[:10]


def build_eda(
    parsed: dict[str, Any],
    schema: dict[str, Any],
    profile: dict[str, Any],
    stats: dict[str, Any],
    anomaly_result: dict[str, Any],
) -> dict[str, Any]:
    table = _primary_table(parsed, schema)
    df = table.dataframe
    columns = _semantic_columns(schema)
    roles = schema.get("columnRoles", {})
    target_col = roles.get("target")
    id_columns = [column["name"] for column in columns if column.get("isIdentifier")]

    numeric_summary = stats.get("summaryStats", [])
    categorical_summary = stats.get("categoricalStats", [])
    missing = anomaly_result.get("missingValueSummary", [])
    outliers = anomaly_result.get("outlierSummary", [])

    eda = {
        "rows": int(len(df)),
        "columns": int(len(df.columns)),
        "dataTypes": _column_type_counts(columns),
        "columnSemantics": columns,
        "missingValues": missing,
        "duplicateRows": int(profile.get("overall", {}).get("duplicatesCount", 0)),
        "uniqueValues": {column["name"]: int(column.get("uniqueCount") or 0) for column in columns},
        "numericalSummary": numeric_summary,
        "categoricalSummary": categorical_summary,
        "targetDetection": {
            "targetColumn": target_col,
            "confidence": next((column.get("confidence") for column in columns if column["name"] == target_col), None),
            "status": "detected" if target_col else "not_confident",
            "message": "Target detected from uploaded columns." if target_col else "No clear target column detected; supervised ML is skipped unless user selects a target.",
        },
        "idColumns": id_columns,
        "outlierSummary": outliers,
        "skewness": [
            {"column": item["column"], "skewness": round(float(item.get("skewness") or 0), 4), "hint": item.get("normalityHint")}
            for item in numeric_summary
        ],
        "correlation": stats.get("correlationAnalysis", {}),
        "classImbalance": _class_imbalance(df, target_col),
        "dataLeakageWarnings": _leakage_warnings(df, target_col, columns),
    }
    return eda
