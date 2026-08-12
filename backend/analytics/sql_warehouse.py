from __future__ import annotations

import hashlib
import json
import math
import os
import re
import sqlite3
from contextlib import contextmanager
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any, Iterator, Sequence
from uuid import uuid4

import pandas as pd

from ..connection_store import DATA_DIR


QUERY_CATALOG_VERSION = "1.0"
DEFAULT_SQLITE_PATH = DATA_DIR / "analytics_warehouse.sqlite3"
SENSITIVE_COLUMN_HINTS = (
    "email",
    "e-mail",
    "phone",
    "mobile",
    "address",
    "password",
    "secret",
    "token",
    "aadhaar",
    "aadhar",
    "pan_number",
    "ssn",
    "credit_card",
    "bank_account",
    "customer_name",
    "patient_name",
    "employee_name",
    "contact_name",
    "first_name",
    "last_name",
    "full_name",
)


# These are the only SQL templates used to build model evidence. User text and
# model output never become SQL; they are used only to rank the bounded results.
QUERY_CATALOG: dict[str, str] = {
    "dataset_overview": """
        SELECT
            source.file_name,
            source.file_type,
            source.source_kind,
            source.size_bytes,
            source.domain,
            source.dataset_type,
            COUNT(DISTINCT dataset_table.table_id) AS table_count,
            COALESCE(SUM(dataset_table.row_count), 0) AS row_count,
            COALESCE(SUM(dataset_table.column_count), 0) AS column_count
        FROM analytics_sources AS source
        LEFT JOIN analytics_tables AS dataset_table
          ON dataset_table.dataset_id = source.dataset_id
         AND dataset_table.owner_user_id = source.owner_user_id
        WHERE source.dataset_id = ? AND source.owner_user_id = ?
        GROUP BY
            source.file_name, source.file_type, source.source_kind,
            source.size_bytes, source.domain, source.dataset_type
    """,
    "numeric_profiles": """
        SELECT
            column_meta.table_name,
            column_meta.column_name,
            column_meta.semantic_type,
            COUNT(cell.numeric_value) AS value_count,
            MIN(cell.numeric_value) AS minimum,
            MAX(cell.numeric_value) AS maximum,
            AVG(cell.numeric_value) AS average,
            SUM(cell.numeric_value) AS total
        FROM analytics_columns AS column_meta
        JOIN analytics_cells AS cell
          ON cell.table_id = column_meta.table_id
         AND cell.column_name = column_meta.column_name
         AND cell.dataset_id = column_meta.dataset_id
         AND cell.owner_user_id = column_meta.owner_user_id
        WHERE column_meta.dataset_id = ?
          AND column_meta.owner_user_id = ?
          AND column_meta.is_sensitive = 0
          AND cell.numeric_value IS NOT NULL
        GROUP BY
            column_meta.table_name, column_meta.column_name,
            column_meta.semantic_type
        ORDER BY value_count DESC, column_meta.column_name
        LIMIT ?
    """,
    "column_quality": """
        SELECT
            column_meta.table_name,
            column_meta.column_name,
            column_meta.data_type,
            column_meta.semantic_type,
            column_meta.is_sensitive,
            column_meta.non_null_count,
            column_meta.unique_count,
            dataset_table.row_count,
            (dataset_table.row_count - column_meta.non_null_count) AS missing_count
        FROM analytics_columns AS column_meta
        JOIN analytics_tables AS dataset_table
          ON dataset_table.table_id = column_meta.table_id
         AND dataset_table.dataset_id = column_meta.dataset_id
         AND dataset_table.owner_user_id = column_meta.owner_user_id
        WHERE column_meta.dataset_id = ? AND column_meta.owner_user_id = ?
        ORDER BY missing_count DESC, column_meta.column_name
        LIMIT ?
    """,
    "top_dimension_values": """
        WITH value_counts AS (
            SELECT
                column_meta.table_name,
                column_meta.column_name,
                cell.text_value,
                COUNT(*) AS occurrence_count
            FROM analytics_columns AS column_meta
            JOIN analytics_cells AS cell
              ON cell.table_id = column_meta.table_id
             AND cell.column_name = column_meta.column_name
             AND cell.dataset_id = column_meta.dataset_id
             AND cell.owner_user_id = column_meta.owner_user_id
            WHERE column_meta.dataset_id = ?
              AND column_meta.owner_user_id = ?
              AND column_meta.is_sensitive = 0
              AND column_meta.semantic_type <> 'identifier'
              AND column_meta.data_type IN ('category', 'boolean')
              AND cell.text_value IS NOT NULL
              AND cell.text_value <> ''
            GROUP BY column_meta.table_name, column_meta.column_name, cell.text_value
        ), ranked_values AS (
            SELECT
                table_name,
                column_name,
                text_value,
                occurrence_count,
                ROW_NUMBER() OVER (
                    PARTITION BY table_name, column_name
                    ORDER BY occurrence_count DESC, text_value
                ) AS value_rank
            FROM value_counts
        )
        SELECT table_name, column_name, text_value, occurrence_count
        FROM ranked_values
        WHERE value_rank <= ?
        ORDER BY occurrence_count DESC, table_name, column_name, value_rank
        LIMIT ?
    """,
    "date_coverage": """
        SELECT
            column_meta.table_name,
            column_meta.column_name,
            MIN(cell.date_value) AS start_date,
            MAX(cell.date_value) AS end_date,
            COUNT(cell.date_value) AS value_count
        FROM analytics_columns AS column_meta
        JOIN analytics_cells AS cell
          ON cell.table_id = column_meta.table_id
         AND cell.column_name = column_meta.column_name
         AND cell.dataset_id = column_meta.dataset_id
         AND cell.owner_user_id = column_meta.owner_user_id
        WHERE column_meta.dataset_id = ?
          AND column_meta.owner_user_id = ?
          AND column_meta.is_sensitive = 0
          AND cell.date_value IS NOT NULL
        GROUP BY column_meta.table_name, column_meta.column_name
        ORDER BY value_count DESC, column_meta.column_name
        LIMIT ?
    """,
}


