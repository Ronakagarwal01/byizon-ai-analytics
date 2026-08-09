from __future__ import annotations

import base64
import hashlib
import hmac
import os
import secrets
import time
from http.cookies import SimpleCookie
from pathlib import Path


COOKIE_NAME = "byizon_workspace"
DATA_DIR = Path(os.getenv("BYIZON_DATA_DIR", "")).expanduser() if os.getenv("BYIZON_DATA_DIR", "").strip() else Path(__file__).resolve().parent / "data"
LOCAL_SECRET_PATH = DATA_DIR / "workspace_session.key"
MAX_AGE_SECONDS = 60 * 60 * 24 * 365


def _secret() -> bytes:
    configured = os.getenv("BYIZON_SESSION_SECRET", "").strip()
    if configured:
        return hashlib.sha256(configured.encode("utf-8")).digest()
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    if LOCAL_SECRET_PATH.exists():
        value = LOCAL_SECRET_PATH.read_bytes()
        if len(value) >= 32:
            return value
    value = secrets.token_bytes(32)
    LOCAL_SECRET_PATH.write_bytes(value)
    return value


def _encode(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")


def _sign(workspace_id: str, issued_at: int) -> str:
    payload = f"{workspace_id}.{issued_at}".encode("utf-8")
    signature = _encode(hmac.new(_secret(), payload, hashlib.sha256).digest())
    return f"{workspace_id}.{issued_at}.{signature}"


def google_workspace_id(google_subject: str) -> str:
    """Create a stable, non-reversible Byizon identity from Google's verified subject ID."""
    subject = str(google_subject or "").strip()
    if not subject:
        raise ValueError("Google account identity is missing.")
    digest = hmac.new(_secret(), f"google:{subject}".encode("utf-8"), hashlib.sha256).hexdigest()
    return f"usr_g_{digest[:32]}"


def workspace_cookie_value(workspace_id: str) -> str:
    if not str(workspace_id or "").startswith("usr_"):
        raise ValueError("Invalid Byizon workspace identity.")
    return _sign(workspace_id, int(time.time()))


def _verify(value: str) -> str | None:
    try:
        workspace_id, issued_raw, signature = value.split(".", 2)
        issued_at = int(issued_raw)
    except (ValueError, TypeError):
        return None
    if not workspace_id.startswith("usr_") or time.time() - issued_at > MAX_AGE_SECONDS:
        return None
    expected = _sign(workspace_id, issued_at).rsplit(".", 1)[-1]
    return workspace_id if hmac.compare_digest(signature, expected) else None


def resolve_workspace(cookie_header: str) -> tuple[str, str | None]:
    cookies = SimpleCookie()
    try:
        cookies.load(cookie_header or "")
    except Exception:
        cookies = SimpleCookie()
    existing = cookies.get(COOKIE_NAME)
    workspace_id = _verify(existing.value) if existing else None
    if workspace_id:
        return workspace_id, None
    workspace_id = f"usr_{secrets.token_hex(12)}"
    return workspace_id, _sign(workspace_id, int(time.time()))


def session_cookie(value: str, secure: bool = False) -> str:
    parts = [
        f"{COOKIE_NAME}={value}",
        "Path=/",
        f"Max-Age={MAX_AGE_SECONDS}",
        "HttpOnly",
        "SameSite=Lax",
    ]
    if secure:
        parts.append("Secure")
    return "; ".join(parts)


def clear_session_cookie(secure: bool = False) -> str:
    parts = [
        f"{COOKIE_NAME}=",
        "Path=/",
        "Max-Age=0",
        "HttpOnly",
        "SameSite=Lax",
    ]
    if secure:
        parts.append("Secure")
    return "; ".join(parts)
