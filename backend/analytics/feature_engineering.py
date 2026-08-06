from __future__ import annotations

from itertools import combinations
from typing import Any

import numpy as np
import pandas as pd

from .data_profiler import clean_datetime, clean_numeric


def _semantic_columns(schema: dict[str, Any]) -> dict[str, dict[str, Any]]:
    table = next((item for item in schema.get("tables", []) if item.get("name") == schema.get("primaryTable")), {})
    return {column["name"]: column for column in table.get("columns", [])}


def apply_feature_engineering(df: pd.DataFrame, schema: dict[str, Any], target_col: str | None = None) -> tuple[pd.DataFrame, list[dict[str, Any]]]:
    engineered = df.copy()
    semantics = _semantic_columns(schema)
    created: list[dict[str, Any]] = []

    for column, semantic in semantics.items():
        if column in engineered.columns and semantic.get("isMeasure"):
            engineered[column] = clean_numeric(engineered[column])

    for column, semantic in semantics.items():
        if column == target_col or column not in engineered.columns:
            continue
        if semantic.get("is_time") or semantic.get("semanticType") == "date":
            dates = clean_datetime(engineered[column])
            if dates.notna().sum() >= max(3, len(engineered) * 0.2):
                for suffix, values in {
                    "year": dates.dt.year,
                    "month": dates.dt.month,
                    "dayofweek": dates.dt.dayofweek,
                    "quarter": dates.dt.quarter,
                }.items():
                    name = f"{column}__{suffix}"
                    engineered[name] = values
                    created.append({"feature": name, "sourceColumns": [column], "method": f"date part: {suffix}"})

        if semantic.get("semanticType") == "free_text":
            name = f"{column}__text_length"
            engineered[name] = engineered[column].astype(str).str.len()
            created.append({"feature": name, "sourceColumns": [column], "method": "text length"})

    numeric_columns = [
        column for column, semantic in semantics.items()
        if column != target_col
        and column in engineered.columns
        and semantic.get("isMeasure")
        and not semantic.get("isIdentifier")
        and not semantic.get("is_encoded_category")
    ][:6]

    for left, right in combinations(numeric_columns, 2):
        left_values = clean_numeric(engineered[left])
        right_values = clean_numeric(engineered[right])
        if right_values.abs().median() == 0 or right_values.notna().sum() < 10:
            continue
        ratio_name = f"{left}__per__{right}"
        denominator = right_values.replace(0, np.nan)
        engineered[ratio_name] = (left_values / denominator).astype(float)
        created.append({"feature": ratio_name, "sourceColumns": [left, right], "method": "ratio"})
        if len([item for item in created if item["method"] == "ratio"]) >= 4:
            break

    for column in numeric_columns[:4]:
        values = clean_numeric(engineered[column])
        if values.nunique(dropna=True) >= 8:
            try:
                name = f"{column}__bin"
                engineered[name] = pd.qcut(values, q=min(4, values.nunique()), duplicates="drop").astype(str)
                created.append({"feature": name, "sourceColumns": [column], "method": "quantile bin"})
            except Exception:
                pass

    return engineered, created
