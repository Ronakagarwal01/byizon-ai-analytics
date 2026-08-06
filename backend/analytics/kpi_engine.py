from __future__ import annotations

from typing import Any

import pandas as pd

from .data_profiler import clean_datetime, clean_numeric


def format_number(value: float | int | None, decimals: int = 2) -> str:
    if value is None:
        return "N/A"
    number = float(value)
    if abs(number - round(number)) < 0.000001:
        return f"{int(round(number)):,}"
    return f"{number:,.{decimals}f}"


def format_currency(value: float | int | None) -> str:
    if value is None:
        return "N/A"
    number = float(value)
    sign = "-" if number < 0 else ""
    abs_value = abs(number)
    if abs_value >= 10_000_000:
        return f"{sign}Rs {(abs_value / 10_000_000):.2f} crore"
    if abs_value >= 100_000:
        return f"{sign}Rs {(abs_value / 100_000):.2f} lakh"
    return f"{sign}Rs {abs_value:,.2f}"


def _clean_label(column: str | None) -> str:
    return str(column or "Metric").strip()


def _is_currency_metric(domain: str, column: str | None) -> bool:
    clean = str(column or "").lower()
    if any(token in clean for token in ["sales", "revenue", "amount", "cost", "profit", "price", "expense", "spend", "income", "payment"]):
        return True
    return domain in {"Sales", "Finance"} and any(token in clean for token in ["value", "total"])


def _metric_label(domain: str, column: str | None) -> str:
    clean = str(column or "").lower()
    if domain == "Sales" and any(token in clean for token in ["sales", "revenue", "amount", "value"]):
        return "Sales"
    if domain == "Finance" and any(token in clean for token in ["amount", "revenue", "income", "expense", "cost"]):
        return "Amount"
    return _clean_label(column)


def _format_metric(value: float | int | None, is_currency: bool) -> str:
    return format_currency(value) if is_currency else format_number(value)


def _first_existing(roles: dict[str, str], *role_names: str) -> str | None:
    for role in role_names:
        if roles.get(role):
            return roles[role]
    return None


def _sum(df: pd.DataFrame, column: str | None) -> float | None:
    if not column or column not in df.columns:
        return None
    return float(clean_numeric(df[column]).fillna(0).sum())


def _mean(df: pd.DataFrame, column: str | None) -> float | None:
    if not column or column not in df.columns:
        return None
    values = clean_numeric(df[column]).dropna()
    return float(values.mean()) if not values.empty else None


def _kpi(label: str, raw: float | int | None, value: str, desc: str, formula: str, source: str | None) -> dict[str, Any]:
    return {
        "id": label.lower().replace(" ", "_").replace("%", "pct"),
        "label": label,
        "rawValue": raw,
        "value": value,
        "desc": desc,
        "trend": "neutral",
        "trendValue": "N/A",
        "explainability": {
            "formula": formula,
            "sourceColumn": source or "Whole table",
            "confidence": "100% deterministic",
        },
    }


def group_sum(df: pd.DataFrame, dimension: str | None, metric: str | None, limit: int = 10, is_currency: bool = True) -> list[dict[str, Any]]:
    if not dimension or not metric or dimension not in df.columns or metric not in df.columns:
        return []
    working = pd.DataFrame({
        "name": df[dimension].astype(str).replace("", "Unknown"),
        "value": clean_numeric(df[metric]).fillna(0),
    })
    grouped = working.groupby("name", dropna=False)["value"].sum().sort_values(ascending=False).head(limit)
    return [
        {
            "name": str(name),
            "rawValue": float(value),
            "value": _format_metric(float(value), is_currency),
            "rank": index + 1,
        }
        for index, (name, value) in enumerate(grouped.items())
    ]


def group_count(df: pd.DataFrame, dimension: str | None, limit: int = 10) -> list[dict[str, Any]]:
    if not dimension or dimension not in df.columns:
        return []
    counts = df[dimension].astype(str).replace("", "Unknown").value_counts().head(limit)
    return [
        {"name": str(name), "count": int(count), "rank": index + 1}
        for index, (name, count) in enumerate(counts.items())
    ]


