from __future__ import annotations

import math
import re
import warnings
from typing import Any

import numpy as np
import pandas as pd


EMPTY_MARKERS = {"", "nan", "none", "null", "na", "n/a", "-", "--"}


def clean_numeric(series: pd.Series) -> pd.Series:
    text = series.astype(str).str.strip()
    text = text.str.replace(
        r"(?i)\b(rs|inr|usd|eur|gbp|hrs?|hours?|days?|mins?|minutes?|secs?|seconds?|units?)\b",
        "",
        regex=True,
    )
    has_unhandled_letters = text.str.contains(r"[A-Za-z]", na=False)
    text = text.str.replace(r"^\((.*)\)$", r"-\1", regex=True)
    text = text.str.replace(r"[^0-9.\-]", "", regex=True)
    values = pd.to_numeric(text, errors="coerce")
    return values.mask(has_unhandled_letters)


def clean_datetime(series: pd.Series) -> pd.Series:
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", UserWarning)
        return pd.to_datetime(series.replace("", pd.NA), errors="coerce", dayfirst=True)


def is_empty_value(value: Any) -> bool:
    if value is None:
        return True
    if isinstance(value, float) and math.isnan(value):
        return True
    return str(value).strip().lower() in EMPTY_MARKERS


def detect_data_type(series: pd.Series) -> str:
    non_empty = series[~series.map(is_empty_value)]
    if non_empty.empty:
        return "empty"
    numeric_ratio = clean_numeric(non_empty).notna().mean()
    if numeric_ratio >= 0.75:
        return "numeric"
    date_ratio = clean_datetime(non_empty).notna().mean()
    if date_ratio >= 0.65:
        return "date"
    lower = non_empty.astype(str).str.lower().str.strip()
    boolean_ratio = lower.isin(["true", "false", "yes", "no", "1", "0"]).mean()
    if boolean_ratio >= 0.85:
        return "boolean"
    return "categorical"


def infer_format_pattern(value: str) -> str:
    value = str(value).strip()
    if not value:
        return "empty"
    pattern = re.sub(r"[A-Z]", "A", value)
    pattern = re.sub(r"[a-z]", "a", pattern)
    pattern = re.sub(r"\d", "9", pattern)
    return pattern[:40]


def profile_numeric(series: pd.Series) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    nums = clean_numeric(series)
    valid = nums.dropna()
    if valid.empty:
        return {}, []

    q1 = valid.quantile(0.25)
    q3 = valid.quantile(0.75)
    iqr = q3 - q1
    lower = q1 - 1.5 * iqr
    upper = q3 + 1.5 * iqr
    outlier_mask = nums.notna() & ((nums < lower) | (nums > upper))
    median = valid.median()
    outlier_values = nums[outlier_mask].dropna()
    ranked_outlier_indexes = (
        outlier_values
        .sub(median)
        .abs()
        .sort_values(ascending=False)
        .head(100)
        .index
    )
    outliers = [
        {
            "row": int(idx) + 1,
            "value": float(nums.loc[idx]),
            "method": "IQR",
            "lowerBound": float(lower) if np.isfinite(lower) else None,
            "upperBound": float(upper) if np.isfinite(upper) else None,
        }
        for idx in ranked_outlier_indexes
    ]
    stats = {
        "count": int(valid.count()),
        "sum": float(valid.sum()),
        "mean": float(valid.mean()),
        "median": float(valid.median()),
        "min": float(valid.min()),
        "max": float(valid.max()),
        "std": float(valid.std(ddof=0) if len(valid) > 1 else 0),
        "q1": float(q1),
        "q3": float(q3),
        "outlierCount": int(outlier_mask.sum()),
    }
    return stats, outliers


def profile_categorical(series: pd.Series) -> dict[str, Any]:
    values = series[~series.map(is_empty_value)].astype(str).str.strip()
    if values.empty:
        return {"uniqueCount": 0, "topValues": [], "unusualCategories": []}
    counts = values.value_counts(dropna=True)
    total = int(counts.sum())
    unusual = [
        {"name": str(name), "count": int(count), "share": round(float(count / total), 4)}
        for name, count in counts[counts <= max(1, total * 0.01)].head(20).items()
    ]
    return {
        "uniqueCount": int(values.nunique()),
        "topValues": [
            {"name": str(name), "count": int(count), "share": round(float(count / total), 4)}
            for name, count in counts.head(15).items()
        ],
        "unusualCategories": unusual,
    }


def profile_date(series: pd.Series) -> tuple[dict[str, Any], int]:
    non_empty = series[~series.map(is_empty_value)]
    dates = clean_datetime(non_empty)
    valid = dates.dropna()
    invalid_count = int(dates.isna().sum())
    if valid.empty:
        return {}, invalid_count
    return {
        "count": int(valid.count()),
        "earliest": valid.min().date().isoformat(),
        "latest": valid.max().date().isoformat(),
        "yearCount": int(valid.dt.year.nunique()),
        "monthCount": int(valid.dt.to_period("M").nunique()),
    }, invalid_count


