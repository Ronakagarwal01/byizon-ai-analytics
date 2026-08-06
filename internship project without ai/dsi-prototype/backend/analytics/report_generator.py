from __future__ import annotations

from typing import Any


def generate_report(
    parsed: dict[str, Any],
    schema: dict[str, Any],
    profile: dict[str, Any],
    kpi_result: dict[str, Any],
    chart_result: dict[str, Any],
    insight_result: dict[str, Any],
    anomaly_result: dict[str, Any],
    root_cause_result: dict[str, Any],
    data_science_result: dict[str, Any] | None = None,
) -> dict[str, Any]:
    quality = profile["overall"]
    kpis = kpi_result["kpis"]
    first_kpis = "; ".join(f"{kpi['label']}: {kpi['value']}" for kpi in kpis[:5])
    warnings = quality.get("warnings") or []
    anomaly_quality = anomaly_result["dataQualitySummary"]

    summary_parts = [
        f"{parsed['file_name']} was analyzed as a {schema['datasetType']} with {quality['totalRows']:,} rows, {quality['totalColumns']:,} columns, and {quality['tableCount']} table(s).",
        f"Data quality score is {quality['quality']}/100 with {quality['completeness']}% completeness and {anomaly_quality['severity']} severity.",
    ]
    if first_kpis:
        summary_parts.append(f"Key metrics: {first_kpis}.")
    if warnings:
        summary_parts.append(f"Main data warning: {warnings[0]}")

    sections = {
        "Executive Summary": " ".join(summary_parts),
        "Dataset Overview": {
            "fileName": parsed["file_name"],
            "fileType": parsed["file_type"],
            "primaryTable": schema["primaryTable"],
            "tables": schema["tables"],
            "relationships": schema["relationships"],
        },
        "KPI Cards": kpis,
        "Data Quality Audit": anomaly_result["dataQualitySummary"],
        "Missing Values Summary": anomaly_result["missingValueSummary"],
        "Outlier Summary": [
            {key: value for key, value in item.items() if key != "details"}
            for item in anomaly_result["outlierSummary"]
        ],
        "Trend Analysis": kpi_result.get("trendData", []),
        "Category/Segment Analysis": kpi_result.get("topBottom", {}),
        "Correlation Analysis": kpi_result.get("correlationAnalysis", {}),
        "Hidden Patterns": insight_result["hiddenPatterns"],
        "Possible Root Causes": root_cause_result["possibleRootCauses"] or root_cause_result["unavailableRootCauseChecks"],
        "Business Recommendations": insight_result["recommendations"],
        "Detailed Rows / Drill-down": {
            "outlierGroups": [
                {
                    "column": item["column"],
                    "totalOutliers": item["totalOutliers"],
                    "details": item["details"][:25],
                }
                for item in anomaly_result["outlierSummary"]
            ],
        },
        "Final Conclusion": insight_result["conclusion"],
    }
    if data_science_result:
        sections.update({
            "AI Data Scientist Executive Summary": data_science_result.get("conclusion"),
            "Visual EDA": [
                {key: value for key, value in plot.items() if key != "image"}
                for plot in data_science_result.get("visualizations", {}).get("plots", [])
            ],
            "Target Analysis": data_science_result.get("taskDetection", {}),
            "Feature Engineering": data_science_result.get("featureEngineering", {}),
            "Preprocessing Pipeline": data_science_result.get("preprocessing", {}),
            "Model Training Results": data_science_result.get("modelTraining", {}),
            "Model Comparison Table": data_science_result.get("modelTraining", {}).get("modelComparison", []),
            "Best Model Explanation": data_science_result.get("modelTraining", {}).get("bestModel") or data_science_result.get("clustering", {}).get("bestModel"),
            "Feature Importance": data_science_result.get("modelTraining", {}).get("featureImportance", []),
            "Risks and Limitations": [
                *(data_science_result.get("eda", {}).get("dataLeakageWarnings", []) or []),
                *(data_science_result.get("recommendations", []) or []),
            ],
            "AI Data Scientist Recommendations": data_science_result.get("recommendations", []),
        })

    # Legacy aliases retained for older frontend components and downloads.
    sections.update({
        "Key KPIs": kpis,
        "Deep Insights": insight_result["insightObjects"],
        "Charts": chart_result["charts"],
        "Risks & Anomalies": insight_result["risks"],
        "Recommendations": insight_result["recommendations"],
    })

    return {
        "summary": sections["Executive Summary"],
        "report": sections,
        "reportText": _render_text_report(sections),
    }


def _render_text_report(sections: dict[str, Any]) -> str:
    lines: list[str] = []
    for title, content in sections.items():
        lines.append(title.upper())
        lines.append("=" * len(title))
        if isinstance(content, str):
            lines.append(content)
        elif isinstance(content, list):
            for item in content:
                if isinstance(item, dict):
                    label = item.get("title") or item.get("label") or item.get("name") or "Item"
                    desc = item.get("desc") or item.get("text") or item.get("value") or str(item)
                    lines.append(f"- {label}: {desc}")
                else:
                    lines.append(f"- {item}")
        else:
            lines.append(str(content))
        lines.append("")
    return "\n".join(lines)
