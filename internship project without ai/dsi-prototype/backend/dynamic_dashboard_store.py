from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import secrets
import sqlite3
import time
import uuid
from contextlib import closing
from datetime import datetime, timezone
from typing import Any

import bcrypt


_DATA_DIR = os.getenv("BYIZON_DATA_DIR", "").strip() or os.path.join(os.path.dirname(__file__), "data")
_DB_PATH = os.path.join(_DATA_DIR, "dynamic_dashboards.sqlite3")
_ACCESS_SECONDS = 60 * 60
_MAX_FAILED_ATTEMPTS = 5
_ACCESS_SECRET_PATH = os.path.join(_DATA_DIR, "local_dashboard_access_key.bin")


class DashboardAccessError(ValueError):
    def __init__(self, message: str, status: int = 400):
        super().__init__(message)
        self.status = status


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _database() -> sqlite3.Connection:
    os.makedirs(_DATA_DIR, exist_ok=True)
    connection = sqlite3.connect(_DB_PATH)
    connection.row_factory = sqlite3.Row
    connection.execute(
        """
        CREATE TABLE IF NOT EXISTS generated_dashboards (
            dashboard_id TEXT PRIMARY KEY,
            parent_dashboard_id TEXT,
            user_id TEXT NOT NULL,
            source_session_id TEXT,
            source_file_name TEXT,
            title TEXT NOT NULL,
            description TEXT,
            dashboard_json TEXT NOT NULL,
            theme TEXT NOT NULL,
            password_hash BLOB NOT NULL,
            failed_attempts INTEGER NOT NULL DEFAULT 0,
            status TEXT NOT NULL DEFAULT 'active',
            version INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )
        """
    )
    connection.execute("CREATE INDEX IF NOT EXISTS idx_generated_dashboards_user ON generated_dashboards(user_id, created_at)")
    connection.execute("CREATE INDEX IF NOT EXISTS idx_generated_dashboards_parent ON generated_dashboards(parent_dashboard_id, version)")
    return connection


def _access_secret() -> bytes:
    configured = os.getenv("BYIZON_DASHBOARD_ACCESS_SECRET", "").encode("utf-8")
    if configured:
        return hashlib.sha256(configured).digest()
    os.makedirs(_DATA_DIR, exist_ok=True)
    if not os.path.isfile(_ACCESS_SECRET_PATH):
        with open(_ACCESS_SECRET_PATH, "wb") as handle:
            handle.write(os.urandom(32))
    with open(_ACCESS_SECRET_PATH, "rb") as handle:
        key = handle.read()
    if len(key) != 32:
        raise ValueError("Local dashboard access key is invalid.")
    return key


def _b64(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).rstrip(b"=").decode("ascii")


def _issue_access_token(dashboard_id: str) -> str:
    header = _b64(json.dumps({"alg": "HS256", "typ": "JWT"}, separators=(",", ":")).encode("utf-8"))
    payload = _b64(json.dumps({"dashboardId": dashboard_id, "exp": int(time.time()) + _ACCESS_SECONDS}, separators=(",", ":")).encode("utf-8"))
    signing_input = f"{header}.{payload}".encode("ascii")
    signature = _b64(hmac.new(_access_secret(), signing_input, hashlib.sha256).digest())
    return f"{header}.{payload}.{signature}"


def _verify_access_token(token: str) -> str:
    try:
        header, payload, signature = token.split(".")
        signing_input = f"{header}.{payload}".encode("ascii")
        expected = _b64(hmac.new(_access_secret(), signing_input, hashlib.sha256).digest())
        if not hmac.compare_digest(signature, expected):
            raise ValueError
        claims = json.loads(base64.urlsafe_b64decode(payload + "=" * (-len(payload) % 4)))
        if int(claims.get("exp", 0)) <= int(time.time()):
            raise ValueError
        return str(claims["dashboardId"])
    except (ValueError, KeyError, json.JSONDecodeError):
        raise DashboardAccessError("Dashboard access has expired. Enter the password again.", 401) from None


def _safe_id(value: str) -> str:
    cleaned = "".join(ch.lower() if ch.isalnum() else "_" for ch in str(value))
    return "_".join(part for part in cleaned.split("_") if part)[:64] or f"item_{uuid.uuid4().hex[:6]}"


