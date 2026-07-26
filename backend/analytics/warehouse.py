from __future__ import annotations

import hashlib
import json
import os
import sqlite3
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone
from typing import Any

from . import dataset_store


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=True, sort_keys=True, default=str)


def _hash_payload(value: Any) -> str:
    return hashlib.sha256(_json(value).encode("utf-8")).hexdigest()


def active_store_name() -> str:
    """Name the active analytics warehouse adapter for audit/manifest contracts."""
    if os.getenv("DATABASE_URL"):
        return "postgresql_after_preprocessing"
    return "local_sqlite_warehouse_adapter"


def _ensure_columns(conn: sqlite3.Connection, table_name: str, columns: dict[str, str]) -> None:
    existing = {
        row["name"]
        for row in conn.execute(f"PRAGMA table_info({table_name})").fetchall()
    }
    for column_name, column_type in columns.items():
        if column_name not in existing:
            conn.execute(f"ALTER TABLE {table_name} ADD COLUMN {column_name} {column_type}")


def _ensure_tables(conn: sqlite3.Connection) -> None:
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS pipeline_runs (
            run_id TEXT PRIMARY KEY,
            dataset_id TEXT NOT NULL,
            owner_user_id TEXT NOT NULL,
            source_kind TEXT NOT NULL,
            status TEXT NOT NULL,
            current_stage TEXT,
            manifest_json TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS dataset_layers (
            layer_id TEXT PRIMARY KEY,
            run_id TEXT NOT NULL,
            dataset_id TEXT NOT NULL,
            owner_user_id TEXT NOT NULL,
            layer_name TEXT NOT NULL,
            storage_ref TEXT NOT NULL,
            manifest_json TEXT NOT NULL,
            created_at TEXT NOT NULL
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS metric_registry (
            metric_id TEXT PRIMARY KEY,
            dataset_id TEXT NOT NULL,
            owner_user_id TEXT NOT NULL,
            name TEXT NOT NULL,
            description TEXT,
            formula TEXT,
            source_columns_json TEXT NOT NULL,
            aggregation_rules_json TEXT NOT NULL,
            validation_rules_json TEXT NOT NULL,
            business_meaning TEXT,
            confidence REAL,
            created_at TEXT NOT NULL
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS evidence_audit (
            evidence_id TEXT PRIMARY KEY,
            dataset_id TEXT NOT NULL,
            owner_user_id TEXT NOT NULL,
            session_id TEXT,
            question_hash TEXT NOT NULL,
            intent TEXT NOT NULL,
            metric_ids_json TEXT NOT NULL,
            payload_json TEXT NOT NULL,
            context_bytes INTEGER NOT NULL,
            created_at TEXT NOT NULL
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS ai_request_audit (
            request_id TEXT PRIMARY KEY,
            owner_user_id TEXT NOT NULL,
            purpose TEXT NOT NULL,
            provider TEXT NOT NULL,
            model TEXT,
            evidence_id TEXT,
            status TEXT NOT NULL,
            request_hash TEXT NOT NULL,
            response_hash TEXT,
            error TEXT,
            created_at TEXT NOT NULL
        )
        """
    )
    _ensure_columns(
        conn,
        "ai_request_audit",
        {
            "prompt_bytes": "INTEGER NOT NULL DEFAULT 0",
            "completion_bytes": "INTEGER NOT NULL DEFAULT 0",
            "latency_ms": "INTEGER NOT NULL DEFAULT 0",
            "token_usage_json": "TEXT NOT NULL DEFAULT '{}'",
            "workspace_context_json": "TEXT NOT NULL DEFAULT '{}'",
        },
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS runtime_query_runs (
            run_id TEXT PRIMARY KEY,
            dataset_id TEXT NOT NULL,
            owner_user_id TEXT NOT NULL,
            session_id TEXT,
            question_hash TEXT NOT NULL,
            intent_json TEXT NOT NULL,
            query_plan_json TEXT NOT NULL,
            status TEXT NOT NULL,
            manifest_json TEXT NOT NULL,
            error TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS runtime_sql_audit (
            audit_id TEXT PRIMARY KEY,
            run_id TEXT NOT NULL,
            owner_user_id TEXT NOT NULL,
            sql_template TEXT NOT NULL,
            parameters_json TEXT NOT NULL,
            validation_json TEXT NOT NULL,
            returned_rows INTEGER NOT NULL,
            returned_columns INTEGER NOT NULL,
            status TEXT NOT NULL,
            error TEXT,
            created_at TEXT NOT NULL
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS analytics_datasets (
            analytics_dataset_id TEXT PRIMARY KEY,
            dataset_id TEXT NOT NULL,
            owner_user_id TEXT NOT NULL,
            version INTEGER NOT NULL,
            source_hash TEXT NOT NULL,
            status TEXT NOT NULL,
            payload_json TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            UNIQUE(dataset_id, owner_user_id)
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS analytics_refresh_audit (
            refresh_id TEXT PRIMARY KEY,
            analytics_dataset_id TEXT NOT NULL,
            dataset_id TEXT NOT NULL,
            owner_user_id TEXT NOT NULL,
            refresh_kind TEXT NOT NULL,
            previous_hash TEXT,
            new_hash TEXT NOT NULL,
            changed INTEGER NOT NULL,
            status TEXT NOT NULL,
            created_at TEXT NOT NULL
        )
        """
    )
    conn.commit()


@contextmanager
def _database():
    ctx = dataset_store._database()
    conn = ctx.__enter__()
    try:
        _ensure_tables(conn)
        yield conn
    finally:
        ctx.__exit__(None, None, None)


def create_pipeline_run(dataset_id: str, owner_user_id: str, source_kind: str, manifest: dict[str, Any]) -> str:
    run_id = uuid.uuid4().hex
    with _database() as conn:
        conn.execute(
            """
            INSERT INTO pipeline_runs
            (run_id, dataset_id, owner_user_id, source_kind, status, current_stage, manifest_json, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (run_id, dataset_id, owner_user_id, source_kind, "running", None, _json(manifest), _now(), _now()),
        )
        conn.commit()
    return run_id


def update_pipeline_stage(run_id: str, owner_user_id: str, stage: str) -> None:
    with _database() as conn:
        conn.execute(
            "UPDATE pipeline_runs SET current_stage = ?, updated_at = ? WHERE run_id = ? AND owner_user_id = ?",
            (stage, _now(), run_id, owner_user_id),
        )
        conn.commit()


def complete_pipeline_run(run_id: str, owner_user_id: str, manifest: dict[str, Any]) -> None:
    with _database() as conn:
        conn.execute(
            """
            UPDATE pipeline_runs
            SET status = ?, current_stage = ?, manifest_json = ?, updated_at = ?
            WHERE run_id = ? AND owner_user_id = ?
            """,
            ("complete", "analysis_contract_finalized", _json(manifest), _now(), run_id, owner_user_id),
        )
        conn.commit()


def add_layer(
    run_id: str,
    dataset_id: str,
    owner_user_id: str,
    layer_name: str,
    storage_ref: str,
    manifest: dict[str, Any],
) -> str:
    layer_id = uuid.uuid4().hex
    with _database() as conn:
        conn.execute(
            """
            INSERT INTO dataset_layers
            (layer_id, run_id, dataset_id, owner_user_id, layer_name, storage_ref, manifest_json, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (layer_id, run_id, dataset_id, owner_user_id, layer_name, storage_ref, _json(manifest), _now()),
        )
        conn.commit()
    return layer_id


def register_metric(
    dataset_id: str,
    owner_user_id: str,
    name: str,
    *,
    description: str = "",
    formula: str = "",
    source_columns: list[str] | None = None,
    aggregation_rules: dict[str, Any] | None = None,
    validation_rules: dict[str, Any] | None = None,
    business_meaning: str = "",
    confidence: float | None = None,
) -> str:
    metric_id = hashlib.sha256(f"{dataset_id}:{name}:{formula}:{source_columns}".encode("utf-8")).hexdigest()[:32]
    with _database() as conn:
        conn.execute(
            """
            INSERT OR REPLACE INTO metric_registry
            (metric_id, dataset_id, owner_user_id, name, description, formula, source_columns_json,
             aggregation_rules_json, validation_rules_json, business_meaning, confidence, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                metric_id,
                dataset_id,
                owner_user_id,
                name,
                description,
                formula,
                _json(source_columns or []),
                _json(aggregation_rules or {}),
                _json(validation_rules or {}),
                business_meaning,
                confidence,
                _now(),
            ),
        )
        conn.commit()
    return metric_id


def list_metrics(dataset_id: str, owner_user_id: str) -> list[dict[str, Any]]:
    with _database() as conn:
        rows = conn.execute(
            """
            SELECT metric_id, name, description, formula, source_columns_json, aggregation_rules_json,
                   validation_rules_json, business_meaning, confidence
            FROM metric_registry
            WHERE dataset_id = ? AND owner_user_id = ?
            ORDER BY created_at
            """,
            (dataset_id, owner_user_id),
        ).fetchall()
    return [
        {
            "metricId": row["metric_id"],
            "name": row["name"],
            "description": row["description"],
            "formula": row["formula"],
            "sourceColumns": json.loads(row["source_columns_json"] or "[]"),
            "aggregationRules": json.loads(row["aggregation_rules_json"] or "{}"),
            "validationRules": json.loads(row["validation_rules_json"] or "{}"),
            "businessMeaning": row["business_meaning"],
            "confidence": row["confidence"],
        }
        for row in rows
    ]


def record_evidence(
    dataset_id: str,
    owner_user_id: str,
    *,
    session_id: str | None,
    question: str,
    intent: str,
    metric_ids: list[str],
    payload: dict[str, Any],
) -> str:
    evidence_id = uuid.uuid4().hex
    payload_json = _json(payload)
    with _database() as conn:
        conn.execute(
            """
            INSERT INTO evidence_audit
            (evidence_id, dataset_id, owner_user_id, session_id, question_hash, intent, metric_ids_json,
             payload_json, context_bytes, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                evidence_id,
                dataset_id,
                owner_user_id,
                session_id,
                hashlib.sha256(question.encode("utf-8", errors="ignore")).hexdigest(),
                intent,
                _json(metric_ids),
                payload_json,
                len(payload_json.encode("utf-8")),
                _now(),
            ),
        )
        conn.commit()
    return evidence_id


def record_ai_request(
    owner_user_id: str,
    *,
    purpose: str,
    provider: str,
    model: str | None,
    evidence_id: str | None,
    status: str,
    request_payload: dict[str, Any],
    response_text: str | None = None,
    error: str | None = None,
    prompt_bytes: int | None = None,
    completion_bytes: int | None = None,
    latency_ms: int | None = None,
    token_usage: dict[str, Any] | None = None,
    workspace_context: dict[str, Any] | None = None,
) -> str:
    request_id = uuid.uuid4().hex
    with _database() as conn:
        conn.execute(
            """
            INSERT INTO ai_request_audit
            (request_id, owner_user_id, purpose, provider, model, evidence_id, status, request_hash,
             response_hash, error, prompt_bytes, completion_bytes, latency_ms, token_usage_json,
             workspace_context_json, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                request_id,
                owner_user_id,
                purpose,
                provider,
                model,
                evidence_id,
                status,
                _hash_payload(request_payload),
                hashlib.sha256((response_text or "").encode("utf-8")).hexdigest() if response_text else None,
                error,
                int(prompt_bytes or 0),
                int(completion_bytes or 0),
                int(latency_ms or 0),
                _json(token_usage or {}),
                _json(workspace_context or {}),
                _now(),
            ),
        )
        conn.commit()
    return request_id


def create_runtime_query_run(
    dataset_id: str,
    owner_user_id: str,
    *,
    session_id: str | None,
    question: str,
    intent: dict[str, Any],
    query_plan: dict[str, Any],
) -> str:
    run_id = uuid.uuid4().hex
    now = _now()
    with _database() as conn:
        conn.execute(
            """
            INSERT INTO runtime_query_runs
            (run_id, dataset_id, owner_user_id, session_id, question_hash, intent_json,
             query_plan_json, status, manifest_json, error, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                run_id,
                dataset_id or "unknown",
                owner_user_id,
                session_id,
                hashlib.sha256(question.encode("utf-8", errors="ignore")).hexdigest(),
                _json(intent),
                _json(query_plan),
                "running",
                _json({"stage": "runtime_query_started"}),
                None,
                now,
                now,
            ),
        )
        conn.commit()
    return run_id


def complete_runtime_query_run(
    run_id: str,
    owner_user_id: str,
    *,
    status: str,
    manifest: dict[str, Any],
    error: str | None = None,
) -> None:
    with _database() as conn:
        conn.execute(
            """
            UPDATE runtime_query_runs
            SET status = ?, manifest_json = ?, error = ?, updated_at = ?
            WHERE run_id = ? AND owner_user_id = ?
            """,
            (status, _json(manifest), error, _now(), run_id, owner_user_id),
        )
        conn.commit()


def record_sql_execution(
    run_id: str,
    owner_user_id: str,
    *,
    sql_template: str,
    parameters: list[Any],
    validation: dict[str, Any],
    returned_rows: int,
    returned_columns: int,
    status: str,
    error: str | None = None,
) -> str:
    audit_id = uuid.uuid4().hex
    with _database() as conn:
        conn.execute(
            """
            INSERT INTO runtime_sql_audit
            (audit_id, run_id, owner_user_id, sql_template, parameters_json, validation_json,
             returned_rows, returned_columns, status, error, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                audit_id,
                run_id,
                owner_user_id,
                sql_template,
                _json(parameters),
                _json(validation),
                returned_rows,
                returned_columns,
                status,
                error,
                _now(),
            ),
        )
        conn.commit()
    return audit_id


def _analytics_dataset_id(dataset_id: str, owner_user_id: str) -> str:
    return hashlib.sha256(f"{owner_user_id}:{dataset_id}:analytics".encode("utf-8")).hexdigest()[:32]


def upsert_analytics_dataset(
    dataset_id: str,
    owner_user_id: str,
    payload: dict[str, Any],
    *,
    source_hash: str | None = None,
    status: str = "ready",
    refresh_kind: str = "manual",
) -> dict[str, Any]:
    """Persist the analytics-ready semantic dataset used by every consumer."""
    analytics_dataset_id = _analytics_dataset_id(dataset_id, owner_user_id)
    next_hash = source_hash or _hash_payload(payload)
    now = _now()
    with _database() as conn:
        existing = conn.execute(
            """
            SELECT version, source_hash, created_at
            FROM analytics_datasets
            WHERE analytics_dataset_id = ? AND owner_user_id = ?
            """,
            (analytics_dataset_id, owner_user_id),
        ).fetchone()
        previous_hash = existing["source_hash"] if existing else None
        changed = previous_hash != next_hash
        version = int(existing["version"]) + 1 if existing and changed else int(existing["version"]) if existing else 1
        created_at = existing["created_at"] if existing else now
        stored_payload = dict(payload)
        stored_payload.update(
            {
                "analyticsDatasetId": analytics_dataset_id,
                "datasetId": dataset_id,
                "version": version,
                "sourceHash": next_hash,
                "status": status,
                "updatedAt": now,
            }
        )
        conn.execute(
            """
            INSERT INTO analytics_datasets
            (analytics_dataset_id, dataset_id, owner_user_id, version, source_hash, status,
             payload_json, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(dataset_id, owner_user_id) DO UPDATE SET
                version = excluded.version,
                source_hash = excluded.source_hash,
                status = excluded.status,
                payload_json = excluded.payload_json,
                updated_at = excluded.updated_at
            """,
            (
                analytics_dataset_id,
                dataset_id,
                owner_user_id,
                version,
                next_hash,
                status,
                _json(stored_payload),
                created_at,
                now,
            ),
        )
        conn.execute(
            """
            INSERT INTO analytics_refresh_audit
            (refresh_id, analytics_dataset_id, dataset_id, owner_user_id, refresh_kind,
             previous_hash, new_hash, changed, status, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                uuid.uuid4().hex,
                analytics_dataset_id,
                dataset_id,
                owner_user_id,
                refresh_kind,
                previous_hash,
                next_hash,
                1 if changed else 0,
                status,
                now,
            ),
        )
        conn.commit()
    return {
        "analyticsDatasetId": analytics_dataset_id,
        "datasetId": dataset_id,
        "version": version,
        "changed": changed,
        "sourceHash": next_hash,
        "status": status,
        "payload": stored_payload,
    }


def load_analytics_dataset(dataset_id_or_analytics_id: str, owner_user_id: str) -> dict[str, Any] | None:
    with _database() as conn:
        row = conn.execute(
            """
            SELECT analytics_dataset_id, dataset_id, version, source_hash, status, payload_json, updated_at
            FROM analytics_datasets
            WHERE owner_user_id = ? AND (analytics_dataset_id = ? OR dataset_id = ?)
            """,
            (owner_user_id, dataset_id_or_analytics_id, dataset_id_or_analytics_id),
        ).fetchone()
    if not row:
        return None
    return {
        "analyticsDatasetId": row["analytics_dataset_id"],
        "datasetId": row["dataset_id"],
        "version": int(row["version"]),
        "sourceHash": row["source_hash"],
        "status": row["status"],
        "updatedAt": row["updated_at"],
        "payload": json.loads(row["payload_json"] or "{}"),
    }
