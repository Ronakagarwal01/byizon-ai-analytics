from __future__ import annotations

from collections import defaultdict
from typing import Any


def severity_from_rate(rate: float) -> str:
    if rate >= 0.20:
        return "High"
    if rate >= 0.05:
        return "Medium"
    return "Low"


def overall_severity(quality: float, missing_rate: float, outlier_rate: float, duplicate_rate: float) -> str:
    if quality < 70 or missing_rate >= 0.20 or duplicate_rate >= 0.10:
        return "High"
    if quality < 85 or missing_rate >= 0.05 or outlier_rate >= 0.05 or duplicate_rate > 0:
        return "Medium"
    return "Low"


def possible_missing_reason(column: str, domain: str) -> str:
    return "field may be optional, unavailable at extraction time, or inconsistently captured"


def recommended_missing_action(column: str) -> str:
    return "review source-system rules and decide whether to backfill, exclude, or explicitly mark unavailable values"


def outlier_business_impact(column: str, domain: str) -> str:
    return "extreme values can distort averages, correlations, forecasts, and downstream decisions"


def outlier_action(column: str) -> str:
    return "inspect detailed rows and confirm whether the values are valid extreme cases or data-entry/calculation errors"


def build_data_quality_summary(profile: dict[str, Any]) -> dict[str, Any]:
    overall = profile["overall"]
    total_cells = max(overall["totalRows"] * overall["totalColumns"], 1)
    missing_rate = overall["emptyCount"] / total_cells
    duplicate_rate = overall["duplicatesCount"] / max(overall["totalRows"], 1)
    outlier_rate = overall["outliersCount"] / max(overall["totalRows"], 1)
    return {
        "totalRows": overall["totalRows"],
        "totalColumns": overall["totalColumns"],
        "tableCount": overall["tableCount"],
        "completenessScore": overall["completeness"],
        "qualityScore": overall["quality"],
        "duplicateCount": overall["duplicatesCount"],
        "missingCellCount": overall["emptyCount"],
        "invalidValueCount": overall["invalidDates"],
        "outlierCount": overall["outliersCount"],
        "severity": overall_severity(overall["quality"], missing_rate, outlier_rate, duplicate_rate),
        "warnings": overall.get("warnings", []),
    }


def build_missing_value_summary(profile: dict[str, Any], schema: dict[str, Any]) -> list[dict[str, Any]]:
    domain = schema.get("businessDomain", "Generic")
    output: list[dict[str, Any]] = []
    for table in profile["tableProfiles"]:
        row_count = max(table["rowCount"], 1)
        for item in table["missingValuesByColumn"]:
            missing_pct = item["missingRate"] * 100
            output.append({
                "table": table["name"],
                "column": item["column"],
                "missingCount": item["missing"],
                "missingPercent": round(missing_pct, 1),
                "severity": severity_from_rate(item["missingRate"]),
                "possibleReason": possible_missing_reason(item["column"], domain),
                "recommendedAction": recommended_missing_action(item["column"]),
                "evidence": f"{item['missing']:,} of {row_count:,} rows are missing ({missing_pct:.1f}%).",
            })
    return sorted(output, key=lambda item: item["missingPercent"], reverse=True)


