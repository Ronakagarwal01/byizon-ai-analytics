from __future__ import annotations

from typing import Any

from .data_profiler import detect_data_type


def _basic_type(series, column_name: str) -> str:
    return detect_data_type(series, column_name)


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
                    "detectedType": _basic_type(table.dataframe[column], str(column)),
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
