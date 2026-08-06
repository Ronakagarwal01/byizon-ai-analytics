from __future__ import annotations

import csv
import io
import json
import re
import sqlite3
import tempfile
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import pandas as pd


SUPPORTED_EXTENSIONS = {
    ".csv", ".tsv", ".xlsx", ".xls", ".json", ".pdf", ".txt", ".log", ".sql",
    ".sqlite", ".sqlite3", ".db",
}


@dataclass
class ParsedTable:
    name: str
    dataframe: pd.DataFrame
    source_type: str
    warnings: list[str] = field(default_factory=list)


def detect_file_type(file_name: str) -> str:
    ext = Path(file_name).suffix.lower()
    if ext not in SUPPORTED_EXTENSIONS:
        raise ValueError(
            f"Unsupported file format '{ext or 'unknown'}'. Supported: "
            "CSV, TSV, Excel, JSON, PDF, TXT, SQL, SQLite database exports."
        )
    return ext


def _clean_columns(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    columns: list[str] = []
    seen: dict[str, int] = {}
    for index, col in enumerate(df.columns):
        name = str(col).strip() if str(col).strip() else f"column_{index + 1}"
        name = re.sub(r"\s+", " ", name)
        if name in seen:
            seen[name] += 1
            name = f"{name}_{seen[name]}"
        else:
            seen[name] = 1
        columns.append(name)
    df.columns = columns
    df = df.dropna(axis=0, how="all").dropna(axis=1, how="all")
    return df.fillna("")


def _table_from_dataframe(name: str, df: pd.DataFrame, source_type: str, warnings: list[str] | None = None) -> ParsedTable | None:
    cleaned = _clean_columns(df)
    if cleaned.empty or len(cleaned.columns) == 0:
        return None
    return ParsedTable(name=name, dataframe=cleaned, source_type=source_type, warnings=warnings or [])


def _looks_like_presentation_sheet(sheet_name: str, df: pd.DataFrame) -> bool:
    """Skip Excel dashboard/report sheets that are visual layouts, not source tables."""
    if df.empty:
        return True
    lower_name = sheet_name.lower()
    columns = [str(column).lower() for column in df.columns]
    unnamed_ratio = sum(column.startswith("unnamed") for column in columns) / max(len(columns), 1)
    empty_ratio = df.replace("", pd.NA).isna().sum().sum() / max(len(df) * len(df.columns), 1)
    presentation_name = any(token in lower_name for token in ["dashboard", "report", "summary", "pivot", "chart"])
    if presentation_name and (unnamed_ratio >= 0.35 or empty_ratio >= 0.25):
        return True
    if len(df) < 5 and unnamed_ratio >= 0.5:
        return True
    return False


def _parse_csv_like(file_name: str, content: bytes, sep: str | None = None) -> list[ParsedTable]:
    text = content.decode("utf-8-sig", errors="replace")
    if sep is None:
        sample = text[:4096]
        try:
            dialect = csv.Sniffer().sniff(sample, delimiters=",;\t|")
            sep = dialect.delimiter
        except csv.Error:
            sep = "\t" if Path(file_name).suffix.lower() == ".tsv" else ","
    df = pd.read_csv(io.StringIO(text), sep=sep, engine="python")
    table = _table_from_dataframe(Path(file_name).stem or "table", df, "csv")
    return [table] if table else []


def _parse_excel(file_name: str, content: bytes) -> list[ParsedTable]:
    warnings: list[str] = []
    try:
        workbook = pd.ExcelFile(io.BytesIO(content))
    except ImportError as exc:
        raise ValueError(
            "Excel parsing needs the Python package 'openpyxl' for .xlsx files. "
            "Install it with: python -m pip install openpyxl"
        ) from exc

    tables: list[ParsedTable] = []
    for sheet_name in workbook.sheet_names:
        try:
            df = workbook.parse(sheet_name=sheet_name)
            if _looks_like_presentation_sheet(sheet_name, df):
                warnings.append(f"Sheet '{sheet_name}' looks like a dashboard/report layout and was skipped.")
                continue
            table = _table_from_dataframe(sheet_name, df, "excel", warnings)
            if table:
                tables.append(table)
        except Exception as exc:  # keep other sheets analyzable
            warnings.append(f"Sheet '{sheet_name}' could not be parsed: {exc}")
    return tables


def _dataframes_from_json_payload(payload: Any, base_name: str) -> list[ParsedTable]:
    tables: list[ParsedTable] = []

    if isinstance(payload, list):
        df = pd.json_normalize(payload)
        table = _table_from_dataframe(base_name, df, "json")
        return [table] if table else []

    if isinstance(payload, dict):
        list_children = {k: v for k, v in payload.items() if isinstance(v, list)}
        if list_children:
            for key, value in list_children.items():
                df = pd.json_normalize(value)
                table = _table_from_dataframe(str(key), df, "json")
                if table:
                    tables.append(table)
            scalar_payload = {k: v for k, v in payload.items() if not isinstance(v, (list, dict))}
            if scalar_payload:
                table = _table_from_dataframe("metadata", pd.DataFrame([scalar_payload]), "json")
                if table:
                    tables.append(table)
            return tables

        df = pd.json_normalize(payload)
        table = _table_from_dataframe(base_name, df, "json")
        return [table] if table else []

    table = _table_from_dataframe(base_name, pd.DataFrame({"value": [payload]}), "json")
    return [table] if table else []


def _parse_json(file_name: str, content: bytes) -> list[ParsedTable]:
    text = content.decode("utf-8-sig", errors="replace")
    payload = json.loads(text)
    return _dataframes_from_json_payload(payload, Path(file_name).stem or "json")


def _parse_pdf(file_name: str, content: bytes) -> list[ParsedTable]:
    try:
        from pypdf import PdfReader
    except ImportError as exc:
        raise ValueError("PDF parsing needs the Python package 'pypdf'.") from exc

    reader = PdfReader(io.BytesIO(content))
    rows: list[dict[str, Any]] = []
    for page_index, page in enumerate(reader.pages, start=1):
        text = page.extract_text() or ""
        for line_index, line in enumerate(text.splitlines(), start=1):
            cleaned = line.strip()
            if cleaned:
                rows.append({"page": page_index, "line_number": line_index, "text": cleaned})

    if not rows:
        raise ValueError("No extractable text was found in the PDF. Scanned PDFs need OCR before analysis.")

    text_blob = "\n".join(row["text"] for row in rows)
    parsed_tables: list[ParsedTable] = []
    for delimiter in [",", "\t", "|"]:
        candidate_lines = [line for line in text_blob.splitlines() if delimiter in line]
        if len(candidate_lines) >= 3:
            try:
                df = pd.read_csv(io.StringIO("\n".join(candidate_lines)), sep=delimiter, engine="python")
                table = _table_from_dataframe("pdf_extracted_table", df, "pdf")
                if table and len(table.dataframe.columns) > 1:
                    parsed_tables.append(table)
                    break
            except Exception:
                pass

    text_table = _table_from_dataframe(Path(file_name).stem or "pdf_text", pd.DataFrame(rows), "pdf")
    return parsed_tables + ([text_table] if text_table else [])


def _parse_text(file_name: str, content: bytes) -> list[ParsedTable]:
    text = content.decode("utf-8-sig", errors="replace")
    warnings: list[str] = []
    for delimiter in [",", "\t", "|", ";"]:
        if text.count(delimiter) >= 3:
            try:
                df = pd.read_csv(io.StringIO(text), sep=delimiter, engine="python")
                if len(df.columns) > 1 and len(df) > 0:
                    table = _table_from_dataframe(Path(file_name).stem or "text_table", df, "text", warnings)
                    return [table] if table else []
            except Exception:
                pass

    rows = [{"line_number": index + 1, "text": line.strip()} for index, line in enumerate(text.splitlines()) if line.strip()]
    if not rows:
        raise ValueError("Text file has no readable content.")
    table = _table_from_dataframe(Path(file_name).stem or "text_lines", pd.DataFrame(rows), "text", warnings)
    return [table] if table else []


def _parse_sql_inserts(file_name: str, content: bytes) -> list[ParsedTable]:
    text = content.decode("utf-8-sig", errors="replace")
    insert_pattern = re.compile(
        r"INSERT\s+INTO\s+[`\"]?([\w.\-]+)[`\"]?\s*(?:\((.*?)\))?\s*VALUES\s*(.*?);",
        re.IGNORECASE | re.DOTALL,
    )
    grouped: dict[str, list[list[str]]] = {}
    columns: dict[str, list[str]] = {}

    for match in insert_pattern.finditer(text):
        table_name = match.group(1)
        col_blob = match.group(2)
        values_blob = match.group(3)
        if col_blob:
            columns[table_name] = [c.strip(" `\"") for c in col_blob.split(",")]
        for tuple_blob in re.findall(r"\((.*?)\)", values_blob, flags=re.DOTALL):
            reader = csv.reader([tuple_blob], quotechar="'", escapechar="\\", skipinitialspace=True)
            grouped.setdefault(table_name, []).append(next(reader))

    tables: list[ParsedTable] = []
    for table_name, rows in grouped.items():
        width = max(len(row) for row in rows)
        col_names = columns.get(table_name) or [f"column_{i + 1}" for i in range(width)]
        normalized = [row + [""] * (len(col_names) - len(row)) for row in rows]
        table = _table_from_dataframe(table_name, pd.DataFrame(normalized, columns=col_names), "sql")
        if table:
            tables.append(table)

    if tables:
        return tables
    return _parse_text(file_name, content)


def _parse_sqlite(file_name: str, content: bytes) -> list[ParsedTable]:
    temp_path: str | None = None
    try:
        # Windows prevents SQLite from reopening a NamedTemporaryFile while its
        # original handle is still open, so close it before connecting.
        with tempfile.NamedTemporaryFile(delete=False, suffix=Path(file_name).suffix) as tmp:
            tmp.write(content)
            temp_path = tmp.name
        conn = sqlite3.connect(temp_path)
        try:
            table_names = pd.read_sql_query(
                "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
                conn,
            )["name"].tolist()
            tables: list[ParsedTable] = []
            for table_name in table_names:
                df = pd.read_sql_query(f'SELECT * FROM "{table_name}"', conn)
                table = _table_from_dataframe(table_name, df, "sqlite")
                if table:
                    tables.append(table)
            return tables
        finally:
            conn.close()
    finally:
        if temp_path:
            Path(temp_path).unlink(missing_ok=True)


def parse_file(file_name: str, content: bytes) -> dict[str, Any]:
    ext = detect_file_type(file_name)
    if ext == ".csv":
        tables = _parse_csv_like(file_name, content)
    elif ext == ".tsv":
        tables = _parse_csv_like(file_name, content, sep="\t")
    elif ext in {".xlsx", ".xls"}:
        tables = _parse_excel(file_name, content)
    elif ext == ".json":
        tables = _parse_json(file_name, content)
    elif ext == ".pdf":
        tables = _parse_pdf(file_name, content)
    elif ext in {".txt", ".log"}:
        tables = _parse_text(file_name, content)
    elif ext == ".sql":
        tables = _parse_sql_inserts(file_name, content)
    elif ext in {".sqlite", ".sqlite3", ".db"}:
        tables = _parse_sqlite(file_name, content)
    else:
        raise ValueError(f"Unsupported file type: {ext}")

    if not tables:
        raise ValueError("No analyzable table was found in the uploaded file.")

    primary = max(tables, key=lambda table: len(table.dataframe) * max(len(table.dataframe.columns), 1))
    return {
        "file_name": file_name,
        "file_type": ext.lstrip("."),
        "tables": tables,
        "primary_table_name": primary.name,
        "warnings": [warning for table in tables for warning in table.warnings],
    }
