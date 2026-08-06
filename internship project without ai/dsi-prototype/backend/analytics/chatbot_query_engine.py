from __future__ import annotations

import math
import re
from typing import Any


def _lines(items: list[str]) -> str:
    return "\n".join(f"- {item}" for item in items)


def _tokens(text: str) -> set[str]:
    return {token for token in re.findall(r"[a-z0-9]+", text.lower()) if len(token) > 1}


def _score_match(query: str, label: str) -> int:
    q = _tokens(query)
    l = _tokens(label)
    return len(q & l)


def _column_match_score(question: str, column: str) -> int:
    q = _tokens(question) - {
        "total", "sum", "average", "avg", "mean", "median", "minimum", "maximum",
        "min", "max", "kitna", "kitni", "hai", "what", "is", "the", "of",
    }
    c = _tokens(column)
    score = len(q & c) * 3
    normalized_question = re.sub(r"[^a-z0-9]+", " ", question.lower()).strip()
    normalized_column = re.sub(r"[^a-z0-9]+", " ", column.lower()).strip()
    if normalized_column and normalized_column in normalized_question:
        score += 5
    for token in c:
        if token in normalized_question:
            score += 1
    return score


def _requested_aggregate(question: str) -> str | None:
    q = question.lower()
    if any(token in q for token in ["median"]):
        return "median"
    if any(token in q for token in ["average", "avg", "mean", "ausat"]):
        return "mean"
    if any(token in q for token in ["minimum", "lowest", "min value"]):
        return "min"
    if any(token in q for token in ["maximum", "highest", "max value"]):
        return "max"
    if any(token in q for token in ["total", "sum", "kitna", "kitni"]):
        return "sum"
    if "count" in q or "how many" in q:
        return "count"
    return None


def _format_numeric(value: Any, column_info: dict[str, Any]) -> str:
    if value is None:
        return "Not calculated"
    try:
        number = float(value)
    except (TypeError, ValueError):
        return str(value)
    if math.isnan(number) or math.isinf(number):
        return "Not calculated"
    symbol = column_info.get("currencySymbol")
    if not symbol and (
        column_info.get("semanticType") == "currency"
        or re.search(r"\b(revenue|sales|profit|cost|amount|price|balance|income|expense)\b", column_info.get("column", "").lower())
    ):
        symbol = "Rs "
    if abs(number - round(number)) < 1e-9:
        formatted = f"{int(round(number)):,}"
    else:
        formatted = f"{number:,.2f}"
    return f"{symbol or ''}{formatted}"


def _direct_aggregate_answer(question: str, analysis: dict[str, Any]) -> str | None:
    aggregate = _requested_aggregate(question)
    if not aggregate:
        return None
    aggregates = [
        item for item in analysis.get("columnAggregates", [])
        if not item.get("isIdentifier")
    ]
    if not aggregates:
        return None
    ranked = sorted(
        [(item, _column_match_score(question, item.get("column", ""))) for item in aggregates],
        key=lambda pair: pair[1],
        reverse=True,
    )
    if not ranked or ranked[0][1] <= 0:
        return None
    column_info = ranked[0][0]
    column = column_info["column"]
    value = column_info.get(aggregate)
    labels = {
        "sum": "Total",
        "mean": "Average",
        "median": "Median",
        "min": "Minimum",
        "max": "Maximum",
        "count": "Non-null Count",
    }
    formulas = {
        "sum": f"SUM({column})",
        "mean": f"AVG({column})",
        "median": f"MEDIAN({column})",
        "min": f"MIN({column})",
        "max": f"MAX({column})",
        "count": f"COUNT({column})",
    }
    return (
        f"**{labels[aggregate]} {column}:** {_format_numeric(value, column_info)}\n"
        f"Formula: `{formulas[aggregate]}`\n"
        f"Source column: `{column}`\n"
        f"Rows used: {column_info.get('count'):,} non-null values from the uploaded dataset.\n"
        "Confidence: High"
    )


def _format_ranked(items: list[dict[str, Any]]) -> str:
    if not items:
        return "This breakdown cannot be calculated because the required source columns were not detected."
    lines = []
    for index, item in enumerate(items[:10], start=1):
        value = item.get("value", item.get("count", item.get("rawValue", "")))
        lines.append(f"{item.get('rank', index)}. {item.get('name')} - {value}")
    return "\n".join(lines)


def _best_kpi(question: str, kpis: list[dict[str, Any]]) -> dict[str, Any] | None:
    ranked = sorted(
        [(kpi, _score_match(question, kpi.get("label", ""))) for kpi in kpis],
        key=lambda item: item[1],
        reverse=True,
    )
    return ranked[0][0] if ranked and ranked[0][1] > 0 else None


