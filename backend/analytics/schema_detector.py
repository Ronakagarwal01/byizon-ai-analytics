from __future__ import annotations

from typing import Any

from .data_profiler import clean_datetime, clean_numeric, is_empty_value


def _basic_type(series) -> str:
    non_empty = series[~series.map(is_empty_value)]
    if non_empty.empty:
        return "empty"
    numeric_ratio = clean_numeric(non_empty).notna().mean()
    if numeric_ratio >= 0.75:
        return "numeric"
    date_ratio = clean_datetime(non_empty).notna().mean()
    if date_ratio >= 0.65:
        return "date"
    lowered = non_empty.astype(str).str.strip().str.lower()
    if lowered.isin(["true", "false", "yes", "no", "1", "0"]).mean() >= 0.85:
        return "boolean"
    return "categorical"


def detect_schema(parsed: dict[str, Any]) -> dict[str, Any]:
    """Initial schema pass with no business assumptions.

    Semantic roles are assigned later by semantic_understanding_engine after
    profiling has measured cardinality, missingness, and distributions.
    """
    table_schemas = []
    for table in parsed["tables"]:
        table_schemas.append({
            "name": table.name,
            "rowCount": len(table.dataframe),
            "columnCount": len(table.dataframe.columns),
            "columns": [
                {
                    "name": column,
                    "detectedType": _basic_type(table.dataframe[column]),
                }
                for column in table.dataframe.columns
            ],
            "roles": {},
            "roleCandidates": {},
            "businessEntities": [],
        })
    return {
        "datasetType": "Generic Structured Dataset",
        "businessDomain": "Generic Structured Dataset",
        "confidence": 0.5,
        "primaryTable": parsed["primary_table_name"],
        "columnRoles": {},
        "tables": table_schemas,
        "relationships": [],
    }