def group_sales_profit(df: pd.DataFrame, dimension: str | None, sales: str | None, profit: str | None, limit: int = 10) -> list[dict[str, Any]]:
    if not dimension or not sales or dimension not in df.columns or sales not in df.columns:
        return []
    working = pd.DataFrame({
        "name": df[dimension].astype(str).replace("", "Unknown"),
        "sales": clean_numeric(df[sales]).fillna(0),
        "profit": clean_numeric(df[profit]).fillna(0) if profit and profit in df.columns else 0,
    })
    grouped = working.groupby("name", dropna=False)[["sales", "profit"]].sum()
    grouped = grouped.sort_values("sales", ascending=False).head(limit)
    rows = []
    for index, (name, row) in enumerate(grouped.iterrows()):
        sales_raw = float(row["sales"])
        profit_raw = float(row["profit"])
        margin = (profit_raw / sales_raw * 100) if sales_raw else None
        rows.append({
            "name": str(name),
            "salesRaw": sales_raw,
            "profitRaw": profit_raw,
            "margin": margin,
            "sales": format_currency(sales_raw),
            "profit": format_currency(profit_raw) if profit else "N/A",
            "marginFormatted": "N/A" if margin is None or not profit else f"{margin:.1f}%",
            "rank": index + 1,
        })
    return rows


def build_trend(df: pd.DataFrame, date_col: str | None, metric_col: str | None) -> list[dict[str, Any]]:
    if not date_col or not metric_col or date_col not in df.columns or metric_col not in df.columns:
        return []
    dates = clean_datetime(df[date_col])
    values = clean_numeric(df[metric_col])
    working = pd.DataFrame({"date": dates, "value": values}).dropna()
    if working.empty:
        return []
    working["period"] = working["date"].dt.to_period("M").astype(str)
    grouped = working.groupby("period")["value"].sum().sort_index()
    return [
        {"month": str(period), "name": str(period), "revenue": float(value), "value": float(value)}
        for period, value in grouped.items()
    ]


def summary_statistics(df: pd.DataFrame, profile: dict[str, Any]) -> list[dict[str, Any]]:
    rows = []
    for column in profile["columns"]:
        if column["detectedType"] == "numeric" and column["numericStats"]:
            stats = column["numericStats"]
            rows.append({
                "column": column["name"],
                "count": stats["count"],
                "sum": stats["sum"],
                "mean": stats["mean"],
                "median": stats["median"],
                "min": stats["min"],
                "max": stats["max"],
                "std": stats["std"],
            })
    return rows


def correlation_analysis(df: pd.DataFrame, profile: dict[str, Any]) -> dict[str, Any]:
    numeric_columns = [col["name"] for col in profile["columns"] if col["detectedType"] == "numeric"]
    if len(numeric_columns) < 2:
        return {"pairs": [], "matrix": []}
    numeric_df = pd.DataFrame({col: clean_numeric(df[col]) for col in numeric_columns}).dropna(axis=1, how="all")
    corr = numeric_df.corr(numeric_only=True).fillna(0)
    pairs = []
    for left in corr.columns:
        for right in corr.columns:
            if left >= right:
                continue
            value = float(corr.loc[left, right])
            if abs(value) >= 0.55:
                pairs.append({"x": left, "y": right, "correlation": round(value, 3)})
    pairs.sort(key=lambda item: abs(item["correlation"]), reverse=True)
    matrix = [
        {"x": left, "y": right, "value": round(float(corr.loc[left, right]), 3)}
        for left in corr.columns
        for right in corr.columns
    ]
    return {"pairs": pairs[:15], "matrix": matrix}


