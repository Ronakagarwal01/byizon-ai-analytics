from __future__ import annotations

import base64
import bcrypt
import hashlib
import hmac
import json
import os
import secrets
import sqlite3
import time
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

from cryptography.hazmat.primitives.ciphers.aead import AESGCM


_DATA_DIR = os.getenv("BYIZON_DATA_DIR", "").strip() or os.path.join(os.path.dirname(__file__), "data")
_DB_PATH = os.path.join(_DATA_DIR, "protected_shares.sqlite3")
_KEY_PATH = os.path.join(_DATA_DIR, "local_share_key.bin")
_IP_ATTEMPTS: dict[str, list[float]] = {}
_ACCESS_SECONDS = 60 * 60


class ShareAccessError(ValueError):
    def __init__(self, message: str, status: int = 400):
        super().__init__(message)
        self.status = status


def _database() -> sqlite3.Connection:
    os.makedirs(_DATA_DIR, exist_ok=True)
    connection = sqlite3.connect(_DB_PATH)
    connection.row_factory = sqlite3.Row
    connection.execute(
        """
        CREATE TABLE IF NOT EXISTS dashboard_shares (
            id TEXT PRIMARY KEY,
            dashboard_session_id TEXT NOT NULL,
            file_name TEXT NOT NULL,
            password_hash BLOB NOT NULL,
            encrypted_payload BLOB NOT NULL,
            payload_nonce BLOB NOT NULL,
            created_by TEXT NOT NULL,
            expires_at TEXT,
            max_attempts INTEGER NOT NULL DEFAULT 5,
            failed_attempts INTEGER NOT NULL DEFAULT 0,
            is_revoked INTEGER NOT NULL DEFAULT 0,
            last_accessed_at TEXT,
            created_at TEXT NOT NULL
        )
        """
    )
    return connection


def _server_key() -> bytes:
    configured = os.getenv("BYIZON_SHARE_ENCRYPTION_KEY", "").strip()
    if configured:
        try:
            key = base64.urlsafe_b64decode(configured + "=" * (-len(configured) % 4))
        except ValueError as exc:
            raise ValueError("BYIZON_SHARE_ENCRYPTION_KEY must be URL-safe base64.") from exc
        if len(key) != 32:
            raise ValueError("BYIZON_SHARE_ENCRYPTION_KEY must decode to exactly 32 bytes.")
        return key
    os.makedirs(_DATA_DIR, exist_ok=True)
    if not os.path.isfile(_KEY_PATH):
        with open(_KEY_PATH, "wb") as handle:
            handle.write(os.urandom(32))
    with open(_KEY_PATH, "rb") as handle:
        key = handle.read()
    if len(key) != 32:
        raise ValueError("Local share encryption key is invalid.")
    return key


