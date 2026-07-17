from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
from pathlib import Path
from typing import Any
from urllib import error, request

ROOT = Path(__file__).resolve().parents[1]
STITCH_BRIDGE = Path(__file__).with_name("stitch_bridge.mjs")
ALLOWED_THEMES = {"light", "dark", "contrast"}
ALLOWED_DENSITIES = {"compact", "comfortable"}
ALLOWED_LAYOUTS = {"grid", "story"}


def studio_config() -> dict[str, Any]:
    return {
        "huggingFaceConfigured": bool(_hf_key()),
        "stitchConfigured": bool(os.getenv("STITCH_API_KEY", "").strip()),
    }


def _hf_key() -> str:
    return (os.getenv("HF_API_KEY") or os.getenv("HF_TOKEN") or os.getenv("VITE_HF_API_KEY") or "").strip()


def _node_binary() -> str | None:
    configured = os.getenv("NODE_BINARY", "").strip()
    candidates = [configured, shutil.which("node")]
    runtime_root = Path.home() / ".cache" / "codex-runtimes"
    if runtime_root.exists():
        candidates.extend(str(path) for path in runtime_root.glob("*/dependencies/node/bin/node.exe"))
    return next((candidate for candidate in candidates if candidate and Path(candidate).is_file()), None)


def _default_plan(analysis: dict[str, Any]) -> dict[str, Any]:
    charts = [str(item.get("id")) for item in analysis.get("charts", []) if item.get("id")]
    return {
        "title": f"{analysis.get('fileName', 'Data')} Dashboard",
        "subtitle": "Custom view generated from the protected analysis",
        "theme": "light",
        "density": "comfortable",
        "layout": "grid",
        "kpiLimit": min(5, len(analysis.get("kpis", []))),
        "chartIds": charts[:6],
        "showInsights": True,
        "accent": "blue",
    }


def _deterministic_plan(prompt: str, analysis: dict[str, Any], current: dict[str, Any] | None) -> dict[str, Any]:
    plan = {**_default_plan(analysis), **(current or {})}
    value = prompt.lower()
    if "dark" in value:
        plan["theme"] = "dark"
    elif "contrast" in value:
        plan["theme"] = "contrast"
    elif "light" in value:
        plan["theme"] = "light"
    if any(word in value for word in ("compact", "dense", "chota", "small")):
        plan["density"] = "compact"
    if any(word in value for word in ("story", "presentation", "vertical")):
        plan["layout"] = "story"
    if any(word in value for word in ("hide insight", "remove insight", "insight mat")):
        plan["showInsights"] = False
    match = re.search(r"(?:top|show|dikhao)?\s*(\d+)\s*(?:kpi|cards?)", value)
    if match:
        plan["kpiLimit"] = max(1, min(8, int(match.group(1))))
    return plan