def _text(value: Any, fallback: str = "") -> str:
    return str(value if value not in (None, "") else fallback)


def _chart_type(source_type: str, index: int = 0) -> str:
    normalized = (source_type or "").lower()
    if normalized in {"line", "bar", "pie", "area", "heatmap"}:
        return normalized
    if normalized in {"histogram", "scatter"}:
        return "bar"
    return ["bar", "line", "area", "pie"][index % 4]


def _chart_keys(data: list[dict[str, Any]]) -> tuple[str, str]:
    first = data[0] if data else {}
    keys = list(first.keys())
    x_key = next((key for key in keys if isinstance(first.get(key), str)), None) or (keys[0] if keys else "name")
    y_key = next((key for key in keys if key != x_key and isinstance(first.get(key), (int, float))), None) or "value"
    return x_key, y_key


def _filter_options(rows: list[dict[str, Any]], column: str) -> list[str]:
    values: list[str] = []
    seen: set[str] = set()
    for row in rows[:500]:
        value = str(row.get(column, "")).strip()
        if value and value not in seen:
            seen.add(value)
            values.append(value)
        if len(values) >= 40:
            break
    return values


def build_dashboard_json(analysis: dict[str, Any], *, variant: int = 1, prompt: str = "") -> dict[str, Any]:
    """Create a future-proof JSON dashboard contract.

    The AI/dashboard layer emits structured configuration only. No frontend source
    code is generated or executed for dashboard rendering.
    """
    plan = analysis.get("dashboardPlan") or analysis.get("dashboard_plan") or {}
    source_kpis = list(plan.get("overview_cards") or []) + list(plan.get("story_cards") or [])
    if not source_kpis:
        source_kpis = list(analysis.get("kpis") or [])
    source_charts = list(plan.get("charts") or analysis.get("charts") or [])
    rows = list(analysis.get("rows") or [])[:200]
    columns = list(analysis.get("columns") or [])[:40]
    semantic_columns = list(analysis.get("semanticColumns") or [])
    dimensions = [
        col.get("name") for col in semantic_columns
        if col.get("isDimension") and col.get("name") in columns and int(col.get("uniqueCount") or 0) <= 60
    ][:5]
    theme_name = "aurora-dark" if variant % 2 == 0 else "aurora-light"
    accent = ["#2563eb", "#7c3aed", "#0891b2", "#f97316"][variant % 4]

    widgets: list[dict[str, Any]] = []
    for index, kpi in enumerate(source_kpis[:8]):
        widgets.append({
            "id": f"kpi_{_safe_id(kpi.get('id') or kpi.get('label') or index)}",
            "type": "kpi",
            "title": _text(kpi.get("label"), "Metric"),
            "description": _text(kpi.get("desc") or kpi.get("whyUseful"), "Key metric from the uploaded dataset."),
            "layout": {"colSpan": 3, "rowSpan": 1, "order": index + 1},
            "data": {
                "value": kpi.get("formattedValue") or kpi.get("displayValue") or kpi.get("value") or kpi.get("rawValue") or "N/A",
                "rawValue": kpi.get("rawValue"),
                "trend": kpi.get("trend") or "neutral",
                "trendValue": kpi.get("trendValue") or "N/A",
            },
            "style": {"tone": ["primary", "success", "warning", "info"][index % 4]},
            "accessibility": {"label": f"{_text(kpi.get('label'), 'Metric')}: {kpi.get('value', 'N/A')}"},
        })

    chart_order = len(widgets) + 1
    selected_charts = source_charts[variant % max(len(source_charts), 1):] + source_charts[:variant % max(len(source_charts), 1)]
    for index, chart in enumerate(selected_charts[:8]):
        chart_data = [row for row in list(chart.get("data") or [])[:80] if isinstance(row, dict)]
        x_key, y_key = _chart_keys(chart_data)
        chart_kind = _chart_type(_text(chart.get("type")), index + variant)
        widgets.append({
            "id": f"chart_{_safe_id(chart.get('id') or chart.get('title') or index)}",
            "type": "chart",
            "title": _text(chart.get("title"), "Chart"),
            "description": _text(chart.get("description") or chart.get("whyUseful"), "Auto-selected visual insight."),
            "layout": {"colSpan": 6 if index < 2 else 4, "rowSpan": 3, "order": chart_order + index},
            "chart": {
                "type": chart_kind,
                "xKey": x_key,
                "yKey": y_key,
                "categoryKey": x_key,
                "valueKey": y_key,
                "showGrid": True,
                "showLegend": chart_kind in {"pie", "area"},
                "showTooltip": True,
                "colors": ["var(--dd-chart-1)", "var(--dd-chart-2)", "var(--dd-chart-3)", "var(--dd-chart-4)"],
            },
            "data": chart_data,
            "accessibility": {"label": _text(chart.get("title"), "Chart")},
        })

    if rows and columns:
        widgets.append({
            "id": "uploaded_data_table",
            "type": "table",
            "title": "Uploaded Data Preview",
            "description": "A safe preview of the uploaded dataset used to generate this dashboard.",
            "layout": {"colSpan": 12, "rowSpan": 4, "order": 90},
            "table": {
                "columns": [{"key": col, "label": col, "sortable": True, "filterable": col in dimensions} for col in columns[:12]],
                "pagination": {"enabled": True, "pageSize": 12},
                "stickyHeader": True,
            },
            "data": rows,
        })

    filters = [
        {"id": f"filter_{_safe_id(column)}", "type": "select", "label": column, "field": column, "options": _filter_options(rows, column)}
        for column in dimensions
    ]

    insights = [
        {
            "id": f"insight_{index + 1}",
            "title": _text(item.get("type") or item.get("title"), "Insight") if isinstance(item, dict) else "Insight",
            "body": _text(item.get("observation") or item.get("evidence") or item, "") if isinstance(item, dict) else _text(item),
            "priority": int(item.get("priority") or 50) if isinstance(item, dict) else 50,
        }
        for index, item in enumerate((analysis.get("insightObjects") or analysis.get("insights") or [])[:8])
    ]

    title = _text(plan.get("title") or f"{analysis.get('fileName', 'AI')} Dashboard")
    return {
        "schemaVersion": "1.0.0",
        "kind": "byizon.dynamic-dashboard",
        "dashboard": {
            "title": title,
            "description": _text(plan.get("subtitle") or analysis.get("businessSummary"), "AI-generated dashboard configuration rendered by the universal dashboard renderer."),
            "source": {
                "fileName": analysis.get("fileName"),
                "datasetId": analysis.get("datasetId"),
                "sessionId": analysis.get("sessionId"),
                "rowCount": analysis.get("rowCount"),
                "columnCount": analysis.get("colCount"),
            },
            "theme": {
                "name": theme_name,
                "mode": "dark" if theme_name.endswith("dark") else "light",
                "tokens": {
                    "primary": accent,
                    "secondary": "#14b8a6",
                    "success": "#22c55e",
                    "warning": "#f59e0b",
                    "error": "#ef4444",
                    "info": "#06b6d4",
                    "radius": "20px",
                    "spacing": "16px",
                    "fontFamily": "Inter, ui-sans-serif, system-ui, sans-serif",
                },
            },
            "layout": {
                "type": "responsive-grid",
                "columns": {"desktop": 12, "laptop": 12, "tablet": 6, "mobile": 1},
                "gap": 16,
                "density": "comfortable",
                "sections": [
                    {"id": "overview", "title": "Overview", "widgetIds": [w["id"] for w in widgets if w["type"] == "kpi"]},
                    {"id": "analytics", "title": "Analytics", "widgetIds": [w["id"] for w in widgets if w["type"] == "chart"]},
                    {"id": "data", "title": "Data", "widgetIds": [w["id"] for w in widgets if w["type"] == "table"]},
                ],
            },
            "filters": filters,
            "widgets": widgets,
            "insights": insights,
            "animations": {"enabled": True, "preset": "fade-up", "durationMs": 260},
            "responsive": {"breakpoints": {"mobile": 640, "tablet": 900, "laptop": 1200}},
            "accessibility": {"wcag": "AA", "keyboardNavigation": True, "chartSummaries": True},
        },
        "generation": {
            "mode": "json-only",
            "variant": variant,
            "prompt": prompt[:1000],
            "generatedAt": _utc_now(),
        },
    }


