from __future__ import annotations

import re
from typing import Any

import pandas as pd

from .data_profiler import clean_datetime, clean_numeric


def _safe_id(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", value.lower()).strip("_") or "item"


def _format_number(value: float | int | None, decimals: int = 2) -> str:
    if value is None:
        return "Not calculated"
    number = float(value)
    if abs(number - round(number)) < 1e-9:
        return f"{int(round(number)):,}"
    return f"{number:,.{decimals}f}"


def _format_value(value: float | int | None, semantic: dict[str, Any] | None = None) -> str:
    if value is None:
        return "Not calculated"
    semantic = semantic or {}
    if semantic.get("semanticType") == "currency":
        symbol = semantic.get("currencySymbol") or ""
        return f"{symbol}{float(value):,.2f}" if symbol else _format_number(value, 2)
    if semantic.get("semanticType") == "percentage":
        number = float(value)
        if abs(number) <= 1:
            number *= 100
        return f"{number:,.2f}%"
    return _format_number(value, 2)


def _plan_meta(reason: str, source_columns: list[str] | None, formula: str, why: str, confidence: str = "High") -> dict[str, Any]:
    return {
        "reason": reason,
        "sourceColumns": source_columns or [],
        "formula": formula,
        "confidence": confidence,
        "whyUseful": why,
    }


def _card(label: str, raw: Any, value: str, desc: str, meta: dict[str, Any], card_type: str = "overview") -> dict[str, Any]:
    return {
        "id": _safe_id(label),
        "label": label,
        "rawValue": raw,
        "value": value,
        "desc": desc,
        "trend": "neutral",
        "trendValue": "N/A",
        "cardType": card_type,
        "whyUseful": meta["whyUseful"],
        "selectionReason": meta["reason"],
        "sourceColumns": meta["sourceColumns"],
        "explainability": {
            "formula": meta["formula"],
            "sourceColumn": ", ".join(meta["sourceColumns"]) if meta["sourceColumns"] else "Whole table",
            "confidence": meta["confidence"],
        },
    }


def _chart(chart_id: str, chart_type: str, title: str, data: list[dict[str, Any]], section: str, meta: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": chart_id,
        "type": chart_type,
        "title": title,
        "section": section,
        "description": meta["whyUseful"],
        "selectionReason": meta["reason"],
        "sourceColumns": meta["sourceColumns"],
        "formula": meta["formula"],
        "confidence": meta["confidence"],
        "whyUseful": meta["whyUseful"],
        "data": data,
    }


def _semantics(schema: dict[str, Any]) -> list[dict[str, Any]]:
    primary = schema.get("primaryTable")
    table = next((item for item in schema.get("tables", []) if item.get("name") == primary), None)
    return list((table or {}).get("columns", []))


def _column_map(schema: dict[str, Any]) -> dict[str, dict[str, Any]]:
    return {column["name"]: column for column in _semantics(schema)}


def _skip_reason(column: dict[str, Any]) -> str | None:
    if column.get("is_id") or column.get("isIdentifier"):
        return "ID column"
    if column.get("semanticType") in {"email", "phone"}:
        return "contact identifier"
    if column.get("is_encoded_category"):
        return "encoded category"
    if column.get("semanticType") == "free_text" and column.get("uniqueRate", 0) > 0.7:
        return "text identifier or high-cardinality text"
    if column.get("uniqueRate", 0) > 0.95 and not column.get("isMeasure") and not column.get("is_time"):
        return "too many unique values"
    if column.get("missingRate", 0) > 0.8:
        return "insufficient non-null values"
    if not (column.get("isMeasure") or column.get("isDimension") or column.get("is_time") or column.get("is_text")):
        return "not analytically meaningful"
    return None


def _valid_measures(columns: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return sorted(
        [
            column for column in columns
            if column.get("isMeasure")
            and not column.get("isIdentifier")
            and not column.get("is_encoded_category")
            and column.get("semanticType") not in {"latitude", "longitude", "ordinal"}
            and column.get("importance_score", 0) >= 0.5
        ],
        key=lambda item: (
            item.get("importance_score", 0),
            1 if item.get("isAdditive") else 0,
            1 if item.get("semanticType") == "currency" else 0,
        ),
        reverse=True,
    )


def _valid_dimensions(columns: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return sorted(
        [
            column for column in columns
            if column.get("isDimension")
            and not column.get("isIdentifier")
            and not column.get("is_encoded_category")
            and 1 < int(column.get("uniqueCount") or 0) <= 60
            and column.get("missingRate", 1) < 0.65
        ],
        key=lambda item: (item.get("importance_score", 0), -abs(int(item.get("uniqueCount") or 0) - 8)),
        reverse=True,
    )


def _target_column(columns: list[dict[str, Any]], roles: dict[str, str]) -> dict[str, Any] | None:
    if roles.get("target"):
        return next((column for column in columns if column["name"] == roles["target"]), None)
    candidates = [
        column for column in columns
        if column.get("is_target")
        and not column.get("isIdentifier")
        and int(column.get("uniqueCount") or 0) <= 25
    ]
    return sorted(candidates, key=lambda item: item.get("importance_score", 0), reverse=True)[0] if candidates else None


def _positive_value(series: pd.Series) -> str | None:
    values = series.astype(str).str.strip()
    values = values[values != ""]
    if values.empty or values.nunique() != 2:
        return None
    normalized = {str(value).strip().lower(): str(value).strip() for value in values.unique()}
    for key in ["1", "true", "yes", "y", "positive", "success", "pass", "won"]:
        if key in normalized:
            return normalized[key]
    counts = values.value_counts()
    return str(counts.index[-1])


def _target_distribution(df: pd.DataFrame, target: str) -> list[dict[str, Any]]:
    counts = df[target].astype(str).str.strip().replace("", "Unknown").value_counts().head(20)
    total = max(int(counts.sum()), 1)
    return [{"name": str(name), "value": int(count), "count": int(count), "share": round(count / total * 100, 2)} for name, count in counts.items()]


def _target_rate_by_dimension(df: pd.DataFrame, target: str, dimension: str, positive: str, limit: int = 12) -> list[dict[str, Any]]:
    working = pd.DataFrame({
        "group": df[dimension].astype(str).str.strip().replace("", "Unknown"),
        "target": df[target].astype(str).str.strip(),
    })
    working["positive"] = working["target"].eq(str(positive))
    grouped = working.groupby("group").agg(rate=("positive", "mean"), count=("positive", "size")).reset_index()
    grouped = grouped[grouped["count"] >= max(3, len(df) * 0.01)]
    grouped = grouped.sort_values("rate", ascending=False).head(limit)
    return [{"name": str(row["group"]), "value": round(float(row["rate"]) * 100, 2), "rate": round(float(row["rate"]) * 100, 2), "count": int(row["count"])} for _, row in grouped.iterrows()]


def _measure_by_dimension(df: pd.DataFrame, dimension: str, measure: str, semantic: dict[str, Any], limit: int = 12) -> list[dict[str, Any]]:
    values = clean_numeric(df[measure])
    working = pd.DataFrame({"group": df[dimension].astype(str).str.strip().replace("", "Unknown"), "value": values}).dropna()
    if working.empty:
        return []
    agg = "sum" if semantic.get("isAdditive") else "mean"
    grouped = working.groupby("group")["value"].sum() if agg == "sum" else working.groupby("group")["value"].mean()
    return [{"name": str(name), "value": float(value), "rawValue": float(value), "aggregation": agg} for name, value in grouped.sort_values(ascending=False).head(limit).items()]


def _count_by_dimension(df: pd.DataFrame, dimension: str, limit: int = 12) -> list[dict[str, Any]]:
    counts = df[dimension].astype(str).str.strip().replace("", "Unknown").value_counts().head(limit)
    return [{"name": str(name), "value": int(count), "count": int(count)} for name, count in counts.items()]


def _histogram(df: pd.DataFrame, measure: str) -> list[dict[str, Any]]:
    values = clean_numeric(df[measure]).dropna()
    if len(values) < 5:
        return []
    counts = pd.cut(values, bins=min(12, max(4, int(len(values) ** 0.5))), duplicates="drop").value_counts().sort_index()
    return [{"name": str(interval), "value": int(count), "count": int(count)} for interval, count in counts.items()]


def _trend(df: pd.DataFrame, date_col: str, measure_col: str, semantic: dict[str, Any]) -> list[dict[str, Any]]:
    dates = clean_datetime(df[date_col])
    values = clean_numeric(df[measure_col])
    working = pd.DataFrame({"date": dates, "value": values}).dropna()
    if working.empty:
        return []
    working["period"] = working["date"].dt.to_period("M").astype(str)
    agg = "sum" if semantic.get("isAdditive") else "mean"
    grouped = working.groupby("period")["value"].sum() if agg == "sum" else working.groupby("period")["value"].mean()
    return [{"name": str(period), "month": str(period), "value": float(value), "aggregation": agg} for period, value in grouped.sort_index().items()]


def _text_patterns(df: pd.DataFrame, column: str, limit: int = 12) -> list[dict[str, Any]]:
    words: dict[str, int] = {}
    stop = {"the", "and", "for", "with", "this", "that", "from", "have", "has", "hai", "aur", "not", "are"}
    for value in df[column].dropna().astype(str).head(2000):
        for word in re.findall(r"[A-Za-z][A-Za-z0-9_]{2,}", value.lower()):
            if word not in stop:
                words[word] = words.get(word, 0) + 1
    return [{"name": word, "value": count, "count": count} for word, count in sorted(words.items(), key=lambda item: item[1], reverse=True)[:limit]]


def _missing_chart(profile: dict[str, Any]) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for table in profile.get("tableProfiles", []):
        for item in table.get("missingValuesByColumn", []):
            if item.get("missing", 0) > 0:
                rows.append({"name": item["column"], "value": item["missing"], "missingRate": item["missingRate"]})
    return sorted(rows, key=lambda item: item["value"], reverse=True)[:20]


def _outlier_chart(anomaly_result: dict[str, Any]) -> list[dict[str, Any]]:
    return [
        {"name": item["column"], "value": item["totalOutliers"], "severity": item["severity"]}
        for item in anomaly_result.get("outlierSummary", [])
        if item.get("totalOutliers", 0) > 0
    ][:20]


def _strongest_segment_gap(df: pd.DataFrame, dimension: str, measure: str, semantic: dict[str, Any]) -> dict[str, Any] | None:
    rows = _measure_by_dimension(df, dimension, measure, semantic, 50)
    if len(rows) < 2:
        return None
    top, bottom = rows[0], rows[-1]
    return {
        "top": top["name"],
        "bottom": bottom["name"],
        "topValue": top["rawValue"],
        "bottomValue": bottom["rawValue"],
        "gap": top["rawValue"] - bottom["rawValue"],
        "aggregation": top.get("aggregation", "mean"),
    }


def build_dashboard_plan(
    parsed: dict[str, Any],
    schema: dict[str, Any],
    profile: dict[str, Any],
    stats: dict[str, Any],
    anomaly_result: dict[str, Any],
) -> dict[str, Any]:
    primary = next(table for table in parsed["tables"] if table.name == schema["primaryTable"])
    df = primary.dataframe
    columns = _semantics(schema)
    column_by_name = _column_map(schema)
    roles = schema.get("columnRoles", {})
    measures = _valid_measures(columns)
    dimensions = _valid_dimensions(columns)
    target = _target_column(columns, roles)
    date_col = roles.get("date")
    primary_measure = column_by_name.get(roles.get("metric") or (measures[0]["name"] if measures else ""), {})
    primary_measure_name = primary_measure.get("name")
    primary_dimension_name = dimensions[0]["name"] if dimensions else None

    overview_cards = [
        _card("Total Records", len(df), _format_number(len(df), 0), "Rows available for analysis.", _plan_meta("Required dataset scale card.", [], "COUNT(*)", "Shows the sample size behind every result.")),
        _card("Total Columns", len(df.columns), _format_number(len(df.columns), 0), "Fields detected in the primary table.", _plan_meta("Required dataset structure card.", [], "COUNT(columns)", "Shows the feature width available for analysis.")),
        _card("Data Completeness", profile["overall"]["completeness"], f"{profile['overall']['completeness']}%", "Percentage of non-missing cells.", _plan_meta("Required data-health card.", [], "1 - missing_cells / total_cells", "Indicates whether the dataset is complete enough for reliable analysis.")),
        _card("Duplicate Rows", profile["overall"].get("duplicatesCount", profile["overall"].get("duplicateRows", 0)), _format_number(profile["overall"].get("duplicatesCount", profile["overall"].get("duplicateRows", 0)), 0), "Exact duplicate records detected.", _plan_meta("Required data-quality card.", [], "COUNT(duplicated rows)", "Duplicate rows can inflate totals and distort analysis.")),
    ]
    if target:
        overview_cards.append(_card("Main Target", target["name"], target["name"], "Detected outcome or label column.", _plan_meta("Target-like column detected.", [target["name"]], "semantic target detection", "Focuses the dashboard on explaining the outcome.")))
    elif primary_dimension_name:
        overview_cards.append(_card("Main Entity", primary_dimension_name, primary_dimension_name, "Most useful categorical entity detected.", _plan_meta("High-importance dimension detected.", [primary_dimension_name], "highest dimension importance_score", "Gives the dashboard a primary segmentation lens.")))

    story_cards: list[dict[str, Any]] = []
    charts: list[dict[str, Any]] = []
    sections: list[dict[str, Any]] = []
    insights: list[dict[str, Any]] = []
    hidden_patterns: list[dict[str, Any]] = []

    if target and target["name"] in df.columns:
        target_name = target["name"]
        target_data = _target_distribution(df, target_name)
        if target_data:
            sections.append({"id": "target_analysis", "title": "Outcome / Target Analysis", "reason": "A target-like column was detected.", "sourceColumns": [target_name]})
            charts.append(_chart(
                "target_distribution",
                "bar",
                f"{target_name} Distribution",
                target_data,
                "Outcome/Target Analysis",
                _plan_meta("Target column distribution explains outcome balance.", [target_name], f"COUNT_BY({target_name})", "Shows whether the outcome is balanced or dominated by one class."),
            ))
            if len(target_data) == 2:
                positive = _positive_value(df[target_name])
                if positive is not None:
                    positive_count = int((df[target_name].astype(str).str.strip() == positive).sum())
                    rate = positive_count / max(len(df), 1) * 100
                    story_cards.append(_card(
                        "Positive Outcome Rate",
                        rate,
                        f"{rate:.2f}%",
                        f"Share of records where {target_name} equals {positive}.",
                        _plan_meta("Binary target supports rate analysis.", [target_name], f"COUNT({target_name}={positive}) / COUNT(*)", "More useful than averaging a binary flag."),
                        "story",
                    ))
                    for dimension in dimensions[:3]:
                        rate_data = _target_rate_by_dimension(df, target_name, dimension["name"], positive)
                        if rate_data:
                            charts.append(_chart(
                                f"target_rate_by_{_safe_id(dimension['name'])}",
                                "bar",
                                f"Positive Outcome Rate by {dimension['name']}",
                                rate_data,
                                "Outcome/Target Analysis",
                                _plan_meta("Dimension has enough groups to compare target rate.", [target_name, dimension["name"]], f"AVG({target_name} == {positive}) GROUP BY {dimension['name']}", "Identifies best/worst groups for the target outcome."),
                            ))
                            best, worst = rate_data[0], rate_data[-1]
                            insights.append({
                                "priority": 92,
                                "type": "highest_risk_segment",
                                "observation": f"{best['name']} has the highest positive outcome rate at {best['rate']}%.",
                                "evidence": f"Compared {target_name} rate across {dimension['name']} using {len(rate_data)} groups.",
                                "impact": "This segment is the strongest target differentiator currently detected.",
                                "confidence": "High" if best["count"] >= 30 else "Medium",
                                "recommendation": f"Review records in {dimension['name']} = {best['name']} and compare against {worst['name']}.",
                            })
                            break

    if primary_measure_name and primary_measure.get("isAdditive") and primary_measure_name in df.columns:
        values = clean_numeric(df[primary_measure_name]).dropna()
        if not values.empty:
            total = float(values.sum())
            story_cards.append(_card(
                f"Total {primary_measure_name}" if not primary_measure_name.lower().startswith("total ") else primary_measure_name,
                total,
                _format_value(total, primary_measure),
                f"Total of the highest-priority additive measure: {primary_measure_name}.",
                _plan_meta(
                    "Primary measure is additive and important enough for one promoted card.",
                    [primary_measure_name],
                    f"SUM({primary_measure_name})",
                    "Shows the main quantitative scale without promoting every numeric column.",
                ),
                "story",
            ))

    if date_col and primary_measure_name and date_col in df.columns and primary_measure_name in df.columns:
        trend_data = _trend(df, date_col, primary_measure_name, primary_measure)
        if len(trend_data) >= 2:
            sections.append({"id": "trend_analysis", "title": "Trend Analysis", "reason": "A date column and a valid measure were detected.", "sourceColumns": [date_col, primary_measure_name]})
            charts.append(_chart(
                "trend_primary_measure",
                "line",
                f"{primary_measure_name} Trend",
                trend_data,
                "Trend Analysis",
                _plan_meta("Date and measure columns support a time-series trend.", [date_col, primary_measure_name], f"{'SUM' if primary_measure.get('isAdditive') else 'AVG'}({primary_measure_name}) BY MONTH({date_col})", "Reveals time-based changes instead of static averages."),
            ))
            first, last = trend_data[0]["value"], trend_data[-1]["value"]
            if first:
                change = (last - first) / abs(first) * 100
                insights.append({
                    "priority": 85,
                    "type": "strongest_trend",
                    "observation": f"{primary_measure_name} changed by {change:.1f}% from first to last period.",
                    "evidence": f"First period {trend_data[0]['name']}={_format_value(first, primary_measure)}, last period {trend_data[-1]['name']}={_format_value(last, primary_measure)}.",
                    "impact": "This is the clearest detected time movement.",
                    "confidence": "High" if len(trend_data) >= 6 else "Medium",
                    "recommendation": "Investigate the periods with the largest movement before making operational decisions.",
                })

    if primary_dimension_name:
        sections.append({"id": "segment_comparison", "title": "Segment Comparison", "reason": "A useful categorical dimension was detected.", "sourceColumns": [primary_dimension_name]})
        if primary_measure_name:
            segment_data = _measure_by_dimension(df, primary_dimension_name, primary_measure_name, primary_measure)
            if segment_data:
                charts.append(_chart(
                    f"{_safe_id(primary_measure_name)}_by_{_safe_id(primary_dimension_name)}",
                    "bar",
                    f"{primary_measure_name} by {primary_dimension_name}",
                    segment_data,
                    "Segment Comparison",
                    _plan_meta("Measure and dimension support a meaningful grouped comparison.", [primary_measure_name, primary_dimension_name], f"{'SUM' if primary_measure.get('isAdditive') else 'AVG'}({primary_measure_name}) GROUP BY {primary_dimension_name}", "Shows which groups lead or lag on the selected measure."),
                ))
                gap = _strongest_segment_gap(df, primary_dimension_name, primary_measure_name, primary_measure)
                if gap:
                    story_cards.append(_card(
                        "Largest Segment Gap",
                        gap["gap"],
                        _format_value(gap["gap"], primary_measure),
                        f"{gap['top']} vs {gap['bottom']} on {primary_measure_name}.",
                        _plan_meta("Segment comparison found a measurable spread.", [primary_dimension_name, primary_measure_name], f"MAX_GROUP - MIN_GROUP of {primary_measure_name}", "Highlights the biggest difference worth investigating."),
                        "story",
                    ))
                    hidden_patterns.append({
                        "priority": 88,
                        "type": "biggest_segment_difference",
                        "observation": f"{gap['top']} is highest and {gap['bottom']} is lowest for {primary_measure_name}.",
                        "evidence": f"Gap is {_format_value(gap['gap'], primary_measure)} using {gap['aggregation']} aggregation.",
                        "impact": "This segment difference is more actionable than a table-wide average.",
                        "confidence": "High",
                        "recommendation": f"Compare drivers inside {gap['top']} and {gap['bottom']}.",
                    })
        else:
            count_data = _count_by_dimension(df, primary_dimension_name)
            charts.append(_chart(
                f"count_by_{_safe_id(primary_dimension_name)}",
                "bar",
                f"Record Count by {primary_dimension_name}",
                count_data,
                "Segment Comparison",
                _plan_meta("No valid measure found, so frequency is the safest comparison.", [primary_dimension_name], f"COUNT(*) GROUP BY {primary_dimension_name}", "Shows dominant and rare groups without inventing a metric."),
            ))

    for dimension in dimensions[1:3]:
        if not primary_measure_name:
            data = _count_by_dimension(df, dimension["name"])
            formula = f"COUNT(*) GROUP BY {dimension['name']}"
            title = f"Record Count by {dimension['name']}"
            source_columns = [dimension["name"]]
        else:
            data = _measure_by_dimension(df, dimension["name"], primary_measure_name, primary_measure)
            formula = f"{'SUM' if primary_measure.get('isAdditive') else 'AVG'}({primary_measure_name}) GROUP BY {dimension['name']}"
            title = f"{primary_measure_name} by {dimension['name']}"
            source_columns = [primary_measure_name, dimension["name"]]
        if data:
            charts.append(_chart(
                f"segment_{_safe_id(dimension['name'])}",
                "bar",
                title,
                data,
                "Segment Comparison",
                _plan_meta("Additional high-importance dimension supports another segment view.", source_columns, formula, "Adds a different segmentation lens so dashboards do not collapse to one generic view."),
            ))

    for measure in measures[:2]:
        data = _histogram(df, measure["name"])
        if data:
            sections.append({"id": "distribution_analysis", "title": "Distribution Analysis", "reason": "Valid continuous measures were detected.", "sourceColumns": [measure["name"]]})
            charts.append(_chart(
                f"distribution_{_safe_id(measure['name'])}",
                "histogram",
                f"{measure['name']} Distribution",
                data,
                "Distribution Analysis",
                _plan_meta("A valid continuous measure supports distribution analysis.", [measure["name"]], f"HISTOGRAM({measure['name']})", "Shows skew, spread, and unusual concentration better than average/median cards."),
            ))

    correlations = stats.get("correlationAnalysis", {})
    if correlations.get("matrix") and correlations.get("pairs"):
        sections.append({"id": "relationship_analysis", "title": "Relationship / Correlation Analysis", "reason": "At least two valid measures have meaningful correlation.", "sourceColumns": []})
        charts.append(_chart(
            "correlation_heatmap",
            "heatmap",
            "Correlation Heatmap",
            correlations["matrix"],
            "Relationship / Correlation Analysis",
            _plan_meta("Multiple numeric measures support relationship analysis.", [], "CORR(valid numeric measures)", "Highlights relationships that may explain the dataset story."),
        ))
        strongest = correlations["pairs"][0]
        insights.append({
            "priority": 95,
            "type": "strongest_relationship",
            "observation": f"{strongest['x']} and {strongest['y']} have the strongest detected relationship.",
            "evidence": f"Correlation r={strongest['correlation']} ({strongest['direction']}, {strongest['strength']}).",
            "impact": "This relationship is a better analytical lead than broad descriptive cards.",
            "confidence": strongest.get("confidence", "Medium"),
            "recommendation": "Validate whether this relationship is expected, causal, or caused by shared calculation logic.",
        })

    missing_data = _missing_chart(profile)
    if missing_data:
        sections.append({"id": "missing_value_analysis", "title": "Missing Value Analysis", "reason": "Missing values were detected.", "sourceColumns": [row["name"] for row in missing_data[:5]]})
        charts.append(_chart("missing_values", "bar", "Missing Values by Column", missing_data, "Missing Value Analysis", _plan_meta("Dirty-data issue detected.", [row["name"] for row in missing_data[:5]], "COUNT_MISSING(column)", "Prioritizes columns that may reduce analysis reliability.")))
        worst = missing_data[0]
        insights.append({
            "priority": 90,
            "type": "largest_missing_value_problem",
            "observation": f"{worst['name']} has the largest missing value issue.",
            "evidence": f"{worst['value']} missing values ({float(worst['missingRate']) * 100:.2f}%).",
            "impact": "Analyses using this column may be biased or incomplete.",
            "confidence": "High",
            "recommendation": f"Fix or explain missing values in {worst['name']} before relying on related insights.",
        })

    outlier_data = _outlier_chart(anomaly_result)
    if outlier_data:
        sections.append({"id": "outlier_analysis", "title": "Outlier Analysis", "reason": "Statistical outliers were detected.", "sourceColumns": [row["name"] for row in outlier_data[:5]]})
        charts.append(_chart("outlier_summary", "bar", "Outliers by Column", outlier_data, "Outlier Analysis", _plan_meta("Extreme values were detected by the profiler.", [row["name"] for row in outlier_data[:5]], "IQR / robust outlier rules", "Shows where unusual values may distort summaries.")))
        worst = outlier_data[0]
        insights.append({
            "priority": 86,
            "type": "most_extreme_outlier_group",
            "observation": f"{worst['name']} has the most detected outliers.",
            "evidence": f"{worst['value']} outlier rows flagged.",
            "impact": "This column can heavily affect totals, averages, and ranking views.",
            "confidence": "High",
            "recommendation": f"Review detailed rows for {worst['name']} before final reporting.",
        })

    text_columns = [column for column in columns if column.get("semanticType") == "free_text" and column.get("importance_score", 0) >= 0.2]
    for text_col in text_columns[:1]:
        data = _text_patterns(df, text_col["name"])
        if data:
            sections.append({"id": "text_pattern_analysis", "title": "Text Pattern Analysis", "reason": "A free-text column with analyzable tokens was detected.", "sourceColumns": [text_col["name"]]})
            charts.append(_chart(
                f"text_terms_{_safe_id(text_col['name'])}",
                "bar",
                f"Common Terms in {text_col['name']}",
                data,
                "Text Pattern Analysis",
                _plan_meta("Free-text values support lightweight token frequency analysis.", [text_col["name"]], f"TOKEN_COUNT({text_col['name']})", "Surfaces repeated language patterns without inventing categories."),
            ))

    skipped_columns = [
        {
            "column": column["name"],
            "semantic_type": column.get("semanticType"),
            "analytical_role": column.get("analytical_role"),
            "importance_score": column.get("importance_score"),
            "reason": reason,
        }
        for column in columns
        if (reason := _skip_reason(column))
    ]

    insight_pool = sorted(insights + hidden_patterns, key=lambda item: item.get("priority", 0), reverse=True)
    compact_insights = insight_pool[:8]

    return {
        "overview_cards": overview_cards[:5],
        "story_cards": story_cards[:3],
        "main_story_sections": _dedupe_sections(sections),
        "charts": charts[:12],
        "insights": compact_insights,
        "hidden_patterns": hidden_patterns[:8],
        "skipped_columns": skipped_columns,
        "selected_columns": {
            "target": target["name"] if target else None,
            "primary_measure": primary_measure_name,
            "primary_dimension": primary_dimension_name,
            "date": date_col,
            "measures": [column["name"] for column in measures[:8]],
            "dimensions": [column["name"] for column in dimensions[:8]],
        },
    }


def _dedupe_sections(sections: list[dict[str, Any]]) -> list[dict[str, Any]]:
    seen: set[str] = set()
    output: list[dict[str, Any]] = []
    for section in sections:
        if section["id"] in seen:
            continue
        seen.add(section["id"])
        output.append(section)
    return output