def build_outlier_summary(profile: dict[str, Any], schema: dict[str, Any]) -> list[dict[str, Any]]:
    domain = schema.get("businessDomain", "Generic")
    grouped: dict[tuple[str, str], list[dict[str, Any]]] = defaultdict(list)
    column_totals: dict[tuple[str, str], int] = {}
    range_by_key: dict[tuple[str, str], tuple[float | None, float | None]] = {}

    for table in profile["tableProfiles"]:
        for column in table["columns"]:
            stats = column.get("numericStats") or {}
            outlier_count = int(stats.get("outlierCount") or 0)
            if outlier_count:
                column_totals[(table["name"], column["name"])] = outlier_count
        for row in table.get("outlierRows", []):
            key = (table["name"], row["column"])
            grouped[key].append(row)
            range_by_key[key] = (row.get("lowerBound"), row.get("upperBound"))

    summaries: list[dict[str, Any]] = []
    for key, total in column_totals.items():
        table_name, column = key
        rows = grouped.get(key, [])
        values = [row["value"] for row in rows if row.get("value") is not None]
        lower, upper = range_by_key.get(key, (None, None))
        affected_rows = [row["row"] for row in rows[:10]]
        severity = "High" if total >= 50 else "Medium" if total >= 10 else "Low"
        min_outlier = min(values) if values else None
        max_outlier = max(values) if values else None
        evidence = (
            f"{total:,} outlier rows were detected in {table_name}.{column}. "
            f"Normal IQR range is {lower:.2f} to {upper:.2f}."
            if lower is not None and upper is not None
            else f"{total:,} outlier rows were detected in {table_name}.{column}."
        )
        summaries.append({
            "table": table_name,
            "column": column,
            "totalOutliers": total,
            "minOutlier": min_outlier,
            "maxOutlier": max_outlier,
            "normalRange": {"lower": lower, "upper": upper},
            "affectedRows": affected_rows,
            "severity": severity,
            "whatHappened": f"{column} has values outside the normal IQR range.",
            "whyItMatters": outlier_business_impact(column, domain),
            "evidence": evidence,
            "businessImpact": outlier_business_impact(column, domain),
            "recommendedAction": outlier_action(column),
            "details": sorted(rows, key=lambda item: abs(item.get("value") or 0), reverse=True),
        })
    return sorted(summaries, key=lambda item: item["totalOutliers"], reverse=True)


def build_anomaly_business_impacts(missing: list[dict[str, Any]], outliers: list[dict[str, Any]]) -> list[dict[str, str]]:
    impacts: list[dict[str, str]] = []
    for item in missing[:5]:
        impacts.append({
            "title": f"Missing values in {item['column']}",
            "severity": item["severity"],
            "whatHappened": f"{item['column']} has {item['missingCount']:,} missing values.",
            "whyItMatters": "Missing values can bias KPIs and hide operational exceptions.",
            "evidence": item["evidence"],
            "recommendedAction": item["recommendedAction"],
        })
    for item in outliers[:5]:
        impacts.append({
            "title": f"Outliers in {item['column']}",
            "severity": item["severity"],
            "whatHappened": item["whatHappened"],
            "whyItMatters": item["whyItMatters"],
            "evidence": item["evidence"],
            "recommendedAction": item["recommendedAction"],
        })
    return impacts


def build_anomaly_analysis(profile: dict[str, Any], schema: dict[str, Any]) -> dict[str, Any]:
    quality_summary = build_data_quality_summary(profile)
    missing_summary = build_missing_value_summary(profile, schema)
    outlier_summary = build_outlier_summary(profile, schema)
    impacts = build_anomaly_business_impacts(missing_summary, outlier_summary)
    grouped_anomalies = [
        {
            "id": f"missing-summary-{item['table']}-{item['column']}",
            "severity": "Critical" if item["severity"] == "High" else "Warning" if item["severity"] == "Medium" else "Info",
            "businessSeverity": item["severity"],
            "type": "Missing Values",
            "description": f"{item['column']}: {item['missingCount']:,} missing values ({item['missingPercent']}%). {item['recommendedAction']}",
        }
        for item in missing_summary
    ] + [
        {
            "id": f"outlier-summary-{item['table']}-{item['column']}",
            "severity": "Critical" if item["severity"] == "High" else "Warning" if item["severity"] == "Medium" else "Info",
            "businessSeverity": item["severity"],
            "type": "Outlier Group",
            "description": f"{item['column']}: {item['totalOutliers']:,} outliers. {item['recommendedAction']}",
        }
        for item in outlier_summary
    ]
    return {
        "dataQualitySummary": quality_summary,
        "missingValueSummary": missing_summary,
        "outlierSummary": outlier_summary,
        "anomalyBusinessImpacts": impacts,
        "groupedAnomalies": grouped_anomalies[:100],
    }