def _database_url() -> str:
    return os.getenv("DATABASE_URL", "").strip()


def _sqlite_path() -> Path:
    configured = os.getenv("BYIZON_SQLITE_ANALYTICS_PATH", "").strip()
    return Path(configured).expanduser() if configured else DEFAULT_SQLITE_PATH


def warehouse_backend() -> str:
    return "postgresql" if _database_url() else "sqlite-fallback"


def warehouse_configuration() -> dict[str, Any]:
    return {
        "backend": warehouse_backend(),
        "databaseUrlConfigured": bool(_database_url()),
        "queryCatalogVersion": QUERY_CATALOG_VERSION,
        "queryCatalogSize": len(QUERY_CATALOG),
        "modelReceivesRawRows": False,
    }


def _is_sqlite(database: Any) -> bool:
    return isinstance(database, sqlite3.Connection)


def _sql(database: Any, statement: str) -> str:
    return statement if _is_sqlite(database) else statement.replace("?", "%s")


def _execute(database: Any, statement: str, parameters: Sequence[Any] = ()):
    return database.execute(_sql(database, statement), tuple(parameters))


def _executemany(database: Any, statement: str, values: Sequence[Sequence[Any]]):
    if not values:
        return None
    if _is_sqlite(database):
        return database.executemany(statement, values)
    with database.cursor() as cursor:
        cursor.executemany(_sql(database, statement), values)
    return None