def profile_table(table: Any, roles: dict[str, str] | None = None) -> dict[str, Any]:
    df: pd.DataFrame = table.dataframe
    row_count = int(len(df))
    col_count = int(len(df.columns))
    total_cells = max(row_count * col_count, 1)
    duplicate_count = int(df.astype(str).duplicated().sum()) if row_count else 0

    columns: list[dict[str, Any]] = []
    missing_total = 0
    invalid_dates_total = 0
    outlier_rows: list[dict[str, Any]] = []
    inconsistent_formats: list[dict[str, Any]] = []

    for column in df.columns:
        series = df[column]
        missing_count = int(series.map(is_empty_value).sum())
        missing_total += missing_count
        non_empty = series[~series.map(is_empty_value)]
        dtype = detect_data_type(series)
        unique_count = int(non_empty.astype(str).nunique()) if not non_empty.empty else 0

        numeric_stats: dict[str, Any] | None = None
        categorical_stats: dict[str, Any] | None = None
        date_stats: dict[str, Any] | None = None

        if dtype == "numeric":
            numeric_stats, numeric_outliers = profile_numeric(series)
            for outlier in numeric_outliers:
                outlier_rows.append({
                    "column": column,
                    **outlier,
                })
        elif dtype == "date":
            date_stats, invalid = profile_date(series)
            invalid_dates_total += invalid
        else:
            categorical_stats = profile_categorical(series)

        should_check_pattern = dtype == "date" or (
            dtype == "categorical" and unique_count / max(len(non_empty), 1) >= 0.6
        )
        if should_check_pattern and not non_empty.empty:
            patterns = non_empty.astype(str).map(infer_format_pattern).value_counts()
            if len(patterns) > 1 and patterns.iloc[0] / max(patterns.sum(), 1) < 0.85:
                inconsistent_formats.append({
                    "column": column,
                    "dominantPattern": str(patterns.index[0]),
                    "patternCount": int(len(patterns)),
                })

        role = next((role_name for role_name, role_col in (roles or {}).items() if role_col == column), None)
        columns.append({
            "name": column,
            "detectedType": dtype,
            "role": role,
            "missingCount": missing_count,
            "missingRate": round(missing_count / max(row_count, 1), 4),
            "uniqueCount": unique_count,
            "uniqueRate": round(unique_count / max(len(non_empty), 1), 4),
            "sampleValues": [str(v) for v in non_empty.head(10).tolist()],
            "numericStats": numeric_stats,
            "categoricalStats": categorical_stats,
            "dateStats": date_stats,
        })

    completeness = round(((total_cells - missing_total) / total_cells) * 100, 1)
    missing_penalty = min(35, (missing_total / total_cells) * 100)
    duplicate_penalty = min(20, (duplicate_count / max(row_count, 1)) * 100)
    invalid_penalty = min(15, invalid_dates_total * 100 / max(total_cells, 1))
    outlier_total = sum(int((col.get("numericStats") or {}).get("outlierCount") or 0) for col in columns)
    outlier_penalty = min(10, outlier_total * 100 / max(row_count, 1))
    format_penalty = min(10, len(inconsistent_formats) * 2)
    quality = round(max(0, 100 - missing_penalty - duplicate_penalty - invalid_penalty - outlier_penalty - format_penalty), 1)

    warnings: list[str] = []
    if completeness < 90:
        warnings.append(f"Completeness is {completeness}%; missing values may affect analysis.")
    if duplicate_count:
        warnings.append(f"{duplicate_count} duplicate rows detected.")
    if invalid_dates_total:
        warnings.append(f"{invalid_dates_total} invalid date values detected.")
    if inconsistent_formats:
        warnings.append(f"{len(inconsistent_formats)} columns have inconsistent value formats.")

    return {
        "name": table.name,
        "sourceType": table.source_type,
        "rowCount": row_count,
        "columnCount": col_count,
        "duplicateRows": duplicate_count,
        "emptyCount": missing_total,
        "missingValuesByColumn": [
            {"column": col["name"], "missing": col["missingCount"], "missingRate": col["missingRate"]}
            for col in columns
            if col["missingCount"] > 0
        ],
        "invalidDates": invalid_dates_total,
        "inconsistentFormats": inconsistent_formats,
        "outlierRows": outlier_rows,
        "outliersCount": outlier_total,
        "completeness": completeness,
        "quality": quality,
        "columns": columns,
        "warnings": warnings,
    }


def build_data_profile(parsed: dict[str, Any], schema: dict[str, Any]) -> dict[str, Any]:
    table_schema_by_name = {table_schema["name"]: table_schema for table_schema in schema["tables"]}
    table_profiles = []
    for table in parsed["tables"]:
        roles = table_schema_by_name.get(table.name, {}).get("roles", {})
        table_profiles.append(profile_table(table, roles))

    total_rows = sum(table["rowCount"] for table in table_profiles)
    total_columns = sum(table["columnCount"] for table in table_profiles)
    total_empty = sum(table["emptyCount"] for table in table_profiles)
    total_cells = max(sum(table["rowCount"] * table["columnCount"] for table in table_profiles), 1)
    duplicate_rows = sum(table["duplicateRows"] for table in table_profiles)
    outliers = sum(table["outliersCount"] for table in table_profiles)
    invalid_dates = sum(table["invalidDates"] for table in table_profiles)
    completeness = round(((total_cells - total_empty) / total_cells) * 100, 1)
    quality = round(sum(table["quality"] for table in table_profiles) / max(len(table_profiles), 1), 1)

    return {
        "tableProfiles": table_profiles,
        "overall": {
            "totalRows": int(total_rows),
            "totalColumns": int(total_columns),
            "tableCount": int(len(table_profiles)),
            "emptyCount": int(total_empty),
            "duplicatesCount": int(duplicate_rows),
            "outliersCount": int(outliers),
            "invalidDates": int(invalid_dates),
            "completeness": completeness,
            "quality": quality,
            "warnings": [warning for table in table_profiles for warning in table["warnings"]],
        },
    }