def _share_payload(analysis: dict[str, Any]) -> dict[str, Any]:
    blocked = {"rows", "tables", "rawRows", "chatHistory", "columnAggregates", "sessionId"}
    return {key: value for key, value in analysis.items() if key not in blocked}


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def create_protected_share(
    dashboard_session_id: str,
    analysis: dict[str, Any],
    expires_in_days: int = 7,
    created_by: str = "local-owner",
) -> dict[str, Any]:
    if not dashboard_session_id:
        raise ValueError("Dashboard session ID is required.")
    if expires_in_days not in {1, 7, 30}:
        raise ValueError("Link expiry must be 1, 7, or 30 days.")
    share_id = str(uuid.uuid4())
    password = secrets.token_urlsafe(9)
    password_hash = bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt(rounds=12))
    payload = json.dumps(_share_payload(analysis), ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    nonce = os.urandom(12)
    encrypted = AESGCM(_server_key()).encrypt(nonce, payload, share_id.encode("utf-8"))
    now = _utc_now()
    expires_at = now + timedelta(days=expires_in_days)
    with _database() as database:
        database.execute(
            """
            INSERT INTO dashboard_shares(
                id, dashboard_session_id, file_name, password_hash, encrypted_payload,
                payload_nonce, created_by, expires_at, max_attempts, failed_attempts,
                is_revoked, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 5, 0, 0, ?)
            """,
            (
                share_id,
                dashboard_session_id,
                str(analysis.get("fileName") or "Protected analysis"),
                password_hash,
                encrypted,
                nonce,
                created_by,
                expires_at.isoformat(),
                now.isoformat(),
            ),
        )
    # The plain password is intentionally returned once and never stored.
    return {
        "shareId": share_id,
        "fileName": analysis.get("fileName"),
        "password": password,
        "expiresAt": expires_at.isoformat(),
        "protected": True,
    }


def _get_share(share_id: str) -> sqlite3.Row | None:
    with _database() as database:
        return database.execute("SELECT * FROM dashboard_shares WHERE id = ?", (share_id,)).fetchone()


def _validity_error(row: sqlite3.Row | None) -> ShareAccessError | None:
    if not row or row["is_revoked"]:
        return ShareAccessError("Protected report was not found.", 404)
    if row["expires_at"] and datetime.fromisoformat(row["expires_at"]) <= _utc_now():
        return ShareAccessError("This protected link has expired.", 410)
    if row["failed_attempts"] >= row["max_attempts"]:
        return ShareAccessError("This link is locked after too many incorrect attempts.", 429)
    return None


def share_metadata(share_id: str) -> dict[str, Any] | None:
    row = _get_share(share_id)
    if not row or row["is_revoked"]:
        return None
    expired = bool(row["expires_at"] and datetime.fromisoformat(row["expires_at"]) <= _utc_now())
    return {
        "shareId": row["id"],
        "fileName": row["file_name"],
        "createdAt": row["created_at"],
        "expiresAt": row["expires_at"],
        "requiresPassword": True,
        "expired": expired,
        "locked": row["failed_attempts"] >= row["max_attempts"],
    }


def _check_ip_rate_limit(share_id: str, client_key: str) -> None:
    key = f"{share_id}:{client_key}"
    cutoff = time.time() - 60
    attempts = [stamp for stamp in _IP_ATTEMPTS.get(key, []) if stamp >= cutoff]
    if len(attempts) >= 10:
        raise ShareAccessError("Too many requests. Please wait one minute before trying again.", 429)
    attempts.append(time.time())
    _IP_ATTEMPTS[key] = attempts


def verify_share_password(share_id: str, password: str, client_key: str) -> str:
    _check_ip_rate_limit(share_id, client_key)
    row = _get_share(share_id)
    validity_error = _validity_error(row)
    if validity_error:
        raise validity_error
    assert row is not None
    if not bcrypt.checkpw(password.encode("utf-8"), bytes(row["password_hash"])):
        with _database() as database:
            database.execute("UPDATE dashboard_shares SET failed_attempts = failed_attempts + 1 WHERE id = ?", (share_id,))
        raise ShareAccessError("Incorrect report password.", 401)
    now = _utc_now().isoformat()
    with _database() as database:
        database.execute("UPDATE dashboard_shares SET failed_attempts = 0, last_accessed_at = ? WHERE id = ?", (now, share_id))
    return _issue_access_token(share_id)


def access_protected_share(share_id: str, token: str) -> dict[str, Any]:
    token_share_id = _verify_access_token(token)
    if token_share_id != share_id:
        raise ShareAccessError("Protected report access is not authorized.", 401)
    row = _get_share(share_id)
    validity_error = _validity_error(row)
    if validity_error:
        raise validity_error
    assert row is not None
    plaintext = AESGCM(_server_key()).decrypt(
        bytes(row["payload_nonce"]),
        bytes(row["encrypted_payload"]),
        share_id.encode("utf-8"),
    )
    return json.loads(plaintext.decode("utf-8"))


def revoke_share(share_id: str, dashboard_session_id: str) -> bool:
    with _database() as database:
        cursor = database.execute(
            "UPDATE dashboard_shares SET is_revoked = 1 WHERE id = ? AND dashboard_session_id = ?",
            (share_id, dashboard_session_id),
        )
        return cursor.rowcount > 0


def _jwt_secret() -> bytes:
    configured = os.getenv("BYIZON_SHARE_JWT_SECRET", "").encode("utf-8")
    return configured or hashlib.sha256(_server_key() + b":share-jwt").digest()


def _b64(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).rstrip(b"=").decode("ascii")


def _issue_access_token(share_id: str) -> str:
    header = _b64(json.dumps({"alg": "HS256", "typ": "JWT"}, separators=(",", ":")).encode("utf-8"))
    payload = _b64(json.dumps({"shareId": share_id, "exp": int(time.time()) + _ACCESS_SECONDS}, separators=(",", ":")).encode("utf-8"))
    signing_input = f"{header}.{payload}".encode("ascii")
    signature = _b64(hmac.new(_jwt_secret(), signing_input, hashlib.sha256).digest())
    return f"{header}.{payload}.{signature}"


def _verify_access_token(token: str) -> str:
    try:
        header, payload, signature = token.split(".")
        signing_input = f"{header}.{payload}".encode("ascii")
        expected = _b64(hmac.new(_jwt_secret(), signing_input, hashlib.sha256).digest())
        if not hmac.compare_digest(signature, expected):
            raise ValueError
        claims = json.loads(base64.urlsafe_b64decode(payload + "=" * (-len(payload) % 4)))
        if int(claims.get("exp", 0)) <= int(time.time()):
            raise ValueError
        return str(claims["shareId"])
    except (ValueError, KeyError, json.JSONDecodeError):
        raise ShareAccessError("Protected report access has expired. Enter the password again.", 401) from None


def cookie_name() -> str:
    return "dashboard_access"


def access_cookie(token: str, secure: bool) -> str:
    # Studio planning is also a protected API operation, so the HttpOnly token
    # must reach both /api/shares and /api/dashboard-studio endpoints.
    parts = [f"{cookie_name()}={token}", "Path=/api", f"Max-Age={_ACCESS_SECONDS}", "HttpOnly", "SameSite=Strict"]
    if secure:
        parts.append("Secure")
    return "; ".join(parts)


def cookie_token(cookie_header: str) -> str:
    for item in cookie_header.split(";"):
        key, separator, value = item.strip().partition("=")
        if separator and key == cookie_name():
            return value
    return ""