def _bulk_insert(
    database: Any,
    table_name: str,
    columns: Sequence[str],
    values: Sequence[Sequence[Any]],
) -> None:
    """Use PostgreSQL COPY for large batches and executemany for local SQLite."""
    if not values:
        return
    allowed_columns = {
        "analytics_rows": ("table_id", "dataset_id", "owner_user_id", "row_number", "row_json"),
        "analytics_cells": (
            "table_id",
            "dataset_id",
            "owner_user_id",
            "row_number",
            "column_name",
            "text_value",
            "numeric_value",
            "date_value",
            "is_null",
        ),
    }
    expected = allowed_columns.get(table_name)
    if expected is None or tuple(columns) != expected:
        raise ValueError("Unsupported SQL warehouse bulk-load target.")
    if _is_sqlite(database):
        placeholders = ", ".join("?" for _ in columns)
        database.executemany(
            f"INSERT INTO {table_name} ({', '.join(columns)}) VALUES ({placeholders})",
            values,
        )
        return
    with database.cursor() as cursor:
        with cursor.copy(f"COPY {table_name} ({', '.join(columns)}) FROM STDIN") as copy:
            for row in values:
                copy.write_row(row)


def _ensure_schema(database: Any) -> None:
    raw_type = "BLOB" if _is_sqlite(database) else "BYTEA"
    real_type = "REAL" if _is_sqlite(database) else "DOUBLE PRECISION"
    statements = [
        f"""
        CREATE TABLE IF NOT EXISTS analytics_sources (
            dataset_id TEXT NOT NULL,
            owner_user_id TEXT NOT NULL,
            file_name TEXT NOT NULL,
            file_type TEXT NOT NULL,
            content_type TEXT,
            source_kind TEXT NOT NULL,
            size_bytes INTEGER NOT NULL,
            sha256 TEXT NOT NULL,
            raw_blob {raw_type} NOT NULL,
            metadata_json TEXT NOT NULL,
            domain TEXT,
            dataset_type TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            PRIMARY KEY (dataset_id, owner_user_id)
        )
        """,
        """
        CREATE TABLE IF NOT EXISTS analytics_tables (
            table_id TEXT PRIMARY KEY,
            dataset_id TEXT NOT NULL,
            owner_user_id TEXT NOT NULL,
            table_name TEXT NOT NULL,
            source_type TEXT NOT NULL,
            row_count INTEGER NOT NULL,
            column_count INTEGER NOT NULL,
            created_at TEXT NOT NULL
        )
        """,
        """
        CREATE TABLE IF NOT EXISTS analytics_columns (
            table_id TEXT NOT NULL,
            dataset_id TEXT NOT NULL,
            owner_user_id TEXT NOT NULL,
            table_name TEXT NOT NULL,
            column_name TEXT NOT NULL,
            column_position INTEGER NOT NULL,
            data_type TEXT NOT NULL,
            semantic_type TEXT NOT NULL,
            is_sensitive INTEGER NOT NULL,
            non_null_count INTEGER NOT NULL,
            unique_count INTEGER NOT NULL,
            PRIMARY KEY (table_id, column_name)
        )
        """,
        """
        CREATE TABLE IF NOT EXISTS analytics_rows (
            table_id TEXT NOT NULL,
            dataset_id TEXT NOT NULL,
            owner_user_id TEXT NOT NULL,
            row_number INTEGER NOT NULL,
            row_json TEXT NOT NULL,
            PRIMARY KEY (table_id, row_number)
        )
        """,
        f"""
        CREATE TABLE IF NOT EXISTS analytics_cells (
            table_id TEXT NOT NULL,
            dataset_id TEXT NOT NULL,
            owner_user_id TEXT NOT NULL,
            row_number INTEGER NOT NULL,
            column_name TEXT NOT NULL,
            text_value TEXT,
            numeric_value {real_type},
            date_value TEXT,
            is_null INTEGER NOT NULL,
            PRIMARY KEY (table_id, row_number, column_name)
        )
        """,
        """
        CREATE TABLE IF NOT EXISTS analytics_query_audit (
            query_run_id TEXT PRIMARY KEY,
            dataset_id TEXT NOT NULL,
            owner_user_id TEXT NOT NULL,
            question_hash TEXT NOT NULL,
            query_ids_json TEXT NOT NULL,
            result_count INTEGER NOT NULL,
            created_at TEXT NOT NULL
        )
        """,
        "CREATE INDEX IF NOT EXISTS idx_analytics_tables_scope ON analytics_tables (dataset_id, owner_user_id)",
        "CREATE INDEX IF NOT EXISTS idx_analytics_columns_scope ON analytics_columns (dataset_id, owner_user_id)",
        "CREATE INDEX IF NOT EXISTS idx_analytics_rows_scope ON analytics_rows (dataset_id, owner_user_id)",
        "CREATE INDEX IF NOT EXISTS idx_analytics_cells_scope ON analytics_cells (dataset_id, owner_user_id, column_name)",
        "CREATE INDEX IF NOT EXISTS idx_analytics_cells_numeric ON analytics_cells (dataset_id, owner_user_id, numeric_value)",
        "CREATE INDEX IF NOT EXISTS idx_analytics_cells_date ON analytics_cells (dataset_id, owner_user_id, date_value)",
    ]
    for statement in statements:
        _execute(database, statement)


