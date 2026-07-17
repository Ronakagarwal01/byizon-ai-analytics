from __future__ import annotations

import json
import os
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


def slack_configured() -> bool:
    return bool(os.getenv("SLACK_WEBHOOK_URL", "").strip())


def send_slack_message(text: str, blocks: list[dict[str, Any]] | None = None) -> dict[str, Any]:
    webhook_url = os.getenv("SLACK_WEBHOOK_URL", "").strip()
    if not webhook_url:
        raise ValueError("SLACK_WEBHOOK_URL is not configured in .env.")
    if not webhook_url.startswith("https://hooks.slack.com/"):
        raise ValueError("SLACK_WEBHOOK_URL must be an official Slack incoming webhook URL.")
    message = str(text or "").strip()
    if not message:
        raise ValueError("Slack message cannot be empty.")
    payload: dict[str, Any] = {"text": message[:3000]}
    if blocks:
        payload["blocks"] = blocks[:50]
    request = Request(
        webhook_url,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json", "User-Agent": "Byizon-Analytics/1.0"},
        method="POST",
    )
    try:
        with urlopen(request, timeout=20) as response:
            result = response.read(4096).decode("utf-8", errors="replace")
    except HTTPError as exc:
        detail = exc.read(500).decode("utf-8", errors="replace")
        raise ValueError(f"Slack webhook rejected the request ({exc.code}): {detail}") from exc
    except URLError as exc:
        raise ValueError(f"Could not reach Slack: {exc.reason}") from exc
    if result.strip().lower() != "ok":
        raise ValueError(f"Slack returned an unexpected response: {result[:200]}")
    return {"sent": True, "provider": "slack"}
