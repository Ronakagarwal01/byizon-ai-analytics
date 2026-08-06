from __future__ import annotations

from typing import Any


def discover_patterns(schema: dict[str, Any], profile: dict[str, Any], metric_result: dict[str, Any], anomaly_result: dict[str, Any]) -> list[dict[str, Any]]:
    patterns: list[dict[str, Any]] = []

    for pair in metric_result.get("correlationAnalysis", {}).get("pairs", [])[:6]:
        patterns.append({
            "type": "relationship",
            "title": f"{pair['x']} and {pair['y']} move together",
            "observation": f"{pair['x']} and {pair['y']} have {pair['direction']} correlation {pair['correlation']}.",
            "evidence": f"Pearson correlation r={pair['correlation']} across valid numeric rows.",
            "impact": "This may indicate a useful relationship or redundant variables. It is not proof of causation.",
            "confidence": pair.get("confidence", "Medium"),
            "recommendation": "Validate the relationship with domain review before using it for decisions.",
        })

    for stat in metric_result.get("summaryStats", [])[:10]:
        skew = abs(float(stat.get("skewness") or 0))
        if skew >= 1.0:
            patterns.append({
                "type": "distribution",
                "title": f"{stat['column']} is skewed",
                "observation": f"{stat['column']} has skewness {stat['skewness']:.2f}.",
                "evidence": f"Mean={stat['mean']:.2f}, median={stat['median']:.2f}, p95={stat['p95']:.2f}.",
                "impact": "Averages may be misleading; median/percentiles are safer for this variable.",
                "confidence": "High" if stat.get("count", 0) >= 30 else "Medium",
                "recommendation": "Use median, percentile bands, or segmented analysis for this variable.",
            })

    for cat in metric_result.get("categoricalStats", [])[:10]:
        if cat.get("topShare", 0) >= 60 and cat.get("uniqueCount", 0) > 1:
            patterns.append({
                "type": "dominance",
                "title": f"{cat['column']} is dominated by one value",
                "observation": f"{cat['topValue']} represents {cat['topShare']}% of non-empty {cat['column']} records.",
                "evidence": f"{cat['topCount']:,} records out of the non-empty values use this category.",
                "impact": "This column may be imbalanced; averages by this dimension may hide minority groups.",
                "confidence": "High",
                "recommendation": "Review minority categories separately before making segment-level decisions.",
            })

    trend = metric_result.get("trendData") or []
    if len(trend) >= 3:
        last = trend[-1]["value"]
        prev = trend[-2]["value"]
        earlier = trend[-3]["value"]
        if prev and earlier:
            last_change = (last - prev) / abs(prev) * 100
            prev_change = (prev - earlier) / abs(earlier) * 100
            if abs(last_change - prev_change) >= 25:
                patterns.append({
                    "type": "trend_change",
                    "title": "Recent trend changed materially",
                    "observation": f"Latest period changed by {last_change:.1f}% after previous change of {prev_change:.1f}%.",
                    "evidence": f"{trend[-3]['name']}={earlier:.2f}, {trend[-2]['name']}={prev:.2f}, {trend[-1]['name']}={last:.2f}.",
                    "impact": "Recent movement may represent a shift, seasonality, or data collection change.",
                    "confidence": "Medium",
                    "recommendation": "Check source changes and segment-level drivers for the latest period.",
                })

    for item in anomaly_result.get("outlierSummary", [])[:6]:
        patterns.append({
            "type": "outlier",
            "title": f"Outliers detected in {item['column']}",
            "observation": f"{item['totalOutliers']:,} rows are outside the IQR range for {item['column']}.",
            "evidence": item.get("evidence", ""),
            "impact": "Extreme values can distort averages and downstream decisions.",
            "confidence": "High",
            "recommendation": item.get("recommendedAction", "Review detailed rows before excluding any value."),
        })

    return patterns[:20]