def answer_question(question: str, analysis: dict[str, Any]) -> str:
    q = question.lower().strip()
    report = analysis.get("report") or {}
    data_science = analysis.get("dataScience") or analysis.get("mlAnalysis") or {}

    if re.fullmatch(r"(hi|hii|hello|hey|hlo|namaste|hy)[\s!.?]*", q):
        return "Hello. File analyzed hai. Aap KPI, column, data quality, outlier, trend, correlation, hidden pattern, ya recommendation pooch sakte hain."

    direct_aggregate = _direct_aggregate_answer(question, analysis)
    if direct_aggregate:
        return direct_aggregate

    if "executive" in q or "summary" in q or "saransh" in q:
        return analysis.get("summary") or report.get("Executive Summary") or "Executive summary available nahi hai."

    if any(token in q for token in ["model", "ml", "machine learning", "accuracy", "f1", "rmse", "r2", "classification", "regression"]):
        model = data_science.get("modelTraining") or {}
        task = data_science.get("taskDetection") or {}
        if model.get("trained"):
            best = model.get("bestModel") or {}
            metrics = best.get("metrics") or {}
            return (
                f"**ML Task:** {task.get('taskType')}\n"
                f"**Target:** {task.get('targetColumn')}\n"
                f"**Best Model:** {best.get('model')}\n"
                f"**Selection Metric:** {model.get('selectionMetric')}\n"
                f"**Metrics:** `{metrics}`\n"
                f"Rows used: {model.get('rowCountUsed')} (train {model.get('trainRows')}, test {model.get('testRows')})"
            )
        clustering = data_science.get("clustering") or {}
        if clustering.get("trained"):
            best = clustering.get("bestModel") or {}
            return (
                "**No supervised target was confidently detected.**\n"
                f"Clustering ran instead. Best: **{best.get('model')}**, silhouette score: **{best.get('silhouetteScore')}**.\n"
                "Select a target column to enable classification/regression."
            )
        return f"ML result available nahi hai. Reason: {model.get('reason') or task.get('reason') or data_science.get('error') or 'Not enough valid data.'}"

    if any(token in q for token in ["target", "outcome", "label"]):
        task = data_science.get("taskDetection") or {}
        return (
            f"Target status: **{task.get('targetColumn') or 'No confident target detected'}**\n"
            f"Task: **{task.get('taskType', 'unknown')}**\n"
            f"Reason: {task.get('reason', 'Not available')}"
        )

    if any(token in q for token in ["preprocess", "preprocessing", "impute", "scale", "encoding", "encoder"]):
        prep = data_science.get("preprocessing") or {}
        return (
            "**Preprocessing Pipeline**\n"
            + _lines(prep.get("steps", []))
            + f"\nNumeric features: {', '.join(prep.get('numericFeatures', [])[:20]) or 'None'}"
            + f"\nCategorical features: {', '.join(prep.get('categoricalFeatures', [])[:20]) or 'None'}"
        )

    if any(token in q for token in ["feature importance", "important feature", "driver", "drivers"]):
        model = data_science.get("modelTraining") or {}
        rows = model.get("featureImportance") or []
        if not rows:
            return "Feature importance available nahi hai because no trained model exposed feature importances/coefs."
        return "**Top Feature Importance**\n" + "\n".join(
            f"{idx}. **{row['feature']}** - {row['importance']}"
            for idx, row in enumerate(rows[:10], start=1)
        )

    if any(token in q for token in ["feature engineering", "engineered", "created feature"]):
        features = (data_science.get("featureEngineering") or {}).get("createdFeatures", [])
        if not features:
            return "No engineered features were created because supported source columns were not available."
        return "**Engineered Features**\n" + "\n".join(
            f"- **{item['feature']}** from {', '.join(item['sourceColumns'])} ({item['method']})"
            for item in features[:15]
        )

    if any(token in q for token in ["plot", "chart", "visual", "visualization"]):
        plots = (data_science.get("visualizations") or {}).get("plots", [])
        if not plots:
            return "No meaningful ML/EDA plots were generated for this dataset."
        return "**Generated Visual EDA Plots**\n" + "\n".join(
            f"- **{plot['title']}** ({plot['type']}): {plot['reason']}"
            for plot in plots[:12]
        )

    if any(token in q for token in ["quality", "missing", "duplicate", "dirty", "problem", "issue"]):
        dq = analysis.get("dataQualitySummary") or {}
        parts = [
            f"Quality Score: **{dq.get('qualityScore', 'Not calculated')}/100**",
            f"Completeness: **{dq.get('completenessScore', 'Not calculated')}%**",
            f"Severity: **{dq.get('severity', 'Not calculated')}**",
            f"Missing cells: **{dq.get('missingCellCount', 0):,}**",
            f"Duplicate rows: **{dq.get('duplicateCount', 0):,}**",
            f"Outlier values: **{dq.get('outlierCount', 0):,}**",
            f"Invalid values: **{dq.get('invalidValueCount', 0):,}**",
        ]
        missing = analysis.get("missingValueSummary") or []
        if missing:
            top = missing[0]
            parts.append(f"Highest missing column: **{top['column']}** has {top['missingCount']:,} missing values ({top['missingPercent']}%).")
        return "**Data Quality Audit**\n" + _lines(parts)

    if "outlier" in q or "anomaly" in q:
        outliers = analysis.get("outlierSummary") or []
        if not outliers:
            return "No numeric outlier groups were detected from the uploaded data."
        return "**Grouped Outlier Summary**\n" + "\n".join(
            f"- **{item['column']}**: {item['totalOutliers']:,} outliers. Evidence: {item.get('evidence', '')}"
            for item in outliers[:8]
        )

    if "root" in q or "cause" in q or "why" in q or "kyu" in q:
        causes = analysis.get("possibleRootCauses") or []
        if not causes:
            unavailable = analysis.get("unavailableRootCauseChecks") or ["Not enough columns available"]
            return "Possible root causes calculate nahi ho paaye. " + "; ".join(map(str, unavailable[:4]))
        return "**Possible Root Causes**\n" + "\n".join(
            f"{idx}. **{cause['title']}** - {cause['whatHappened']} Evidence: {cause['evidence']} Confidence: {cause.get('confidence', 'Medium')}"
            for idx, cause in enumerate(causes[:6], start=1)
        )

    if "hidden" in q or "pattern" in q or "insight" in q:
        patterns = analysis.get("hiddenPatterns") or analysis.get("insights") or []
        if not patterns:
            return "No supported hidden patterns were detected from the available columns."
        return "**Hidden Patterns / Insights**\n" + _lines([str(item) for item in patterns[:8]])

    if "recommend" in q or "suggest" in q or "action" in q:
        recs = analysis.get("recommendations") or []
        if not recs:
            return "No deterministic recommendation was generated from the uploaded data."
        return "**Recommendations**\n" + "\n".join(
            f"{idx}. **{rec.get('title', 'Recommendation')}** - {rec.get('desc', '')}"
            for idx, rec in enumerate(recs[:8], start=1)
        )

    if "correlation" in q or "relationship" in q:
        pairs = analysis.get("correlationAnalysis", {}).get("pairs", [])
        if not pairs:
            return "Not enough valid numeric measure columns available for correlation analysis."
        return "**Correlation Findings**\n" + "\n".join(
            f"- **{pair['x']}** vs **{pair['y']}**: r={pair['correlation']} ({pair['strength']}, {pair['direction']})"
            for pair in pairs[:8]
        )

    if "top" in q or "bottom" in q or "segment" in q or "breakdown" in q:
        top_bottom = analysis.get("topBottom") or {}
        rows = top_bottom.get("bottomSegments") if "bottom" in q else top_bottom.get("topSegments")
        return "**Segment Breakdown**\n" + _format_ranked(rows or [])

    if "column" in q or "schema" in q or "field" in q:
        schema = analysis.get("schema") or {}
        columns = analysis.get("columns") or []
        semantic_lines = []
        primary_schema = next((table for table in schema.get("tables", []) if table.get("name") == schema.get("primaryTable")), {})
        for col in primary_schema.get("columns", [])[:30]:
            semantic_lines.append(f"{col['name']}: {col.get('semanticType')} ({col.get('confidence')})")
        return (
            f"Dataset type: **{analysis.get('businessDomain', 'Generic Structured Dataset')}**\n"
            f"Columns: {', '.join(f'`{col}`' for col in columns)}\n\n"
            f"Semantic map:\n" + _lines(semantic_lines)
        )

    if "kpi" in q or "metric" in q or "total" in q or "average" in q or "median" in q:
        kpis = (analysis.get("kpis") or []) + (analysis.get("calculatedMetrics") or [])
        best = _best_kpi(question, kpis)
        if best and not ("kpi" in q or "metric" in q):
            exp = best.get("explainability", {})
            return (
                f"**{best['label']}:** {best['value']}\n"
                f"Formula: `{exp.get('formula', 'Not available')}`\n"
                f"Source column: `{exp.get('sourceColumn', 'Not available')}`\n"
                f"Confidence: {exp.get('confidence', 'High')}"
            )
        if not kpis:
            return "No valid KPIs were generated from the uploaded data."
        return "**Calculated KPIs**\n" + "\n".join(
            f"- **{kpi['label']}**: {kpi['value']} (Formula: `{kpi.get('explainability', {}).get('formula', 'N/A')}`)"
            for kpi in kpis[:12]
        )

    best = _best_kpi(question, (analysis.get("kpis") or []) + (analysis.get("calculatedMetrics") or []))
    if best:
        exp = best.get("explainability", {})
        return (
            f"**{best['label']}:** {best['value']}\n"
            f"Formula: `{exp.get('formula', 'Not available')}`\n"
            f"Source column: `{exp.get('sourceColumn', 'Not available')}`"
        )

    return (
        "Is question ka deterministic answer uploaded data se confidently calculate nahi ho paaya. "
        "Please ask about a generated KPI label, column name, data quality, outliers, correlations, patterns, or recommendations."
    )