def _row_to_dashboard(row: sqlite3.Row, include_json: bool = False) -> dict[str, Any]:
    payload = {
        "dashboardId": row["dashboard_id"],
        "parentDashboardId": row["parent_dashboard_id"],
        "userId": row["user_id"],
        "sourceSessionId": row["source_session_id"],
        "sourceFileName": row["source_file_name"],
        "title": row["title"],
        "description": row["description"],
        "theme": row["theme"],
        "createdAt": row["created_at"],
        "updatedAt": row["updated_at"],
        "status": row["status"],
        "version": row["version"],
        "requiresPassword": True,
        "locked": row["failed_attempts"] >= _MAX_FAILED_ATTEMPTS,
    }
    if include_json:
        payload["dashboardJson"] = json.loads(row["dashboard_json"])
    return payload


def create_dashboard(
    analysis: dict[str, Any],
    user_id: str,
    *,
    password: str | None = None,
    prompt: str = "",
    parent_dashboard_id: str | None = None,
    version: int = 1,
) -> dict[str, Any]:
    if not isinstance(analysis, dict):
        raise ValueError("Dashboard analysis payload is required.")
    dashboard_id = uuid.uuid4().hex[:10]
    one_time_password = password or secrets.token_urlsafe(10)
    dashboard_json = build_dashboard_json(analysis, variant=version, prompt=prompt)
    dashboard = dashboard_json["dashboard"]
    now = _utc_now()
    password_hash = bcrypt.hashpw(one_time_password.encode("utf-8"), bcrypt.gensalt(rounds=12))
    with closing(_database()) as database, database:
        database.execute(
            """
            INSERT INTO generated_dashboards(
                dashboard_id, parent_dashboard_id, user_id, source_session_id, source_file_name,
                title, description, dashboard_json, theme, password_hash, failed_attempts,
                status, version, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 'active', ?, ?, ?)
            """,
            (
                dashboard_id,
                parent_dashboard_id,
                user_id,
                str(analysis.get("sessionId") or ""),
                str(analysis.get("fileName") or "Dashboard"),
                dashboard["title"],
                dashboard["description"],
                json.dumps(dashboard_json, ensure_ascii=False, separators=(",", ":")),
                dashboard["theme"]["mode"],
                password_hash,
                version,
                now,
                now,
            ),
        )
    return {
        "dashboardId": dashboard_id,
        "password": one_time_password,
        "urlPath": f"/dashboard/{dashboard_id}",
        "version": version,
        "title": dashboard["title"],
        "createdAt": now,
        "requiresPassword": True,
    }


