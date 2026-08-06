from __future__ import annotations

from typing import Any

from .chart_planner import build_chart_plan


def build_charts(
    parsed: dict[str, Any],
    schema: dict[str, Any],
    profile: dict[str, Any],
    metric_result: dict[str, Any],
    anomaly_result: dict[str, Any],
) -> dict[str, Any]:
    return build_chart_plan(parsed, schema, profile, metric_result, anomaly_result)
