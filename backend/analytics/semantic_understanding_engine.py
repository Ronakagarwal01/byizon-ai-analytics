from __future__ import annotations

import re
from typing import Any

import pandas as pd

from .data_profiler import clean_datetime, clean_numeric, empty_mask, inference_sample


CURRENCY_SYMBOLS = {"₹": "₹", "$": "$", "€": "€", "£": "£", "¥": "¥"}


def _clean_name(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", str(value).lower()).strip()


def _contains_any(text: str, tokens: list[str]) -> bool:
    return any(re.search(rf"\b{re.escape(token)}\b", text) for token in tokens)


def _sample(series: pd.Series, limit: int = 200) -> pd.Series:
    sampled = inference_sample(series, max(limit * 2, limit))
    values = sampled[~empty_mask(sampled)].astype(str).str.strip()
    return values.head(limit)


def _value_regex_rate(series: pd.Series, pattern: str) -> float:
    values = _sample(series)
    if values.empty:
        return 0.0
    return float(values.str.match(pattern, na=False).mean())


def _currency_symbol(series: pd.Series, column_name: str) -> str | None:
    text = " ".join(_sample(series).head(80).tolist()) + " " + column_name
    for symbol in CURRENCY_SYMBOLS:
        if symbol in text:
            return symbol
    lowered = text.lower()
    for code, symbol in [("inr", "₹"), ("rs", "₹"), ("usd", "$"), ("eur", "€"), ("gbp", "£")]:
        if re.search(rf"\b{code}\b", lowered):
            return symbol
    return None


def _is_id_like(column_name: str, profile_col: dict[str, Any], series: pd.Series) -> tuple[bool, float, list[str]]:
    clean = _clean_name(column_name)
    reasons: list[str] = []
    unique_rate = float(profile_col.get("uniqueRate") or 0)
    missing_rate = float(profile_col.get("missingRate") or 0)
    dtype = profile_col.get("detectedType")
    sample = _sample(series)
    sequential_numeric = False
    nums = clean_numeric(inference_sample(series, 1000)).dropna()
    if len(nums) >= 3:
        diffs = nums.sort_values().diff().dropna()
        sequential_numeric = bool((diffs == 1).mean() > 0.85)
    has_name_evidence = _contains_any(clean, ["id", "uuid", "guid", "key", "code", "postal", "zip", "pincode"])
    if has_name_evidence:
        reasons.append("column name indicates identifier")
    if sequential_numeric:
        reasons.append("numeric values look sequential")
    generated_code_like = False
    if not sample.empty and sample.str.contains(r"^[A-Za-z]{1,8}[-_ ]?\d{2,}$", regex=True).mean() > 0.7:
        generated_code_like = True
        reasons.append("values look like generated codes")
    if dtype == "categorical" and unique_rate >= 0.98 and missing_rate < 0.02 and (has_name_evidence or generated_code_like):
        reasons.append("values are almost fully unique")
    name_bonus = 0.45 if has_name_evidence else 0
    uniqueness_bonus = 0.35 if dtype == "categorical" and unique_rate >= 0.98 and (has_name_evidence or generated_code_like) else 0
    score = min(1.0, 0.25 * len(reasons) + name_bonus + uniqueness_bonus)
    if dtype == "numeric" and not (has_name_evidence or sequential_numeric):
        score = 0.0
    is_id = score >= 0.5 and dtype in {"numeric", "categorical"}
    return is_id, round(score, 2), reasons


def _semantic_for_column(column_name: str, profile_col: dict[str, Any], series: pd.Series) -> dict[str, Any]:
    clean = _clean_name(column_name)
    dtype = profile_col.get("detectedType")
    sampled = inference_sample(series, 1000)
    non_empty = sampled[~empty_mask(sampled)]
    row_count = max(len(series), 1)
    unique_count = int(profile_col.get("uniqueCount") or 0)
    unique_rate = float(profile_col.get("uniqueRate") or 0)
    missing_rate = float(profile_col.get("missingRate") or 0)
    id_like, id_confidence, id_reasons = _is_id_like(column_name, profile_col, series)
    currency_symbol = _currency_symbol(series, column_name)
    numeric_stats = profile_col.get("numericStats") or {}

    semantic_type = dtype or "unknown"
    confidence = 0.65
    reasons: list[str] = []
    is_additive = False
    default_aggregation = "none"
    is_encoded_category = False

    if dtype == "date":
        semantic_type = "date"
        confidence = 0.9
        default_aggregation = "time_group"
        reasons.append("values parse consistently as dates")
    elif _value_regex_rate(series, r"^[^@\s]+@[^@\s]+\.[^@\s]+$") >= 0.8:
        semantic_type = "email"
        confidence = 0.95
        reasons.append("most values match email pattern")
    elif _contains_any(clean, ["phone", "mobile", "telephone", "whatsapp"]) or (
        _contains_any(clean, ["contact"]) and _value_regex_rate(series, r"^\+?[\d\s().-]{7,}$") >= 0.85
    ) or (
        _value_regex_rate(series, r"^\+?[\d\s().-]{7,}$") >= 0.85 and dtype != "numeric"
    ):
        semantic_type = "phone"
        confidence = 0.85
        reasons.append("column values or header indicate phone/contact data")
    elif id_like:
        semantic_type = "identifier"
        confidence = max(0.78, id_confidence)
        reasons.extend(id_reasons)
    elif dtype == "boolean":
        semantic_type = "boolean"
        confidence = 0.9
        default_aggregation = "count"
    elif dtype == "numeric":
        if currency_symbol:
            semantic_type = "currency"
            confidence = 0.92
            if _contains_any(clean, ["unit", "rate", "ratio", "percent", "percentage", "margin"]):
                is_additive = False
                default_aggregation = "mean"
                reasons.append("currency-like values appear to be per-unit/rate values")
            else:
                is_additive = True
                default_aggregation = "sum"
            reasons.append("currency symbol/code detected in column values or header")
        elif "%" in str(column_name) or _contains_any(clean, ["percent", "percentage", "rate", "ratio"]):
            semantic_type = "percentage"
            confidence = 0.86
            default_aggregation = "mean"
            reasons.append("header/value pattern indicates percentage or rate")
        elif _contains_any(clean, ["lat", "latitude"]):
            semantic_type = "latitude"
            confidence = 0.86
        elif _contains_any(clean, ["lon", "lng", "longitude"]):
            semantic_type = "longitude"
            confidence = 0.86
        elif unique_count <= min(12, max(3, row_count * 0.08)) and numeric_stats:
            semantic_type = "ordinal"
            confidence = 0.72
            default_aggregation = "median"
            is_encoded_category = True
            reasons.append("numeric column has few repeated ordered values")
        else:
            semantic_type = "continuous_numeric"
            confidence = 0.82
            # A sum is only considered safe when the column itself carries additive evidence.
            if _contains_any(clean, ["total", "amount", "quantity", "qty", "count", "volume", "value"]):
                is_additive = True
                default_aggregation = "sum"
                reasons.append("header suggests an additive numeric measure")
            else:
                default_aggregation = "mean"
    elif dtype == "categorical":
        avg_len = float(non_empty.astype(str).str.len().mean()) if not non_empty.empty else 0
        if avg_len > 60 or unique_rate > 0.75:
            semantic_type = "free_text"
            confidence = 0.76
            reasons.append("high-cardinality or long text values")
        elif unique_count == 2:
            semantic_type = "binary_category"
            confidence = 0.82
            default_aggregation = "count"
        else:
            semantic_type = "categorical"
            confidence = 0.82
            default_aggregation = "count"
    elif dtype == "empty":
        semantic_type = "empty"
        confidence = 0.95

    target_name_evidence = _contains_any(clean, ["target", "label", "outcome", "class", "result"])
    if target_name_evidence and semantic_type not in {"identifier", "free_text"}:
        semantic_type = "target_label"
        confidence = max(confidence, 0.78)
        reasons.append("header suggests label/target column")

    is_id = semantic_type == "identifier"
    is_time = semantic_type == "date"
    is_text = semantic_type in {"free_text", "email", "phone"}
    is_target = semantic_type == "target_label"
    is_measure = semantic_type in {"continuous_numeric", "currency", "percentage"} and not is_id and not is_encoded_category
    is_dimension = semantic_type in {"categorical", "binary_category", "boolean", "target_label"}
    analytical_role = _analytical_role(
        semantic_type,
        is_id=is_id,
        is_target=is_target,
        is_measure=is_measure,
        is_dimension=is_dimension,
        is_time=is_time,
        is_text=is_text,
        is_encoded_category=is_encoded_category,
    )
    importance_score = _importance_score(
        column_name,
        semantic_type,
        unique_count=unique_count,
        unique_rate=unique_rate,
        missing_rate=missing_rate,
        confidence=confidence,
        is_target=is_target,
        is_measure=is_measure,
        is_dimension=is_dimension,
        is_time=is_time,
        is_id=is_id,
        is_text=is_text,
        is_encoded_category=is_encoded_category,
        is_additive=is_additive,
    )

    return {
        "name": column_name,
        "detectedType": dtype,
        "semanticType": semantic_type,
        "semantic_type": semantic_type,
        "analytical_role": analytical_role,
        "importance_score": importance_score,
        "confidence": round(confidence, 2),
        "uniqueCount": unique_count,
        "uniqueRate": round(unique_rate, 4),
        "missingRate": round(missing_rate, 4),
        "isIdentifier": is_id,
        "isMeasure": is_measure,
        "isDimension": is_dimension,
        "is_id": is_id,
        "is_target": is_target,
        "is_measure": is_measure,
        "is_dimension": is_dimension,
        "is_time": is_time,
        "is_text": is_text,
        "is_encoded_category": is_encoded_category,
        "isAdditive": is_additive,
        "defaultAggregation": default_aggregation,
        "currencySymbol": currency_symbol,
        "reasons": reasons,
    }


def _analytical_role(
    semantic_type: str,
    *,
    is_id: bool,
    is_target: bool,
    is_measure: bool,
    is_dimension: bool,
    is_time: bool,
    is_text: bool,
    is_encoded_category: bool,
) -> str:
    if is_target:
        return "target"
    if is_id:
        return "identifier"
    if is_time:
        return "time"
    if is_measure:
        return "measure"
    if is_dimension:
        return "dimension"
    if is_text:
        return "text"
    if is_encoded_category:
        return "encoded_category"
    return semantic_type or "unknown"


def _importance_score(
    column_name: str,
    semantic_type: str,
    *,
    unique_count: int,
    unique_rate: float,
    missing_rate: float,
    confidence: float,
    is_target: bool,
    is_measure: bool,
    is_dimension: bool,
    is_time: bool,
    is_id: bool,
    is_text: bool,
    is_encoded_category: bool,
    is_additive: bool,
) -> float:
    clean = _clean_name(column_name)
    score = 0.0
    if is_target:
        score += 0.95
    elif is_time:
        score += 0.72
    elif is_measure:
        score += 0.62
        if is_additive:
            score += 0.18
        if semantic_type == "currency":
            score += 0.12
        if _contains_any(clean, ["net", "gross", "total", "amount", "value", "score", "rating", "duration"]):
            score += 0.12
    elif is_dimension:
        score += 0.52
        if 3 <= unique_count <= 25:
            score += 0.18
        if _contains_any(clean, ["note", "comment", "description", "remark", "text"]):
            score -= 0.3
    elif is_text:
        score += 0.24
    if is_id or is_encoded_category:
        score -= 0.5
    if unique_rate > 0.95 and not is_measure and not is_time:
        score -= 0.25
    score += min(max(confidence, 0), 1) * 0.15
    score -= min(max(missing_rate, 0), 1) * 0.3
    return round(max(0.0, min(score, 1.0)), 3)


def _primary_measure(columns: list[dict[str, Any]]) -> str | None:
    candidates = [
        column for column in columns
        if column["isMeasure"]
        and not column["isIdentifier"]
        and column["semanticType"] not in {"latitude", "longitude", "ordinal"}
    ]
    if not candidates:
        return None
    ranked = sorted(candidates, key=_measure_priority, reverse=True)
    return ranked[0]["name"]


def _measure_priority(col: dict[str, Any]) -> tuple[float, float, float, float, float]:
    clean = _clean_name(col["name"])
    aggregate_signal = 0
    if _contains_any(clean, ["net"]):
        aggregate_signal += 1
    if _contains_any(clean, ["net", "gross", "total", "balance", "amount", "value"]):
        aggregate_signal += 2
    if _contains_any(clean, ["unit", "rate", "ratio", "percent", "percentage", "margin"]):
        aggregate_signal -= 3
    if _contains_any(clean, ["discount", "adjustment", "tax"]):
        aggregate_signal -= 1
    return (
        1 if col["semanticType"] == "currency" else 0,
        1 if col["isAdditive"] else 0,
        aggregate_signal,
        -col["missingRate"],
        col["confidence"],
    )


def _primary_dimension(columns: list[dict[str, Any]]) -> str | None:
    candidates = [
        column for column in columns
        if column["isDimension"] and 1 < column["uniqueCount"] <= 50 and column["missingRate"] < 0.5
    ]
    if not candidates:
        return None
    ranked = sorted(candidates, key=_dimension_priority, reverse=True)
    return ranked[0]["name"]


def _dimension_priority(col: dict[str, Any]) -> tuple[float, float, float, float]:
    clean = _clean_name(col["name"])
    penalty = 0
    if _contains_any(clean, ["note", "comment", "description", "remark", "text"]):
        penalty -= 3
    if col["semanticType"] == "binary_category":
        penalty -= 1
    useful_cardinality = 1 if 3 <= col["uniqueCount"] <= 25 else 0
    return (
        useful_cardinality,
        penalty,
        -col["missingRate"],
        col["confidence"],
    )


def _primary_date(columns: list[dict[str, Any]]) -> str | None:
    dates = [column for column in columns if column["semanticType"] == "date"]
    return dates[0]["name"] if dates else None


def _detect_relationships(parsed: dict[str, Any], table_semantics: list[dict[str, Any]]) -> list[dict[str, Any]]:
    relationships: list[dict[str, Any]] = []
    table_by_name = {table.name: table.dataframe for table in parsed["tables"]}
    semantics_by_name = {table["name"]: table for table in table_semantics}
    for left in table_semantics:
        left_df = table_by_name[left["name"]]
        left_ids = [col["name"] for col in left["columns"] if col["isIdentifier"]]
        for right in table_semantics:
            if right["name"] == left["name"]:
                continue
            right_df = table_by_name[right["name"]]
            for left_col in left_ids:
                left_values = set(left_df[left_col].astype(str).dropna())
                if not left_values:
                    continue
                for right_col in right["columns"]:
                    if right_col["semanticType"] == "free_text":
                        continue
                    right_values = set(right_df[right_col["name"]].astype(str).dropna())
                    overlap = left_values & right_values
                    if len(overlap) >= 2:
                        confidence = len(overlap) / max(len(right_values), 1)
                        if confidence >= 0.15:
                            relationships.append({
                                "fromTable": left["name"],
                                "fromColumn": left_col,
                                "toTable": right["name"],
                                "toColumn": right_col["name"],
                                "matchedValues": len(overlap),
                                "confidence": round(min(confidence, 1.0), 2),
                            })
    return relationships[:20]


def understand_schema(parsed: dict[str, Any], profile: dict[str, Any], domain_result: dict[str, Any] | None = None) -> dict[str, Any]:
    table_profile_by_name = {table["name"]: table for table in profile["tableProfiles"]}
    table_semantics: list[dict[str, Any]] = []
    primary_table_name = parsed["primary_table_name"]
    primary_roles: dict[str, str] = {}

    for table in parsed["tables"]:
        table_profile = table_profile_by_name[table.name]
        profile_cols = {col["name"]: col for col in table_profile["columns"]}
        columns = [
            _semantic_for_column(column, profile_cols[column], table.dataframe[column])
            for column in table.dataframe.columns
        ]
        roles = {
            "id": next((col["name"] for col in columns if col["isIdentifier"]), None),
            "date": _primary_date(columns),
            "metric": _primary_measure(columns),
            "category": _primary_dimension(columns),
            "target": next((col["name"] for col in columns if col["semanticType"] == "target_label"), None),
        }
        roles = {key: value for key, value in roles.items() if value}
        if table.name == primary_table_name:
            primary_roles = roles
        table_semantics.append({
            "name": table.name,
            "rowCount": len(table.dataframe),
            "columnCount": len(table.dataframe.columns),
            "columns": columns,
            "roles": roles,
            "measureColumns": [col["name"] for col in columns if col["isMeasure"] and not col["isIdentifier"]],
            "dimensionColumns": [col["name"] for col in columns if col["isDimension"]],
            "idColumns": [col["name"] for col in columns if col["isIdentifier"]],
        })

    domain = domain_result or {"domain": "Generic Structured Dataset", "confidence": 0.5, "evidence": []}
    return {
        "datasetType": domain["domain"],
        "businessDomain": domain["domain"],
        "confidence": domain["confidence"],
        "domainEvidence": domain.get("evidence", []),
        "primaryTable": primary_table_name,
        "columnRoles": primary_roles,
        "tables": table_semantics,
        "relationships": _detect_relationships(parsed, table_semantics),
        "semanticVersion": "generic-semantic-v1",
    }