def create_dashboard_from_json(
    analysis: dict[str, Any],
    user_id: str,
    dashboard_json: dict[str, Any],
    *,
    password: str | None = None,
    prompt: str = "",
    parent_dashboard_id: str | None = None,
    version: int = 1,
) -> dict[str, Any]:
    if not isinstance(analysis, dict):
        raise ValueError("Dashboard analysis payload is required.")
    if not isinstance(dashboard_json, dict):
        raise ValueError("Dashboard JSON payload is required.")
    dashboard = dashboard_json.get("dashboard") if dashboard_json.get("kind") == "byizon.dynamic-dashboard" else dashboard_json.get("dashboard")
    if not isinstance(dashboard, dict):
        raise ValueError("Dashboard JSON must contain a dashboard object.")

    dashboard_id = uuid.uuid4().hex[:10]
    one_time_password = password or secrets.token_urlsafe(10)
    now = _utc_now()
    title = str(dashboard.get("title") or prompt or "Live Website Dashboard")
    description = str(dashboard.get("description") or "Generated live dashboard from uploaded data.")
    theme = str((dashboard.get("theme") or {}).get("mode") or "light")
    password_hash = bcrypt.hashpw(one_time_password.encode("utf-8"), bcrypt.gensalt(rounds=12))
    dashboard_json = {
        **dashboard_json,
        "generation": {
            **(dashboard_json.get("generation") if isinstance(dashboard_json.get("generation"), dict) else {}),
            "mode": "internal-live-website",
            "frameworkTarget": "Next.js + Tailwind + shadcn/ui",
            "prompt": prompt,
        },
    }
    with closing(_database()) as database, database:
        database.execute(
            """
            INSERT INTO generated_dashboards(
                dashboard_id, parent_dashboard_id, user_id, source_session_id, source_file_name,
                title, description, dashboard_json, theme, password_hash, failed_attempts,
                status, version, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 'active', ?, ?, ?)
            """,
            (
                dashboard_id,
                parent_dashboard_id,
                user_id,
                str(analysis.get("sessionId") or ""),
                str(analysis.get("fileName") or "Dashboard"),
                title,
                description,
                json.dumps(dashboard_json, ensure_ascii=False, separators=(",", ":")),
                theme,
                password_hash,
                version,
                now,
                now,
            ),
        )
    return {
        "dashboardId": dashboard_id,
        "password": one_time_password,
        "urlPath": f"/dashboard/{dashboard_id}",
        "version": version,
        "title": title,
        "createdAt": now,
        "requiresPassword": True,
    }