def _hf_plan(prompt: str, analysis: dict[str, Any], current: dict[str, Any] | None) -> dict[str, Any] | None:
    key = _hf_key()
    if not key:
        return None
    charts = [{"id": item.get("id"), "title": item.get("title"), "type": item.get("type")} for item in analysis.get("charts", [])[:30]]
    context = {
        "fileName": analysis.get("fileName"),
        "kpis": [{"label": item.get("label"), "value": item.get("value")} for item in analysis.get("kpis", [])[:12]],
        "charts": charts,
        "currentPlan": current or _default_plan(analysis),
    }
    system = (
        "Return one JSON object only. You customize a dashboard layout, never data values. "
        "Allowed keys: title, subtitle, theme, density, layout, kpiLimit, chartIds, showInsights, accent. "
        "theme is light|dark|contrast; density compact|comfortable; layout grid|story. "
        "chartIds must only contain IDs supplied in context. kpiLimit is 1-8."
    )
    payload = json.dumps({
        "model": os.getenv("HF_MODEL") or os.getenv("VITE_HF_MODEL") or "meta-llama/Llama-3.1-8B-Instruct",
        "messages": [{"role": "system", "content": system}, {"role": "user", "content": f"CONTEXT={json.dumps(context, ensure_ascii=False)}\nREQUEST={prompt}"}],
        "max_tokens": 500,
        "temperature": 0.1,
    }).encode("utf-8")
    req = request.Request("https://router.huggingface.co/v1/chat/completions", data=payload, headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"}, method="POST")
    try:
        with request.urlopen(req, timeout=90) as response:
            result = json.loads(response.read().decode("utf-8"))
        content = result.get("choices", [{}])[0].get("message", {}).get("content", "")
        match = re.search(r"\{.*\}", content, re.DOTALL)
        return json.loads(match.group(0)) if match else None
    except (error.URLError, ValueError, json.JSONDecodeError):
        return None


def _sanitize_plan(candidate: dict[str, Any], analysis: dict[str, Any]) -> dict[str, Any]:
    base = _default_plan(analysis)
    available = {str(item.get("id")) for item in analysis.get("charts", []) if item.get("id")}
    base["title"] = str(candidate.get("title") or base["title"])[:100]
    base["subtitle"] = str(candidate.get("subtitle") or base["subtitle"])[:180]
    base["theme"] = candidate.get("theme") if candidate.get("theme") in ALLOWED_THEMES else base["theme"]
    base["density"] = candidate.get("density") if candidate.get("density") in ALLOWED_DENSITIES else base["density"]
    base["layout"] = candidate.get("layout") if candidate.get("layout") in ALLOWED_LAYOUTS else base["layout"]
    base["kpiLimit"] = max(1, min(8, int(candidate.get("kpiLimit") or base["kpiLimit"] or 1)))
    selected = [str(value) for value in candidate.get("chartIds", []) if str(value) in available]
    base["chartIds"] = selected or base["chartIds"]
    base["showInsights"] = bool(candidate.get("showInsights", base["showInsights"]))
    base["accent"] = str(candidate.get("accent") or "blue")[:24]
    return base


def _stitch_design(prompt: str, analysis: dict[str, Any], plan: dict[str, Any], stitch_state: dict[str, Any] | None = None) -> dict[str, Any]:
    if not os.getenv("STITCH_API_KEY", "").strip():
        return {"configured": False, "status": "not_configured"}
    node = _node_binary()
    if not node or not STITCH_BRIDGE.exists():
        return {"configured": True, "status": "unavailable", "error": "Node.js Stitch bridge is unavailable."}
    selected_ids = set(plan["chartIds"])
    safe_prompt = {
        "projectId": str((stitch_state or {}).get("projectId") or "")[:120],
        "screenId": str((stitch_state or {}).get("screenId") or "")[:120],
        "title": plan["title"], "theme": plan["theme"], "layout": plan["layout"],
        "kpis": [
            {
                "label": str(item.get("label") or "Metric")[:100],
                "value": str(item.get("formattedValue") or item.get("displayValue") or item.get("value") or "")[:100],
                "formula": str(item.get("formula") or "")[:180],
            }
            for item in analysis.get("kpis", [])[: plan["kpiLimit"]]
        ],
        "charts": [
            {
                "title": str(item.get("title") or "Chart")[:120],
                "type": str(item.get("type") or "bar")[:30],
                "data": [
                    {str(key)[:40]: value for key, value in row.items() if isinstance(value, (str, int, float, bool))}
                    for row in (item.get("data") or [])[:12]
                    if isinstance(row, dict)
                ],
            }
            for item in analysis.get("charts", [])
            if str(item.get("id")) in selected_ids
        ][:8],
        "insights": [
            str(item if isinstance(item, str) else item.get("observation") or item.get("title") or item.get("evidence") or "")[:240]
            for item in (analysis.get("insightObjects") or analysis.get("insights") or [])[:5]
        ],
        "request": prompt[:1000],
    }
    try:
        completed = subprocess.run([node, str(STITCH_BRIDGE)], input=json.dumps(safe_prompt), text=True, capture_output=True, timeout=300, cwd=ROOT, check=False)
        result = json.loads(completed.stdout or "{}")
        return {"configured": True, **result}
    except (subprocess.TimeoutExpired, json.JSONDecodeError, OSError) as exc:
        return {"configured": True, "status": "error", "error": str(exc)[:300]}


def plan_dashboard(
    prompt: str,
    analysis: dict[str, Any],
    current: dict[str, Any] | None = None,
    use_stitch: bool = False,
    stitch_state: dict[str, Any] | None = None,
) -> dict[str, Any]:
    deterministic = _deterministic_plan(prompt, analysis, current)
    llm = None if use_stitch else _hf_plan(prompt, analysis, deterministic)
    plan = _sanitize_plan({**deterministic, **(llm or {})}, analysis)
    stitch = _stitch_design(prompt, analysis, plan, stitch_state) if use_stitch else {"configured": bool(os.getenv("STITCH_API_KEY", "").strip()), "status": "not_requested"}
    return {"plan": plan, "source": "stitch" if use_stitch else "huggingface" if llm else "deterministic", "stitch": stitch}
