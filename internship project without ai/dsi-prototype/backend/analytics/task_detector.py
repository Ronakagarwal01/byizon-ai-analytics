from __future__ import annotations

from typing import Any

import pandas as pd

from .data_profiler import clean_numeric


def _semantic_columns(schema: dict[str, Any]) -> list[dict[str, Any]]:
    table = next((item for item in schema.get("tables", []) if item.get("name") == schema.get("primaryTable")), {})
    return list(table.get("columns", []))


def detect_ml_task(df: pd.DataFrame, schema: dict[str, Any]) -> dict[str, Any]:
    roles = schema.get("columnRoles", {})
    columns = _semantic_columns(schema)
    target_col = roles.get("target")
    target_semantic = next((column for column in columns if column["name"] == target_col), None)

    if not target_col or target_col not in df.columns or not target_semantic:
        return {
            "taskType": "clustering",
            "targetColumn": None,
            "targetConfidence": 0,
            "requiresTargetSelection": True,
            "reason": "No confident target/outcome column was detected. Supervised ML is skipped; unsupervised EDA/clustering can run.",
        }

    non_missing = df[target_col].dropna()
    unique_count = int(non_missing.nunique())
    numeric = clean_numeric(df[target_col])
    numeric_rate = float(numeric.notna().mean()) if len(df) else 0

    if unique_count <= 1:
        return {
            "taskType": "unsupported",
            "targetColumn": target_col,
            "targetConfidence": target_semantic.get("confidence", 0),
            "requiresTargetSelection": True,
            "reason": "Target has only one distinct value, so model training is not meaningful.",
        }

    if target_semantic.get("semanticType") in {"target_label", "categorical", "binary_category", "boolean"} or unique_count <= min(20, max(2, int(len(df) * 0.1))):
        return {
            "taskType": "binary_classification" if unique_count == 2 else "multiclass_classification",
            "targetColumn": target_col,
            "targetConfidence": target_semantic.get("confidence", 0.78),
            "requiresTargetSelection": False,
            "reason": f"Target has {unique_count} discrete classes.",
        }

    if numeric_rate >= 0.85:
        return {
            "taskType": "regression",
            "targetColumn": target_col,
            "targetConfidence": target_semantic.get("confidence", 0.78),
            "requiresTargetSelection": False,
            "reason": "Target is numeric with enough continuous variation.",
        }

    return {
        "taskType": "multiclass_classification",
        "targetColumn": target_col,
        "targetConfidence": target_semantic.get("confidence", 0.72),
        "requiresTargetSelection": False,
        "reason": "Target values are non-numeric labels.",
    }
