from __future__ import annotations

import base64
import json
import os
import sqlite3
from pathlib import Path
from typing import Any

from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.exceptions import InvalidTag


DATA_DIR = Path(os.getenv("BYIZON_DATA_DIR", "")).expanduser() if os.getenv("BYIZON_DATA_DIR", "").strip() else Path(__file__).resolve().parent / "data"
DATABASE_PATH = DATA_DIR / "connections.sqlite3"
LOCAL_KEY_PATH = DATA_DIR / "connector_encryption.key"


def _encryption_key() -> bytes:
    configured = os.getenv("BYIZON_CONNECTOR_ENCRYPTION_KEY", "").strip()
    if configured:
        try:
            key = base64.urlsafe_b64decode(configured.encode("ascii"))
        except (ValueError, UnicodeEncodeError) as exc:
            raise ValueError("BYIZON_CONNECTOR_ENCRYPTION_KEY must be URL-safe base64.") from exc
        if len(key) != 32:
            raise ValueError("BYIZON_CONNECTOR_ENCRYPTION_KEY must decode to exactly 32 bytes.")
        return key

    DATA_DIR.mkdir(parents=True, exist_ok=True)
    if LOCAL_KEY_PATH.exists():
        key = LOCAL_KEY_PATH.read_bytes()
        if len(key) != 32:
            raise ValueError("The local connector encryption key is invalid.")
        return key
    key = AESGCM.generate_key(bit_length=256)
    LOCAL_KEY_PATH.write_bytes(key)
    return key


def _database() -> sqlite3.Connection:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    database = sqlite3.connect(DATABASE_PATH)
    database.execute(
        """
        CREATE TABLE IF NOT EXISTS connections (
            connection_id TEXT PRIMARY KEY,
            public_json TEXT NOT NULL,
            token_nonce BLOB,
            token_ciphertext BLOB,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
        """
    )
    database.execute(
        """
        CREATE TABLE IF NOT EXISTS owner_aliases (
            alias_owner_id TEXT PRIMARY KEY,
            canonical_owner_id TEXT NOT NULL,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
        """
    )
    database.commit()
    return database


def load_connections() -> tuple[dict[str, dict[str, Any]], dict[str, dict[str, Any]]]:
    connections: dict[str, dict[str, Any]] = {}
    tokens: dict[str, dict[str, Any]] = {}
    cipher = AESGCM(_encryption_key())
    with _database() as database:
        rows = database.execute(
            "SELECT connection_id, public_json, token_nonce, token_ciphertext FROM connections"
        ).fetchall()
    for connection_id, public_json, nonce, ciphertext in rows:
        try:
            connection = json.loads(public_json)
            if isinstance(connection, dict):
                connections[connection_id] = connection
            if nonce is not None and ciphertext is not None:
                raw = cipher.decrypt(nonce, ciphertext, connection_id.encode("utf-8"))
                token = json.loads(raw.decode("utf-8"))
                if isinstance(token, dict):
                    tokens[connection_id] = token
        except (ValueError, TypeError, json.JSONDecodeError, InvalidTag):
            # One unreadable record must not stop the rest of the workspace loading.
            continue
    return connections, tokens


def save_connection(connection: dict[str, Any], token: dict[str, Any] | None = None) -> None:
    connection_id = str(connection["connectionId"])
    nonce = None
    ciphertext = None
    if token is not None:
        nonce = os.urandom(12)
        raw = json.dumps(token, ensure_ascii=False).encode("utf-8")
        ciphertext = AESGCM(_encryption_key()).encrypt(nonce, raw, connection_id.encode("utf-8"))
    public_json = json.dumps(connection, ensure_ascii=False)
    with _database() as database:
        database.execute(
            """
            INSERT INTO connections (connection_id, public_json, token_nonce, token_ciphertext, updated_at)
            VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(connection_id) DO UPDATE SET
                public_json = excluded.public_json,
                token_nonce = COALESCE(excluded.token_nonce, connections.token_nonce),
                token_ciphertext = COALESCE(excluded.token_ciphertext, connections.token_ciphertext),
                updated_at = CURRENT_TIMESTAMP
            """,
            (connection_id, public_json, nonce, ciphertext),
        )
        database.commit()


def delete_connection(connection_id: str) -> None:
    with _database() as database:
        database.execute("DELETE FROM connections WHERE connection_id = ?", (connection_id,))
        database.commit()


def load_owner_aliases() -> dict[str, str]:
    with _database() as database:
        rows = database.execute(
            "SELECT alias_owner_id, canonical_owner_id FROM owner_aliases"
        ).fetchall()
    return {
        str(alias_owner_id): str(canonical_owner_id)
        for alias_owner_id, canonical_owner_id in rows
        if alias_owner_id and canonical_owner_id
    }


def save_owner_alias(alias_owner_id: str, canonical_owner_id: str) -> None:
    alias = str(alias_owner_id or "").strip()
    canonical = str(canonical_owner_id or "").strip()
    if not alias or not canonical or alias == canonical:
        return
    with _database() as database:
        database.execute(
            """
            INSERT INTO owner_aliases (alias_owner_id, canonical_owner_id, updated_at)
            VALUES (?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(alias_owner_id) DO UPDATE SET
                canonical_owner_id = excluded.canonical_owner_id,
                updated_at = CURRENT_TIMESTAMP
            """,
            (alias, canonical),
        )
        database.commit()
