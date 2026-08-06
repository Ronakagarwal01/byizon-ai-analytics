from __future__ import annotations

from typing import Any


def detect_domain(parsed: dict[str, Any], profile: dict[str, Any]) -> dict[str, Any]:
    """Return a cautious domain estimate.

    This detector is intentionally conservative. The platform must not force
    business meaning into a dataset; when evidence is not strong, it remains
    generic and downstream KPI/chart planning stays data-type driven.
    """
    # Multi-sheet workbooks often repeat the same metric in detail and summary
    # sheets. Count a semantic column name once so repeated summaries cannot
    # falsely force a financial or other domain classification.
    seen_columns: set[str] = set()
    date_cols = 0
    numeric_cols = 0
    currency_like = 0
    percent_like = 0
    text_cols = 0

    for table in profile["tableProfiles"]:
        for col in table["columns"]:
            name = col["name"].lower()
            normalized_name = " ".join(name.split())
            if normalized_name in seen_columns:
                continue
            seen_columns.add(normalized_name)
            dtype = col["detectedType"]
            if dtype == "date":
                date_cols += 1
            if dtype == "numeric":
                numeric_cols += 1
            if any(symbol in name for symbol in ["₹", "$", "€", "£"]) or any(token in name for token in ["amount", "cost", "price", "value", "total"]):
                currency_like += 1
            if "%" in name or any(token in name for token in ["percent", "percentage", "rate", "ratio"]):
                percent_like += 1
            if dtype == "categorical" and (col.get("uniqueRate") or 0) > 0.7:
                text_cols += 1

    total_columns = max(len(seen_columns), 1)
    evidence: list[str] = []
    if date_cols and numeric_cols:
        evidence.append(f"{date_cols} date column(s) and {numeric_cols} numeric column(s) support time-based exploration.")
    if currency_like >= 2:
        evidence.append(f"{currency_like} columns contain financial-style numeric evidence.")
    if percent_like:
        evidence.append(f"{percent_like} percentage/rate-style column(s) detected.")
    if text_cols >= total_columns * 0.35:
        evidence.append("High-cardinality text-like columns suggest record-level logs or exports.")

    financial_density = currency_like / max(numeric_cols, 1)
    if currency_like >= 2 and numeric_cols >= 2 and financial_density >= 0.35:
        return {"domain": "Financial / Quantitative Dataset", "confidence": 0.78, "evidence": evidence}
    if date_cols and numeric_cols:
        return {"domain": "Time Series / Event Dataset", "confidence": 0.72, "evidence": evidence}
    if numeric_cols >= max(3, total_columns * 0.35):
        return {"domain": "Quantitative Structured Dataset", "confidence": 0.68, "evidence": evidence}
    return {"domain": "Generic Structured Dataset", "confidence": 0.55, "evidence": evidence or ["No strong domain evidence; using generic exploratory analysis."]}