@contextmanager
def _database() -> Iterator[Any]:
    url = _database_url()
    if url:
        try:
            import psycopg
            from psycopg.rows import dict_row
        except ImportError as exc:
            raise RuntimeError(
                "DATABASE_URL is configured, but psycopg is not installed. "
                "Install backend requirements before starting the API."
            ) from exc
        database = psycopg.connect(url, row_factory=dict_row, connect_timeout=10)
    else:
        path = _sqlite_path()
        path.parent.mkdir(parents=True, exist_ok=True)
        database = sqlite3.connect(path)
        database.row_factory = sqlite3.Row
        database.execute("PRAGMA foreign_keys = ON")
        database.execute("PRAGMA journal_mode = WAL")
    try:
        _ensure_schema(database)
        database.commit()
        yield database
        database.commit()
    except Exception:
        database.rollback()
        raise
    finally:
        database.close()


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _json_scalar(value: Any) -> Any:
    if value is None:
        return None
    try:
        missing = pd.isna(value)
        if isinstance(missing, bool) and missing:
            return None
    except (TypeError, ValueError):
        pass
    if isinstance(value, (datetime, date, pd.Timestamp)):
        return value.isoformat()
    if hasattr(value, "item"):
        try:
            value = value.item()
        except (TypeError, ValueError):
            pass
    if isinstance(value, float) and not math.isfinite(value):
        return None
    if isinstance(value, (str, int, float, bool)):
        return value
    if isinstance(value, (dict, list, tuple)):
        return json.loads(json.dumps(value, ensure_ascii=True, default=str))
    return str(value)


