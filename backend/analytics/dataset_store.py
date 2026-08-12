from __future__ import annotations

import hashlib
import json
import sqlite3
import time
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from ..connection_store import DATA_DIR
from .sql_warehouse import reassign_dataset_owner


DATABASE_PATH = DATA_DIR / "connections.sqlite3"


class _ClosingConnection(sqlite3.Connection):
    def __exit__(self, exc_type, exc_value, traceback):
        try:
            return super().__exit__(exc_type, exc_value, traceback)
        finally:
            self.close()


def _database() -> sqlite3.Connection:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    database = sqlite3.connect(DATABASE_PATH, factory=_ClosingConnection)
    database.row_factory = sqlite3.Row
    database.execute("PRAGMA foreign_keys = ON")
    database.execute(
        """
        CREATE TABLE IF NOT EXISTS uploaded_datasets (
            dataset_id TEXT PRIMARY KEY,
            owner_user_id TEXT NOT NULL,
            file_name TEXT NOT NULL,
            content_type TEXT,
            source_kind TEXT NOT NULL,
            size_bytes INTEGER NOT NULL,
            sha256 TEXT NOT NULL,
            raw_blob BLOB NOT NULL,
            metadata_json TEXT NOT NULL,
            created_at TEXT NOT NULL
        )
        """
    )
    database.execute(
        """
        CREATE TABLE IF NOT EXISTS analysis_sessions (
            session_id TEXT PRIMARY KEY,
            dataset_id TEXT,
            owner_user_id TEXT NOT NULL,
            file_metadata_json TEXT NOT NULL,
            analysis_json TEXT NOT NULL,
            chat_history_json TEXT NOT NULL,
            analysis_status TEXT NOT NULL,
            created_at REAL NOT NULL,
            updated_at REAL NOT NULL,
            FOREIGN KEY(dataset_id) REFERENCES uploaded_datasets(dataset_id)
        )
        """
    )
    database.commit()
    return database


def store_dataset(
    file_name: str,
    content: bytes,
    owner_user_id: str,
    *,
    content_type: str = "application/octet-stream",
    source_kind: str = "manual_upload",
    metadata: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Persist source bytes before parsing so analysis always starts from stored data."""
    dataset_id = f"dataset_{uuid4().hex}"
    created_at = datetime.now(timezone.utc).isoformat()
    digest = hashlib.sha256(content).hexdigest()
    record = {
        "datasetId": dataset_id,
        "ownerUserId": owner_user_id,
        "fileName": file_name,
        "contentType": content_type,
        "sourceKind": source_kind,
        "sizeBytes": len(content),
        "sha256": digest,
        "metadata": metadata or {},
        "createdAt": created_at,
    }
    with _database() as database:
        database.execute(
            """
            INSERT INTO uploaded_datasets (
                dataset_id, owner_user_id, file_name, content_type, source_kind,
                size_bytes, sha256, raw_blob, metadata_json, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                dataset_id,
                owner_user_id,
                file_name,
                content_type,
                source_kind,
                len(content),
                digest,
                sqlite3.Binary(content),
                json.dumps(metadata or {}, ensure_ascii=False),
                created_at,
            ),
        )
        database.commit()
    return record


def load_dataset_bytes(dataset_id: str, owner_user_id: str) -> bytes:
    with _database() as database:
        row = database.execute(
            """
            SELECT raw_blob FROM uploaded_datasets
            WHERE dataset_id = ? AND owner_user_id = ?
            """,
            (dataset_id, owner_user_id),
        ).fetchone()
    if not row:
        raise ValueError("Stored dataset was not found for this workspace.")
    return bytes(row["raw_blob"])


def save_session(session: dict[str, Any], dataset_id: str | None = None) -> dict[str, Any]:
    with _database() as database:
        database.execute(
            """
            INSERT OR REPLACE INTO analysis_sessions (
                session_id, dataset_id, owner_user_id, file_metadata_json,
                analysis_json, chat_history_json, analysis_status, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                session["sessionId"],
                dataset_id or session.get("datasetId"),
                session.get("ownerUserId") or "anonymous",
                json.dumps(session.get("fileMetadata") or {}, ensure_ascii=False),
                json.dumps(session.get("analysis") or {}, ensure_ascii=False),
                json.dumps(session.get("chatHistory") or [], ensure_ascii=False),
                session.get("analysisStatus") or "complete",
                float(session.get("createdAt") or time.time()),
                float(session.get("updatedAt") or time.time()),
            ),
        )
        database.commit()
    return session


def save_session_analysis(
    session_id: str,
    analysis: dict[str, Any],
    analysis_status: str,
    owner_user_id: str | None = None,
) -> bool:
    query = """
        UPDATE analysis_sessions
        SET analysis_json = ?, analysis_status = ?, updated_at = ?
        WHERE session_id = ?
    """
    parameters: tuple[Any, ...] = (
        json.dumps(analysis, ensure_ascii=False),
        analysis_status,
        time.time(),
        session_id,
    )
    if owner_user_id:
        query += " AND owner_user_id = ?"
        parameters += (owner_user_id,)
    with _database() as database:
        cursor = database.execute(query, parameters)
        database.commit()
        return cursor.rowcount > 0


def load_session(session_id: str, owner_user_id: str | None = None) -> dict[str, Any] | None:
    query = "SELECT * FROM analysis_sessions WHERE session_id = ?"
    params: tuple[Any, ...] = (session_id,)
    if owner_user_id:
        query += " AND owner_user_id = ?"
        params = (session_id, owner_user_id)
    with _database() as database:
        row = database.execute(query, params).fetchone()
    if not row:
        return None
    return {
        "sessionId": row["session_id"],
        "datasetId": row["dataset_id"],
        "fileMetadata": json.loads(row["file_metadata_json"]),
        "analysis": json.loads(row["analysis_json"]),
        "chatHistory": json.loads(row["chat_history_json"]),
        "analysisStatus": row["analysis_status"],
        "ownerUserId": row["owner_user_id"],
        "createdAt": row["created_at"],
        "updatedAt": row["updated_at"],
    }


def delete_session(session_id: str, owner_user_id: str | None = None) -> bool:
    query = "DELETE FROM analysis_sessions WHERE session_id = ?"
    params: tuple[Any, ...] = (session_id,)
    if owner_user_id:
        query += " AND owner_user_id = ?"
        params = (session_id, owner_user_id)
    with _database() as database:
        cursor = database.execute(query, params)
        database.commit()
    return cursor.rowcount > 0


def reassign_sessions(previous_owner_user_id: str, owner_user_id: str) -> int:
    with _database() as database:
        cursor = database.execute(
            """
            UPDATE analysis_sessions SET owner_user_id = ?, updated_at = ?
            WHERE owner_user_id = ?
            """,
            (owner_user_id, time.time(), previous_owner_user_id),
        )
        database.execute(
            """
            UPDATE uploaded_datasets SET owner_user_id = ?
            WHERE owner_user_id = ?
            """,
            (owner_user_id, previous_owner_user_id),
        )
        database.commit()
    warehouse_count = reassign_dataset_owner(previous_owner_user_id, owner_user_id)
    return int(cursor.rowcount or 0) + warehouse_count