def get_dashboard_metadata(dashboard_id: str) -> dict[str, Any] | None:
    with closing(_database()) as database, database:
        row = database.execute("SELECT * FROM generated_dashboards WHERE dashboard_id = ?", (dashboard_id,)).fetchone()
    if not row or row["status"] != "active":
        return None
    return _row_to_dashboard(row)


def _get_dashboard_row(dashboard_id: str) -> sqlite3.Row | None:
    with closing(_database()) as database, database:
        return database.execute("SELECT * FROM generated_dashboards WHERE dashboard_id = ?", (dashboard_id,)).fetchone()


def verify_dashboard_password(dashboard_id: str, password: str) -> dict[str, Any]:
    row = _get_dashboard_row(dashboard_id)
    if not row or row["status"] != "active":
        raise DashboardAccessError("Dashboard was not found.", 404)
    if row["failed_attempts"] >= _MAX_FAILED_ATTEMPTS:
        raise DashboardAccessError("This dashboard is locked after too many incorrect attempts.", 429)
    if not bcrypt.checkpw(password.encode("utf-8"), bytes(row["password_hash"])):
        with closing(_database()) as database, database:
            database.execute("UPDATE generated_dashboards SET failed_attempts = failed_attempts + 1 WHERE dashboard_id = ?", (dashboard_id,))
        raise DashboardAccessError("Incorrect dashboard password.", 401)
    with closing(_database()) as database, database:
        database.execute("UPDATE generated_dashboards SET failed_attempts = 0, updated_at = ? WHERE dashboard_id = ?", (_utc_now(), dashboard_id))
    return {
        "accessToken": _issue_access_token(dashboard_id),
        "expiresIn": _ACCESS_SECONDS,
        "dashboard": _row_to_dashboard(row, include_json=True),
    }


def get_dashboard_json(dashboard_id: str, token: str, user_id: str | None = None) -> dict[str, Any]:
    row = _get_dashboard_row(dashboard_id)
    if not row or row["status"] != "active":
        raise DashboardAccessError("Dashboard was not found.", 404)
    if _verify_access_token(token) != dashboard_id:
        raise DashboardAccessError("Dashboard access is not authorized.", 401)
    return _row_to_dashboard(row, include_json=True)


def regenerate_dashboard(dashboard_id: str, analysis: dict[str, Any], user_id: str, prompt: str = "") -> dict[str, Any]:
    previous = _get_dashboard_row(dashboard_id)
    if not previous or previous["status"] != "active":
        raise DashboardAccessError("Dashboard was not found.", 404)
    if previous["user_id"] != user_id:
        raise DashboardAccessError("Only the dashboard owner can regenerate this dashboard.", 403)
    parent_id = previous["parent_dashboard_id"] or previous["dashboard_id"]
    next_version = int(previous["version"]) + 1
    plain_password = secrets.token_urlsafe(10)
    created = create_dashboard(
        analysis,
        user_id,
        password=plain_password,
        prompt=prompt,
        parent_dashboard_id=parent_id,
        version=next_version,
    )
    created["previousDashboardId"] = dashboard_id
    return created