def _normalized_name(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", value.lower()).strip("_")


def _is_sensitive(column_name: str) -> bool:
    normalized = _normalized_name(column_name)
    return any(hint.replace("-", "_") in normalized for hint in SENSITIVE_COLUMN_HINTS)


def _number(value: Any) -> float | None:
    if value is None or isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        number = float(value)
        return number if math.isfinite(number) else None
    text = str(value).strip()
    if not text:
        return None
    negative = text.startswith("(") and text.endswith(")")
    cleaned = re.sub(r"[^0-9eE+\-.]", "", text)
    if cleaned in {"", "+", "-", "."}:
        return None
    try:
        number = float(cleaned)
    except ValueError:
        return None
    if negative:
        number = -abs(number)
    return number if math.isfinite(number) else None


def _date_value(value: Any) -> str | None:
    if value is None:
        return None
    if isinstance(value, (datetime, date, pd.Timestamp)):
        return value.isoformat()
    try:
        parsed = pd.to_datetime(value, errors="coerce", utc=True)
    except (TypeError, ValueError, OverflowError):
        return None
    if pd.isna(parsed):
        return None
    return parsed.isoformat()


def _column_metadata(column_name: str, values: list[Any]) -> dict[str, Any]:
    non_null = [value for value in values if value is not None and str(value).strip()]
    unique_count = len({json.dumps(value, ensure_ascii=True, sort_keys=True, default=str) for value in non_null})
    sensitive = _is_sensitive(column_name)
    normalized = _normalized_name(column_name)
    id_like = normalized == "id" or normalized.endswith("_id") or "code" in normalized
    date_hint = any(token in normalized for token in ("date", "time", "month", "year", "created", "updated"))
    boolean_values = {str(value).strip().lower() for value in non_null}

    if non_null and boolean_values.issubset({"true", "false", "yes", "no", "0", "1"}):
        data_type = "boolean"
    else:
        numeric_count = sum(_number(value) is not None for value in non_null)
        date_count = sum(_date_value(value) is not None for value in non_null) if date_hint else 0
        ratio_base = max(len(non_null), 1)
        if not id_like and numeric_count / ratio_base >= 0.8:
            data_type = "number"
        elif date_hint and date_count / ratio_base >= 0.7:
            data_type = "datetime"
        elif unique_count <= max(30, int(len(non_null) * 0.2)):
            data_type = "category"
        else:
            data_type = "text"

    semantic_type = {
        "number": "measure",
        "datetime": "time",
        "category": "dimension",
        "boolean": "dimension",
        "text": "text",
    }[data_type]
    if id_like:
        semantic_type = "identifier"
    return {
        "data_type": data_type,
        "semantic_type": semantic_type,
        "is_sensitive": 1 if sensitive else 0,
        "non_null_count": len(non_null),
        "unique_count": unique_count,
    }


def _table_id(dataset_id: str, table_name: str, position: int) -> str:
    digest = hashlib.sha256(f"{dataset_id}:{position}:{table_name}".encode("utf-8")).hexdigest()[:32]
    return f"table_{digest}"


def _delete_dataset(database: Any, dataset_id: str, owner_user_id: str) -> None:
    for table_name in (
        "analytics_query_audit",
        "analytics_cells",
        "analytics_rows",
        "analytics_columns",
        "analytics_tables",
        "analytics_sources",
    ):
        _execute(
            database,
            f"DELETE FROM {table_name} WHERE dataset_id = ? AND owner_user_id = ?",
            (dataset_id, owner_user_id),
        )


def ingest_parsed_dataset(
    *,
    dataset: dict[str, Any],
    content: bytes,
    parsed: dict[str, Any],
) -> dict[str, Any]:
    """Persist every parsed row, then normalize cells for static SQL analysis."""
    dataset_id = str(dataset["datasetId"])
    owner_user_id = str(dataset["ownerUserId"])
    created_at = _utc_now()
    total_rows = 0
    total_columns = 0
    total_cells = 0

    with _database() as database:
        _delete_dataset(database, dataset_id, owner_user_id)
        _execute(
            database,
            """
            INSERT INTO analytics_sources (
                dataset_id, owner_user_id, file_name, file_type, content_type,
                source_kind, size_bytes, sha256, raw_blob, metadata_json,
                domain, dataset_type, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                dataset_id,
                owner_user_id,
                dataset.get("fileName") or parsed.get("file_name") or "uploaded_file",
                parsed.get("file_type") or "unknown",
                dataset.get("contentType") or "application/octet-stream",
                dataset.get("sourceKind") or "manual_upload",
                len(content),
                dataset.get("sha256") or hashlib.sha256(content).hexdigest(),
                content,
                json.dumps(dataset.get("metadata") or {}, ensure_ascii=True, default=str),
                None,
                None,
                created_at,
                created_at,
            ),
        )

        for table_position, parsed_table in enumerate(parsed.get("tables") or [], start=1):
            dataframe = parsed_table.dataframe
            table_name = str(parsed_table.name)
            table_id = _table_id(dataset_id, table_name, table_position)
            row_count = int(len(dataframe))
            column_names = [str(column) for column in dataframe.columns]
            total_rows += row_count
            total_columns += len(column_names)
            _execute(
                database,
                """
                INSERT INTO analytics_tables (
                    table_id, dataset_id, owner_user_id, table_name,
                    source_type, row_count, column_count, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    table_id,
                    dataset_id,
                    owner_user_id,
                    table_name,
                    str(parsed_table.source_type),
                    row_count,
                    len(column_names),
                    created_at,
                ),
            )

            column_values: dict[str, list[Any]] = {}
            column_profiles: dict[str, dict[str, Any]] = {}
            for column_position, column_name in enumerate(column_names):
                values = [_json_scalar(value) for value in dataframe.iloc[:, column_position].tolist()]
                column_values[column_name] = values
                profile = _column_metadata(column_name, values)
                column_profiles[column_name] = profile
                _execute(
                    database,
                    """
                    INSERT INTO analytics_columns (
                        table_id, dataset_id, owner_user_id, table_name,
                        column_name, column_position, data_type, semantic_type,
                        is_sensitive, non_null_count, unique_count
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        table_id,
                        dataset_id,
                        owner_user_id,
                        table_name,
                        column_name,
                        column_position,
                        profile["data_type"],
                        profile["semantic_type"],
                        profile["is_sensitive"],
                        profile["non_null_count"],
                        profile["unique_count"],
                    ),
                )

            row_batch: list[tuple[Any, ...]] = []
            cell_batch: list[tuple[Any, ...]] = []
            for row_index in range(row_count):
                row_number = row_index + 1
                row_payload = {column: column_values[column][row_index] for column in column_names}
                row_batch.append(
                    (
                        table_id,
                        dataset_id,
                        owner_user_id,
                        row_number,
                        json.dumps(row_payload, ensure_ascii=True, default=str),
                    )
                )
                for column_name in column_names:
                    value = row_payload[column_name]
                    profile = column_profiles[column_name]
                    if profile["is_sensitive"] or profile["semantic_type"] in {"identifier", "text"}:
                        continue
                    text_value = None if value is None else str(value).strip()[:2000]
                    numeric_value = _number(value) if profile["data_type"] == "number" else None
                    date_value = _date_value(value) if profile["data_type"] == "datetime" else None
                    total_cells += 1
                    cell_batch.append(
                        (
                            table_id,
                            dataset_id,
                            owner_user_id,
                            row_number,
                            column_name,
                            text_value,
                            numeric_value,
                            date_value,
                            1 if value is None or not str(value).strip() else 0,
                        )
                    )
                if len(row_batch) >= 2000:
                    _bulk_insert(
                        database,
                        "analytics_rows",
                        ("table_id", "dataset_id", "owner_user_id", "row_number", "row_json"),
                        row_batch,
                    )
                    _bulk_insert(
                        database,
                        "analytics_cells",
                        (
                            "table_id", "dataset_id", "owner_user_id", "row_number",
                            "column_name", "text_value", "numeric_value", "date_value", "is_null",
                        ),
                        cell_batch,
                    )
                    row_batch.clear()
                    cell_batch.clear()

            _bulk_insert(
                database,
                "analytics_rows",
                ("table_id", "dataset_id", "owner_user_id", "row_number", "row_json"),
                row_batch,
            )
            _bulk_insert(
                database,
                "analytics_cells",
                (
                    "table_id", "dataset_id", "owner_user_id", "row_number",
                    "column_name", "text_value", "numeric_value", "date_value", "is_null",
                ),
                cell_batch,
            )

        stored_row_count = _execute(
            database,
            """
            SELECT COUNT(*) AS stored_count
            FROM analytics_rows
            WHERE dataset_id = ? AND owner_user_id = ?
            """,
            (dataset_id, owner_user_id),
        ).fetchone()
        verified_rows = int(dict(stored_row_count)["stored_count"] if stored_row_count else 0)
        if verified_rows != total_rows:
            raise ValueError(
                f"SQL warehouse verification failed: expected {total_rows} rows, stored {verified_rows}."
            )

    return {
        "backend": warehouse_backend(),
        "datasetId": dataset_id,
        "databaseFirst": True,
        "fullRowsStored": verified_rows,
        "tableCount": len(parsed.get("tables") or []),
        "columnCount": total_columns,
        "normalizedCellCount": total_cells,
        "bulkLoadMethod": "postgresql-copy" if warehouse_backend() == "postgresql" else "sqlite-executemany",
        "queryCatalogVersion": QUERY_CATALOG_VERSION,
        "prebuiltQueryCount": len(QUERY_CATALOG),
        "rawRowsSentToModel": False,
    }


def finalize_dataset_metadata(dataset_id: str, owner_user_id: str, analysis: dict[str, Any]) -> None:
    with _database() as database:
        _execute(
            database,
            """
            UPDATE analytics_sources
            SET domain = ?, dataset_type = ?, updated_at = ?
            WHERE dataset_id = ? AND owner_user_id = ?
            """,
            (
                str(analysis.get("businessDomain") or "general"),
                str(analysis.get("datasetType") or "structured"),
                _utc_now(),
                dataset_id,
                owner_user_id,
            ),
        )


def _rows_as_dicts(cursor: Any) -> list[dict[str, Any]]:
    return [dict(row) for row in cursor.fetchall()]


def _one_as_dict(cursor: Any) -> dict[str, Any] | None:
    row = cursor.fetchone()
    return dict(row) if row else None


def _round_number(value: Any) -> float | int | None:
    if value is None:
        return None
    number = float(value)
    if not math.isfinite(number):
        return None
    if number.is_integer() and abs(number) < 1_000_000_000_000:
        return int(number)
    return round(number, 4)


def _question_tokens(question: str) -> set[str]:
    return {
        token
        for token in re.findall(r"[a-z0-9]+", question.lower())
        if len(token) > 2
    }


def _relevance(item: dict[str, Any], tokens: set[str]) -> tuple[int, int, str]:
    searchable = f"{item.get('table_name', '')} {item.get('column_name', '')}".lower()
    score = sum(1 for token in tokens if token in searchable)
    count = int(item.get("value_count") or item.get("occurrence_count") or 0)
    return score, count, searchable


def _record_query_audit(
    database: Any,
    dataset_id: str,
    owner_user_id: str,
    question: str,
    query_ids: list[str],
    result_count: int,
) -> str:
    query_run_id = f"sqlq_{uuid4().hex}"
    _execute(
        database,
        """
        INSERT INTO analytics_query_audit (
            query_run_id, dataset_id, owner_user_id, question_hash,
            query_ids_json, result_count, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        (
            query_run_id,
            dataset_id,
            owner_user_id,
            hashlib.sha256(question.encode("utf-8")).hexdigest(),
            json.dumps(query_ids, ensure_ascii=True),
            result_count,
            _utc_now(),
        ),
    )
    return query_run_id


def query_dataset_evidence(
    dataset_id: str,
    owner_user_id: str,
    question: str,
) -> dict[str, Any]:
    """Run the static SQL catalog and return compact, row-free model evidence."""
    query_ids = list(QUERY_CATALOG)
    with _database() as database:
        overview = _one_as_dict(
            _execute(database, QUERY_CATALOG["dataset_overview"], (dataset_id, owner_user_id))
        )
        if not overview:
            return {
                "available": False,
                "reason": "Dataset has not been ingested into the SQL analytics warehouse.",
                "backend": warehouse_backend(),
                "queryCatalogVersion": QUERY_CATALOG_VERSION,
            }
        numeric = _rows_as_dicts(
            _execute(database, QUERY_CATALOG["numeric_profiles"], (dataset_id, owner_user_id, 60))
        )
        quality = _rows_as_dicts(
            _execute(database, QUERY_CATALOG["column_quality"], (dataset_id, owner_user_id, 80))
        )
        dimensions = _rows_as_dicts(
            _execute(database, QUERY_CATALOG["top_dimension_values"], (dataset_id, owner_user_id, 5, 120))
        )
        dates = _rows_as_dicts(
            _execute(database, QUERY_CATALOG["date_coverage"], (dataset_id, owner_user_id, 20))
        )

        tokens = _question_tokens(question)
        numeric.sort(key=lambda item: _relevance(item, tokens), reverse=True)
        quality.sort(key=lambda item: _relevance(item, tokens), reverse=True)
        dimensions.sort(key=lambda item: _relevance(item, tokens), reverse=True)
        dates.sort(key=lambda item: _relevance(item, tokens), reverse=True)
        numeric = numeric[:20]
        quality = quality[:30]
        dimensions = dimensions[:40]
        dates = dates[:10]

        grouped_dimensions: dict[str, dict[str, Any]] = {}
        for item in dimensions:
            key = f"{item['table_name']}.{item['column_name']}"
            group = grouped_dimensions.setdefault(
                key,
                {
                    "table": item["table_name"],
                    "column": item["column_name"],
                    "values": [],
                },
            )
            group["values"].append(
                {"label": item["text_value"], "count": int(item["occurrence_count"])}
            )

        aggregations = [
            {
                "table": item["table_name"],
                "metric": item["column_name"],
                "semanticType": item["semantic_type"],
                "count": int(item["value_count"]),
                "minimum": _round_number(item["minimum"]),
                "maximum": _round_number(item["maximum"]),
                "average": _round_number(item["average"]),
                "total": _round_number(item["total"]),
            }
            for item in numeric
        ]
        quality_items = []
        total_missing = 0
        total_possible = 0
        for item in quality:
            row_count = int(item["row_count"] or 0)
            missing_count = int(item["missing_count"] or 0)
            total_missing += missing_count
            total_possible += row_count
            quality_items.append(
                {
                    "table": item["table_name"],
                    "column": item["column_name"],
                    "type": item["data_type"],
                    "semanticType": item["semantic_type"],
                    "sensitive": bool(item["is_sensitive"]),
                    "missingCount": missing_count,
                    "missingPercent": round((missing_count / max(row_count, 1)) * 100, 2),
                    "uniqueCount": int(item["unique_count"] or 0),
                }
            )

        result_count = len(aggregations) + len(quality_items) + len(dimensions) + len(dates)
        query_run_id = _record_query_audit(
            database,
            dataset_id,
            owner_user_id,
            question,
            query_ids,
            result_count,
        )

    return {
        "available": True,
        "policy": "prebuilt-parameterized-sql-only",
        "backend": warehouse_backend(),
        "dataset": {
            "fileName": overview["file_name"],
            "fileType": overview["file_type"],
            "sourceKind": overview["source_kind"],
            "sizeBytes": int(overview["size_bytes"] or 0),
            "domain": overview["domain"] or "general",
            "datasetType": overview["dataset_type"] or "structured",
            "tableCount": int(overview["table_count"] or 0),
            "rowCount": int(overview["row_count"] or 0),
            "columnCount": int(overview["column_count"] or 0),
        },
        "kpis": aggregations[:8],
        "aggregations": aggregations,
        "topValues": list(grouped_dimensions.values())[:12],
        "timeCoverage": [
            {
                "table": item["table_name"],
                "column": item["column_name"],
                "start": item["start_date"],
                "end": item["end_date"],
                "count": int(item["value_count"] or 0),
            }
            for item in dates
        ],
        "dataQuality": {
            "missingCellCount": total_missing,
            "profiledCellCount": total_possible,
            "completenessPercent": round((1 - total_missing / max(total_possible, 1)) * 100, 2),
            "columns": quality_items,
        },
        "queryAudit": {
            "queryRunId": query_run_id,
            "catalogVersion": QUERY_CATALOG_VERSION,
            "queryIds": query_ids,
            "parameterized": True,
            "bounded": True,
            "resultCount": result_count,
            "rawRowsIncluded": False,
        },
    }


def reassign_dataset_owner(previous_owner_user_id: str, owner_user_id: str) -> int:
    if not previous_owner_user_id or previous_owner_user_id == owner_user_id:
        return 0
    updated = 0
    with _database() as database:
        for table_name in (
            "analytics_query_audit",
            "analytics_cells",
            "analytics_rows",
            "analytics_columns",
            "analytics_tables",
            "analytics_sources",
        ):
            cursor = _execute(
                database,
                f"UPDATE {table_name} SET owner_user_id = ? WHERE owner_user_id = ?",
                (owner_user_id, previous_owner_user_id),
            )
            if table_name == "analytics_sources":
                updated = int(cursor.rowcount or 0)
    return updated
