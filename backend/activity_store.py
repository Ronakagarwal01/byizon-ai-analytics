from __future__ import annotations

import json
import sqlite3
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from .connection_store import DATA_DIR


DATABASE_PATH = DATA_DIR / "connections.sqlite3"


def _database() -> sqlite3.Connection:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    database = sqlite3.connect(DATABASE_PATH)
    database.execute(
        """
        CREATE TABLE IF NOT EXISTS automation_activity (
            activity_id TEXT PRIMARY KEY,
            owner_user_id TEXT NOT NULL,
            created_at TEXT NOT NULL,
            payload_json TEXT NOT NULL
        )
        """
    )
    database.commit()
    return database


def record_activity(owner_user_id: str, payload: dict[str, Any]) -> dict[str, Any]:
    activity = {
        **payload,
        "activityId": str(payload.get("activityId") or f"act_{uuid4().hex[:12]}"),
        "createdAt": str(payload.get("createdAt") or datetime.now(timezone.utc).isoformat()),
    }
    with _database() as database:
        database.execute(
            """
            INSERT OR REPLACE INTO automation_activity
                (activity_id, owner_user_id, created_at, payload_json)
            VALUES (?, ?, ?, ?)
            """,
            (
                activity["activityId"],
                owner_user_id,
                activity["createdAt"],
                json.dumps(activity, ensure_ascii=False),
            ),
        )
        database.execute(
            """
            DELETE FROM automation_activity
            WHERE owner_user_id = ? AND activity_id NOT IN (
                SELECT activity_id FROM automation_activity
                WHERE owner_user_id = ?
                ORDER BY created_at DESC
                LIMIT 100
            )
            """,
            (owner_user_id, owner_user_id),
        )
        database.commit()
    return activity


def list_activities(owner_user_id: str, limit: int = 30) -> list[dict[str, Any]]:
    safe_limit = max(1, min(100, int(limit)))
    with _database() as database:
        rows = database.execute(
            """
            SELECT payload_json FROM automation_activity
            WHERE owner_user_id = ?
            ORDER BY created_at DESC
            LIMIT ?
            """,
            (owner_user_id, safe_limit),
        ).fetchall()
    output = []
    for (raw,) in rows:
        try:
            value = json.loads(raw)
            if isinstance(value, dict):
                output.append(value)
        except (TypeError, json.JSONDecodeError):
            continue
    return output
