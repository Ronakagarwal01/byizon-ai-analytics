from __future__ import annotations

from typing import Any


def build_recommendations(profile: dict[str, Any], patterns: list[dict[str, Any]], anomaly_result: dict[str, Any]) -> list[dict[str, str]]:
    recommendations: list[dict[str, str]] = []
    quality = profile["overall"]
    if quality["completeness"] < 98:
        recommendations.append({
            "title": "Improve missing data handling",
            "desc": "Resolve or explicitly label missing values before using sensitive metrics for decisions.",
            "category": "Data Quality",
        })
    if quality["duplicatesCount"]:
        recommendations.append({
            "title": "Review duplicate records",
            "desc": "Confirm whether duplicate rows are real repeated events or accidental exports before aggregation.",
            "category": "Data Quality",
        })
    if anomaly_result.get("outlierSummary"):
        recommendations.append({
            "title": "Validate outlier groups",
            "desc": "Inspect grouped outlier rows and decide whether they are genuine extreme events or data-entry issues.",
            "category": "Risk",
        })
    for pattern in patterns[:5]:
        recommendations.append({
            "title": pattern["title"],
            "desc": pattern["recommendation"],
            "category": pattern["type"].replace("_", " ").title(),
        })
    if not recommendations:
        recommendations.append({
            "title": "Use this as an exploratory baseline",
            "desc": "The dataset has no major automatic warnings. Use the generated KPIs, distributions, and relationships as a baseline for deeper review.",
            "category": "Analysis",
        })
    seen = set()
    output = []
    for item in recommendations:
        key = (item["title"], item["desc"])
        if key in seen:
            continue
        seen.add(key)
        output.append(item)
    return output[:12]