def distribution_analysis(df: pd.DataFrame, profile: dict[str, Any]) -> list[dict[str, Any]]:
    distributions = []
    for column in profile["columns"]:
        if column["detectedType"] != "numeric":
            continue
        values = clean_numeric(df[column["name"]]).dropna()
        if len(values) < 5:
            continue
        counts, edges = pd.cut(values, bins=min(10, max(3, len(values) // 10)), retbins=True, duplicates="drop")
        histogram = counts.value_counts().sort_index()
        distributions.append({
            "column": column["name"],
            "bins": [
                {"name": str(interval), "count": int(count)}
                for interval, count in histogram.items()
            ],
            "skew": float(values.skew()) if len(values) > 2 else 0,
        })
    return distributions[:6]


def advanced_possible_analyses(df: pd.DataFrame, roles: dict[str, str]) -> dict[str, Any]:
    status = roles.get("status")
    customer = roles.get("customer")
    date = roles.get("date")
    analyses: dict[str, Any] = {
        "cohortRetention": None,
        "funnel": None,
        "slaPerformance": None,
    }
    if customer and date and customer in df.columns and date in df.columns:
        dates = clean_datetime(df[date])
        working = pd.DataFrame({"customer": df[customer].astype(str), "date": dates}).dropna()
        if not working.empty:
            first_month = working.groupby("customer")["date"].min().dt.to_period("M")
            activity = working.assign(month=working["date"].dt.to_period("M"))
            retention = []
            for cohort, customers in first_month.groupby(first_month):
                cohort_customers = set(customers.index)
                active = activity[activity["customer"].isin(cohort_customers)]["customer"].nunique()
                retention.append({
                    "cohort": str(cohort),
                    "customers": len(cohort_customers),
                    "activeCustomers": int(active),
                    "retentionRate": round(active / max(len(cohort_customers), 1) * 100, 1),
                })
            analyses["cohortRetention"] = retention[:12]
    if status and status in df.columns:
        counts = group_count(df, status, 12)
        analyses["funnel"] = counts
        if any("sla" in str(col).lower() for col in df.columns):
            analyses["slaPerformance"] = "SLA columns detected; inspect status/stage distribution and numeric duration KPIs."
    return analyses


def compute_kpis(parsed: dict[str, Any], schema: dict[str, Any], profile: dict[str, Any]) -> dict[str, Any]:
    primary_table_name = schema["primaryTable"]
    primary_table = next(table for table in parsed["tables"] if table.name == primary_table_name)
    df = primary_table.dataframe
    roles = schema["columnRoles"]
    primary_profile = next(item for item in profile["tableProfiles"] if item["name"] == primary_table_name)

    metric_col = _first_existing(roles, "metric")
    sales_col = metric_col
    domain = schema.get("businessDomain", "Generic")
    metric_is_currency = _is_currency_metric(domain, sales_col)
    metric_label = _metric_label(domain, sales_col)
    profit_col = _first_existing(roles, "profit")
    cost_col = _first_existing(roles, "cost")
    quantity_col = _first_existing(roles, "quantity")
    margin_col = _first_existing(roles, "margin")
    date_col = _first_existing(roles, "date")
    category_col = _first_existing(roles, "category")
    product_col = _first_existing(roles, "product")
    region_col = _first_existing(roles, "region")
    employee_col = _first_existing(roles, "employee")
    customer_col = _first_existing(roles, "customer")
    status_col = _first_existing(roles, "status")

    kpis: list[dict[str, Any]] = [
        _kpi("Total Records", len(df), format_number(len(df), 0), "Number of rows in the primary table.", "COUNT(*)", None),
    ]

    total_sales = _sum(df, sales_col)
    total_profit = _sum(df, profit_col)
    total_cost = _sum(df, cost_col)
    total_units = _sum(df, quantity_col)
    avg_margin = _mean(df, margin_col)
    if avg_margin is None and total_sales and profit_col:
        avg_margin = (total_profit or 0) / total_sales * 100
    elif avg_margin is not None and abs(avg_margin) <= 1:
        avg_margin *= 100

    if sales_col:
        total_label = "Total Sales" if metric_label == "Sales" else f"Total {metric_label}"
        average_label = "Average Sales" if metric_label == "Sales" else f"Average {metric_label}"
        kpis.append(_kpi(total_label, total_sales, _format_metric(total_sales, metric_is_currency), f"Total of the selected {metric_label} metric.", f"SUM({sales_col})", sales_col))
        avg_metric = _mean(df, sales_col)
        kpis.append(_kpi(average_label, avg_metric, _format_metric(avg_metric, metric_is_currency), f"Average {metric_label} value per row.", f"AVG({sales_col})", sales_col))
    if profit_col:
        kpis.append(_kpi("Total Profit", total_profit, format_currency(total_profit), "Total profit from the profit column.", f"SUM({profit_col})", profit_col))
    if cost_col:
        kpis.append(_kpi("Total Cost", total_cost, format_currency(total_cost), "Total cost/expense from the cost column.", f"SUM({cost_col})", cost_col))
    if avg_margin is not None:
        source = margin_col or f"{profit_col}/{sales_col}"
        kpis.append(_kpi("Average Profit Margin", avg_margin, f"{avg_margin:.1f}%", "Average or calculated profit margin.", f"AVG({source})", margin_col))
    if quantity_col:
        kpis.append(_kpi("Total Units Sold", total_units, format_number(total_units, 0), "Total units/quantity.", f"SUM({quantity_col})", quantity_col))
    if customer_col and customer_col in df.columns:
        unique_customers = int(df[customer_col].astype(str).nunique())
        kpis.append(_kpi("Unique Customers", unique_customers, format_number(unique_customers, 0), "Distinct customer count.", f"COUNT_DISTINCT({customer_col})", customer_col))
    if product_col and product_col in df.columns:
        unique_products = int(df[product_col].astype(str).nunique())
        kpis.append(_kpi("Unique Products", unique_products, format_number(unique_products, 0), "Distinct product count.", f"COUNT_DISTINCT({product_col})", product_col))

    trend = build_trend(df, date_col, sales_col)
    region_wise = group_sum(df, region_col, sales_col, 10, metric_is_currency)
    category_wise = group_sum(df, category_col, sales_col, 10, metric_is_currency)
    top_products = group_sum(df, product_col, sales_col, 10, metric_is_currency)
    top_reps = group_sum(df, employee_col, sales_col, 10, metric_is_currency)
    payment_modes = group_count(df, status_col, 10)
    if not payment_modes:
        payment_col = next((col for col in df.columns if "payment" in col.lower()), None)
        payment_modes = group_count(df, payment_col, 10)

    business_summary = {
        "salesLabel": metric_label if sales_col else "Metric",
        "columns": {
            "sales": sales_col,
            "profit": profit_col,
            "cost": cost_col,
            "margin": margin_col,
            "quantity": quantity_col,
            "region": region_col,
            "category": category_col,
            "product": product_col,
            "salesRep": employee_col,
            "customer": customer_col,
            "status": status_col,
        },
        "overall": {
            "totalSales": total_sales,
            "totalSalesFormatted": _format_metric(total_sales, metric_is_currency) if total_sales is not None else "N/A",
            "totalProfit": total_profit,
            "totalProfitFormatted": format_currency(total_profit) if total_profit is not None else "N/A",
            "totalCost": total_cost,
            "totalCostFormatted": format_currency(total_cost) if total_cost is not None else "N/A",
            "avgProfitMargin": avg_margin,
            "avgProfitMarginFormatted": f"{avg_margin:.1f}%" if avg_margin is not None else "N/A",
            "totalUnits": total_units,
            "totalUnitsFormatted": format_number(total_units, 0) if total_units is not None else "N/A",
        },
        "regionWise": region_wise,
        "categoryWise": category_wise,
        "topSalesReps": top_reps,
        "topProducts": top_products,
        "paymentModes": payment_modes,
        "regionProfitability": group_sales_profit(df, region_col, sales_col, profit_col, 10),
        "categoryProfitability": group_sales_profit(df, category_col, sales_col, profit_col, 10),
    }

    top_bottom = {
        "topCategories": category_wise[:5],
        "bottomCategories": list(reversed(category_wise[-5:])) if category_wise else [],
        "topProducts": top_products[:5],
        "bottomProducts": list(reversed(top_products[-5:])) if top_products else [],
        "topRegions": region_wise[:5],
        "bottomRegions": list(reversed(region_wise[-5:])) if region_wise else [],
    }

    return {
        "kpis": kpis,
        "businessSummary": business_summary,
        "trendData": trend,
        "summaryStats": summary_statistics(df, primary_profile),
        "correlationAnalysis": correlation_analysis(df, primary_profile),
        "distributionAnalysis": distribution_analysis(df, primary_profile),
        "topBottom": top_bottom,
        "advancedAnalyses": advanced_possible_analyses(df, roles),
        "primaryMetricColumn": sales_col,
        "primaryDateColumn": date_col,
    }
