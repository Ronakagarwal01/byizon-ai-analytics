from __future__ import annotations

from typing import Any

from .pattern_discovery_engine import discover_patterns
from .recommendation_engine import build_recommendations


def _insight_from_pattern(pattern: dict[str, Any]) -> dict[str, str]:
    return {
        "title": pattern["title"],
        "what": pattern["observation"],
        "why": pattern["impact"],
        "evidence": pattern["evidence"],
        "action": pattern["recommendation"],
        "confidence": pattern["confidence"],
        "text": (
            f"{pattern['observation']} Impact: {pattern['impact']} "
            f"Evidence: {pattern['evidence']} Confidence: {pattern['confidence']}. "
            f"Recommended action: {pattern['recommendation']}"
        ),
    }


def generate_insights(schema: dict[str, Any], profile: dict[str, Any], metric_result: dict[str, Any], anomaly_result: dict[str, Any] | None = None) -> dict[str, Any]:
    anomaly_result = anomaly_result or {"outlierSummary": []}
    quality = profile["overall"]
    patterns = discover_patterns(schema, profile, metric_result, anomaly_result)
    insight_objects = [_insight_from_pattern(pattern) for pattern in patterns[:8]]
    if not insight_objects:
        insight_objects.append({
            "title": "Dataset processed",
            "what": "The uploaded dataset was parsed, profiled, and analyzed without major automatic pattern flags.",
            "why": "A clean exploratory baseline is useful before creating domain-specific decisions.",
            "evidence": f"{quality['totalRows']:,} rows, {quality['totalColumns']:,} columns, {quality['completeness']}% completeness.",
            "action": "Review the generated KPIs, distributions, and schema before making decisions.",
            "confidence": "High",
            "text": f"The dataset was parsed successfully with {quality['totalRows']:,} rows and {quality['completeness']}% completeness.",
        })

    risks: list[str] = []
    if quality["quality"] < 85:
        risks.append(f"Data quality score is {quality['quality']}/100; review missing values, duplicates, invalid values, and outliers before high-stakes use.")
    if quality["outliersCount"]:
        risks.append(f"{quality['outliersCount']:,} outlier values were detected across numeric measure columns.")
    if quality["duplicatesCount"]:
        risks.append(f"{quality['duplicatesCount']:,} duplicate rows were detected.")

    strengths: list[str] = []
    if quality["completeness"] >= 98:
        strengths.append(f"Completeness is high at {quality['completeness']}%.")
    if metric_result.get("correlationAnalysis", {}).get("pairs"):
        strengths.append("The dataset has enough numeric measures for relationship analysis.")

    recommendations = build_recommendations(profile, patterns, anomaly_result)
    hidden_patterns = [pattern["observation"] for pattern in patterns]
    conclusion = (
        f"{schema.get('datasetType', 'Generic Structured Dataset')} analyzed with "
        f"{quality['totalRows']:,} rows and {quality['totalColumns']:,} columns. "
        f"Quality score is {quality['quality']}/100. All metrics and insights are generated from parsed data only."
    )
    return {
        "insightObjects": insight_objects,
        "insights": [item["text"] for item in insight_objects],
        "hiddenPatterns": hidden_patterns,
        "patterns": patterns,
        "recommendations": recommendations,
        "risks": risks,
        "strengths": strengths,
        "weaknesses": [],
        "opportunities": [],
        "conclusion": conclusion,
    }
