from __future__ import annotations

import os
import re
import secrets
import smtplib
import sqlite3
from contextlib import closing
from datetime import datetime, timezone
from email.message import EmailMessage
from typing import Any

import bcrypt


_DATA_DIR = os.getenv("BYIZON_DATA_DIR", "").strip() or os.path.join(os.path.dirname(__file__), "data")
_DB_PATH = os.path.join(_DATA_DIR, "workspace_accounts.sqlite3")
_OUTBOX_PATH = os.path.join(_DATA_DIR, "email_outbox.jsonl")
_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
_SPECIAL_RE = re.compile(r"[^A-Za-z0-9]")


class AccountExistsError(ValueError):
    pass


class InvalidCredentialsError(ValueError):
    pass


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _database() -> sqlite3.Connection:
    os.makedirs(_DATA_DIR, exist_ok=True)
    connection = sqlite3.connect(_DB_PATH)
    connection.row_factory = sqlite3.Row
    connection.execute(
        """
        CREATE TABLE IF NOT EXISTS workspace_accounts (
            user_id TEXT PRIMARY KEY,
            first_name TEXT NOT NULL,
            last_name TEXT NOT NULL,
            work_email TEXT NOT NULL UNIQUE,
            company_name TEXT NOT NULL,
            phone_country_code TEXT NOT NULL,
            phone_number TEXT NOT NULL,
            password_hash BLOB NOT NULL,
            terms_accepted INTEGER NOT NULL DEFAULT 0,
            provider TEXT NOT NULL DEFAULT 'password',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )
        """
    )
    existing_columns = {row["name"] for row in connection.execute("PRAGMA table_info(workspace_accounts)").fetchall()}
    if "email_verified" not in existing_columns:
        connection.execute("ALTER TABLE workspace_accounts ADD COLUMN email_verified INTEGER NOT NULL DEFAULT 0")
    if "email_verified_at" not in existing_columns:
        connection.execute("ALTER TABLE workspace_accounts ADD COLUMN email_verified_at TEXT")
    connection.execute("CREATE INDEX IF NOT EXISTS idx_workspace_accounts_email ON workspace_accounts(work_email)")
    connection.execute(
        """
        CREATE TABLE IF NOT EXISTS workspace_email_otps (
            work_email TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            otp_hash BLOB NOT NULL,
            attempts INTEGER NOT NULL DEFAULT 0,
            expires_at TEXT NOT NULL,
            created_at TEXT NOT NULL
        )
        """
    )
    connection.execute(
        """
        CREATE TABLE IF NOT EXISTS workspace_onboarding_company (
            user_id TEXT PRIMARY KEY,
            company_name TEXT NOT NULL,
            industry TEXT NOT NULL,
            company_size TEXT NOT NULL,
            website TEXT,
            company_description TEXT,
            logo_data_url TEXT,
            default_currency TEXT NOT NULL,
            time_zone TEXT NOT NULL,
            accuracy_confirmed INTEGER NOT NULL DEFAULT 0,
            skipped INTEGER NOT NULL DEFAULT 0,
            step INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )
        """
    )
    connection.execute(
        """
        CREATE TABLE IF NOT EXISTS workspace_team_invites (
            invite_id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            email TEXT NOT NULL,
            role TEXT NOT NULL,
            personal_message TEXT,
            status TEXT NOT NULL DEFAULT 'pending',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            UNIQUE(user_id, email)
        )
        """
    )
    connection.execute("CREATE INDEX IF NOT EXISTS idx_workspace_team_invites_user ON workspace_team_invites(user_id, created_at)")
    connection.execute(
        """
        CREATE TABLE IF NOT EXISTS workspace_onboarding_ai (
            user_id TEXT PRIMARY KEY,
            business_type TEXT NOT NULL,
            primary_department TEXT NOT NULL,
            industry TEXT NOT NULL,
            preferred_language TEXT NOT NULL,
            time_zone TEXT NOT NULL,
            currency TEXT NOT NULL,
            skipped INTEGER NOT NULL DEFAULT 0,
            step INTEGER NOT NULL DEFAULT 4,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )
        """
    )
    return connection


def _clean(value: Any) -> str:
    return str(value or "").strip()


def _validate_password(password: str) -> None:
    if len(password) < 8:
        raise ValueError("Password must be at least 8 characters.")
    if not re.search(r"[A-Z]", password):
        raise ValueError("Password must include one uppercase letter.")
    if not re.search(r"[a-z]", password):
        raise ValueError("Password must include one lowercase letter.")
    if not re.search(r"\d", password):
        raise ValueError("Password must include one number.")
    if not _SPECIAL_RE.search(password):
        raise ValueError("Password must include one special character.")


def _otp_code() -> str:
    return f"{secrets.randbelow(1_000_000):06d}"


def _deliver_otp(work_email: str, otp: str, first_name: str) -> dict[str, Any]:
    subject = "Your Byizon verification OTP"
    body = (
        f"Hi {first_name or 'there'},\n\n"
        f"Your Byizon email verification OTP is {otp}.\n"
        "It expires in 10 minutes. If you did not create a Byizon account, ignore this email.\n\n"
        "— Byizon"
    )
    smtp_host = os.getenv("BYIZON_SMTP_HOST", "").strip()
    smtp_from = os.getenv("BYIZON_SMTP_FROM", "").strip() or os.getenv("BYIZON_SMTP_USER", "").strip()
    if smtp_host and smtp_from:
        port = int(os.getenv("BYIZON_SMTP_PORT", "587"))
        user = os.getenv("BYIZON_SMTP_USER", "").strip()
        password = os.getenv("BYIZON_SMTP_PASSWORD", "")
        message = EmailMessage()
        message["Subject"] = subject
        message["From"] = smtp_from
        message["To"] = work_email
        message.set_content(body)
        with smtplib.SMTP(smtp_host, port, timeout=20) as smtp:
            if os.getenv("BYIZON_SMTP_TLS", "1") != "0":
                smtp.starttls()
            if user and password:
                smtp.login(user, password)
            smtp.send_message(message)
        return {"sent": True, "channel": "smtp"}

    os.makedirs(_DATA_DIR, exist_ok=True)
    import json as _json
    with open(_OUTBOX_PATH, "a", encoding="utf-8") as handle:
        handle.write(_json.dumps({
            "to": work_email,
            "subject": subject,
            "otp": otp,
            "createdAt": _utc_now(),
            "note": "Configure BYIZON_SMTP_HOST/BYIZON_SMTP_FROM to send real email.",
        }) + "\n")
    return {"sent": False, "channel": "local_outbox", "outboxPath": _OUTBOX_PATH}


def _safe_account(row: sqlite3.Row) -> dict[str, Any]:
    display_name = f"{row['first_name']} {row['last_name']}".strip()
    return {
        "authenticated": True,
        "provider": row["provider"],
        "workspaceUserId": row["user_id"],
        "displayName": display_name or row["work_email"],
        "firstName": row["first_name"],
        "lastName": row["last_name"],
        "email": row["work_email"],
        "companyName": row["company_name"],
        "phoneCountryCode": row["phone_country_code"],
        "phoneNumber": row["phone_number"],
        "emailVerified": bool(row["email_verified"]),
        "createdAt": row["created_at"],
    }


def _issue_email_otp(db: sqlite3.Connection, user_id: str, work_email: str, first_name: str) -> dict[str, Any]:
    otp = _otp_code()
    now = _utc_now()
    expires_at = datetime.fromtimestamp(datetime.now(timezone.utc).timestamp() + 600, timezone.utc).isoformat()
    otp_hash = bcrypt.hashpw(otp.encode("utf-8"), bcrypt.gensalt(rounds=12))
    db.execute(
        """
        INSERT INTO workspace_email_otps (work_email, user_id, otp_hash, attempts, expires_at, created_at)
        VALUES (?, ?, ?, 0, ?, ?)
        ON CONFLICT(work_email) DO UPDATE SET
            user_id=excluded.user_id,
            otp_hash=excluded.otp_hash,
            attempts=0,
            expires_at=excluded.expires_at,
            created_at=excluded.created_at
        """,
        (work_email, user_id, sqlite3.Binary(otp_hash), expires_at, now),
    )
    return _deliver_otp(work_email, otp, first_name)


def create_account(payload: dict[str, Any]) -> dict[str, Any]:
    first_name = _clean(payload.get("firstName"))
    last_name = _clean(payload.get("lastName"))
    work_email = _clean(payload.get("workEmail")).lower()
    company_name = _clean(payload.get("companyName"))
    phone_country_code = _clean(payload.get("phoneCountryCode")) or "+91"
    phone_number = _clean(payload.get("phoneNumber"))
    password = str(payload.get("password") or "")
    terms_accepted = bool(payload.get("termsAccepted"))

    required = {
        "First name": first_name,
        "Last name": last_name,
        "Work email": work_email,
        "Company name": company_name,
        "Phone number": phone_number,
    }
    missing = [label for label, value in required.items() if not value]
    if missing:
        raise ValueError(f"{', '.join(missing)} required.")
    if not _EMAIL_RE.match(work_email):
        raise ValueError("Enter a valid work email.")
    if not re.fullmatch(r"\+\d{1,4}", phone_country_code):
        raise ValueError("Select a valid country code.")
    if len(re.sub(r"\D", "", phone_number)) < 7:
        raise ValueError("Enter a valid phone number.")
    _validate_password(password)
    if not terms_accepted:
        raise ValueError("Terms of Service and Privacy Policy consent is required.")

    now = _utc_now()
    user_id = f"usr_acc_{secrets.token_hex(12)}"
    password_hash = bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt(rounds=12))

    with closing(_database()) as db:
        try:
            db.execute(
                """
                INSERT INTO workspace_accounts (
                    user_id, first_name, last_name, work_email, company_name,
                    phone_country_code, phone_number, password_hash, terms_accepted,
                    provider, created_at, updated_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'password', ?, ?)
                """,
                (
                    user_id,
                    first_name,
                    last_name,
                    work_email,
                    company_name,
                    phone_country_code,
                    phone_number,
                    sqlite3.Binary(password_hash),
                    1,
                    now,
                    now,
                ),
            )
            db.commit()
        except sqlite3.IntegrityError as exc:
            raise AccountExistsError("An account already exists with this work email.") from exc
        delivery = _issue_email_otp(db, user_id, work_email, first_name)
        db.commit()
        row = db.execute("SELECT * FROM workspace_accounts WHERE user_id = ?", (user_id,)).fetchone()
    return {**_safe_account(row), "otpDelivery": delivery}


def account_profile(user_id: str) -> dict[str, Any] | None:
    user_id = _clean(user_id)
    if not user_id:
        return None
    with closing(_database()) as db:
        row = db.execute("SELECT * FROM workspace_accounts WHERE user_id = ?", (user_id,)).fetchone()
    return _safe_account(row) if row else None


def authenticate_account(work_email: str, password: str) -> dict[str, Any]:
    email = _clean(work_email).lower()
    if not _EMAIL_RE.match(email):
        raise InvalidCredentialsError("Invalid email or password.")
    if not password:
        raise InvalidCredentialsError("Invalid email or password.")

    with closing(_database()) as db:
        row = db.execute("SELECT * FROM workspace_accounts WHERE work_email = ?", (email,)).fetchone()

    if not row or not bcrypt.checkpw(password.encode("utf-8"), bytes(row["password_hash"])):
        raise InvalidCredentialsError("Invalid email or password.")
    if not row["email_verified"]:
        raise InvalidCredentialsError("Please verify your email before logging in.")
    return _safe_account(row)


def resend_email_otp(work_email: str) -> dict[str, Any]:
    email = _clean(work_email).lower()
    if not _EMAIL_RE.match(email):
        raise ValueError("Enter a valid work email.")
    with closing(_database()) as db:
        row = db.execute("SELECT * FROM workspace_accounts WHERE work_email = ?", (email,)).fetchone()
        if not row:
            raise ValueError("No account found for this email.")
        if row["email_verified"]:
            return {"alreadyVerified": True, "delivery": {"sent": True, "channel": "already_verified"}}
        delivery = _issue_email_otp(db, row["user_id"], email, row["first_name"])
        db.commit()
    return {"alreadyVerified": False, "delivery": delivery}


def verify_email_otp(work_email: str, otp: str) -> dict[str, Any]:
    email = _clean(work_email).lower()
    code = re.sub(r"\D", "", str(otp or ""))
    if not _EMAIL_RE.match(email) or len(code) != 6:
        raise ValueError("Enter the 6-digit OTP sent to your email.")
    with closing(_database()) as db:
        row = db.execute("SELECT * FROM workspace_email_otps WHERE work_email = ?", (email,)).fetchone()
        if not row:
            raise ValueError("OTP was not found. Please resend OTP.")
        if row["attempts"] >= 5:
            raise ValueError("Too many failed OTP attempts. Please resend OTP.")
        expires_at = datetime.fromisoformat(row["expires_at"])
        if datetime.now(timezone.utc) > expires_at:
            raise ValueError("OTP expired. Please resend OTP.")
        if not bcrypt.checkpw(code.encode("utf-8"), bytes(row["otp_hash"])):
            db.execute("UPDATE workspace_email_otps SET attempts = attempts + 1 WHERE work_email = ?", (email,))
            db.commit()
            raise ValueError("Invalid OTP.")
        now = _utc_now()
        db.execute("UPDATE workspace_accounts SET email_verified = 1, email_verified_at = ?, updated_at = ? WHERE user_id = ?", (now, now, row["user_id"]))
        db.execute("DELETE FROM workspace_email_otps WHERE work_email = ?", (email,))
        db.commit()
        account = db.execute("SELECT * FROM workspace_accounts WHERE user_id = ?", (row["user_id"],)).fetchone()
    return _safe_account(account)


def save_company_onboarding(user_id: str, payload: dict[str, Any]) -> dict[str, Any]:
    user_id = _clean(user_id)
    if not user_id.startswith("usr_"):
        raise ValueError("Valid workspace session is required.")

    skipped = bool(payload.get("skipped"))
    company_name = _clean(payload.get("companyName"))
    industry = _clean(payload.get("industry"))
    company_size = _clean(payload.get("companySize"))
    website = _clean(payload.get("website"))
    company_description = _clean(payload.get("companyDescription"))
    logo_data_url = _clean(payload.get("logoDataUrl"))
    default_currency = _clean(payload.get("defaultCurrency")) or "INR"
    time_zone = _clean(payload.get("timeZone")) or "Asia/Kolkata"
    accuracy_confirmed = bool(payload.get("accuracyConfirmed"))

    if not skipped:
        missing = [
            label for label, value in {
                "Company name": company_name,
                "Industry": industry,
                "Company size": company_size,
                "Default currency": default_currency,
                "Time zone": time_zone,
            }.items() if not value
        ]
        if missing:
            raise ValueError(f"{', '.join(missing)} required.")
        if not accuracy_confirmed:
            raise ValueError("Please confirm that the provided company details are accurate.")
    else:
        company_name = company_name or "Skipped setup"
        industry = industry or "Not provided"
        company_size = company_size or "Not provided"

    if website and not re.match(r"^https?://", website, re.I):
        website = f"https://{website}"
    if len(company_description) > 500:
        raise ValueError("Company description must be 500 characters or less.")
    if logo_data_url and len(logo_data_url) > 3_000_000:
        raise ValueError("Logo upload is too large. Please use an image under 2 MB.")

    now = _utc_now()
    with closing(_database()) as db:
        db.execute(
            """
            INSERT INTO workspace_onboarding_company (
                user_id, company_name, industry, company_size, website, company_description,
                logo_data_url, default_currency, time_zone, accuracy_confirmed, skipped,
                step, created_at, updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
            ON CONFLICT(user_id) DO UPDATE SET
                company_name=excluded.company_name,
                industry=excluded.industry,
                company_size=excluded.company_size,
                website=excluded.website,
                company_description=excluded.company_description,
                logo_data_url=excluded.logo_data_url,
                default_currency=excluded.default_currency,
                time_zone=excluded.time_zone,
                accuracy_confirmed=excluded.accuracy_confirmed,
                skipped=excluded.skipped,
                updated_at=excluded.updated_at
            """,
            (
                user_id,
                company_name,
                industry,
                company_size,
                website,
                company_description,
                logo_data_url,
                default_currency,
                time_zone,
                1 if accuracy_confirmed else 0,
                1 if skipped else 0,
                now,
                now,
            ),
        )
        db.commit()
        row = db.execute("SELECT * FROM workspace_onboarding_company WHERE user_id = ?", (user_id,)).fetchone()
    return {
        "workspaceUserId": row["user_id"],
        "companyName": row["company_name"],
        "industry": row["industry"],
        "companySize": row["company_size"],
        "website": row["website"],
        "companyDescription": row["company_description"],
        "logoDataUrl": row["logo_data_url"],
        "defaultCurrency": row["default_currency"],
        "timeZone": row["time_zone"],
        "accuracyConfirmed": bool(row["accuracy_confirmed"]),
        "skipped": bool(row["skipped"]),
        "step": row["step"],
        "updatedAt": row["updated_at"],
    }


def get_company_onboarding(user_id: str) -> dict[str, Any] | None:
    user_id = _clean(user_id)
    if not user_id:
        return None
    with closing(_database()) as db:
        row = db.execute("SELECT * FROM workspace_onboarding_company WHERE user_id = ?", (user_id,)).fetchone()
    if not row:
        return None
    return {
        "workspaceUserId": row["user_id"],
        "companyName": row["company_name"],
        "industry": row["industry"],
        "companySize": row["company_size"],
        "website": row["website"],
        "companyDescription": row["company_description"],
        "logoDataUrl": row["logo_data_url"],
        "defaultCurrency": row["default_currency"],
        "timeZone": row["time_zone"],
        "accuracyConfirmed": bool(row["accuracy_confirmed"]),
        "skipped": bool(row["skipped"]),
        "step": row["step"],
        "updatedAt": row["updated_at"],
    }


def save_ai_workspace_onboarding(user_id: str, payload: dict[str, Any]) -> dict[str, Any]:
    user_id = _clean(user_id)
    if not user_id.startswith("usr_"):
        raise ValueError("Valid workspace session is required.")

    skipped = bool(payload.get("skipped"))
    business_type = _clean(payload.get("businessType"))
    primary_department = _clean(payload.get("primaryDepartment"))
    industry = _clean(payload.get("industry"))
    preferred_language = _clean(payload.get("preferredLanguage")) or "English + Hindi"
    time_zone = _clean(payload.get("timeZone")) or "Asia/Kolkata"
    currency = _clean(payload.get("currency")) or "INR"

    if not skipped:
        missing = [
            label for label, value in {
                "Business type": business_type,
                "Primary department": primary_department,
                "Industry": industry,
                "Preferred language": preferred_language,
                "Time zone": time_zone,
                "Currency": currency,
            }.items() if not value
        ]
        if missing:
            raise ValueError(f"{', '.join(missing)} required.")
    else:
        business_type = business_type or "Not provided"
        primary_department = primary_department or "Not provided"
        industry = industry or "Not provided"

    now = _utc_now()
    with closing(_database()) as db:
        db.execute(
            """
            INSERT INTO workspace_onboarding_ai (
                user_id, business_type, primary_department, industry, preferred_language,
                time_zone, currency, skipped, step, created_at, updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 4, ?, ?)
            ON CONFLICT(user_id) DO UPDATE SET
                business_type=excluded.business_type,
                primary_department=excluded.primary_department,
                industry=excluded.industry,
                preferred_language=excluded.preferred_language,
                time_zone=excluded.time_zone,
                currency=excluded.currency,
                skipped=excluded.skipped,
                updated_at=excluded.updated_at
            """,
            (
                user_id,
                business_type,
                primary_department,
                industry,
                preferred_language,
                time_zone,
                currency,
                1 if skipped else 0,
                now,
                now,
            ),
        )
        db.commit()
        row = db.execute("SELECT * FROM workspace_onboarding_ai WHERE user_id = ?", (user_id,)).fetchone()
    return _ai_workspace_row(row)


def _ai_workspace_row(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "workspaceUserId": row["user_id"],
        "businessType": row["business_type"],
        "primaryDepartment": row["primary_department"],
        "industry": row["industry"],
        "preferredLanguage": row["preferred_language"],
        "timeZone": row["time_zone"],
        "currency": row["currency"],
        "skipped": bool(row["skipped"]),
        "step": row["step"],
        "updatedAt": row["updated_at"],
    }


def get_ai_workspace_onboarding(user_id: str) -> dict[str, Any] | None:
    user_id = _clean(user_id)
    if not user_id:
        return None
    with closing(_database()) as db:
        row = db.execute("SELECT * FROM workspace_onboarding_ai WHERE user_id = ?", (user_id,)).fetchone()
    return _ai_workspace_row(row) if row else None


_VALID_ROLES = {"Admin", "Manager", "Editor", "Viewer"}


def _invite_row(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "inviteId": row["invite_id"],
        "workspaceUserId": row["user_id"],
        "email": row["email"],
        "role": row["role"],
        "personalMessage": row["personal_message"] or "",
        "status": row["status"],
        "createdAt": row["created_at"],
        "updatedAt": row["updated_at"],
    }


def list_team_invites(user_id: str) -> list[dict[str, Any]]:
    user_id = _clean(user_id)
    if not user_id:
        return []
    with closing(_database()) as db:
        rows = db.execute(
            "SELECT * FROM workspace_team_invites WHERE user_id = ? ORDER BY created_at DESC",
            (user_id,),
        ).fetchall()
    return [_invite_row(row) for row in rows]


def save_team_invites(user_id: str, payload: dict[str, Any]) -> dict[str, Any]:
    user_id = _clean(user_id)
    if not user_id.startswith("usr_"):
        raise ValueError("Valid workspace session is required.")
    personal_message = _clean(payload.get("personalMessage"))[:400]
    invites = payload.get("invites") or []
    if not isinstance(invites, list):
        raise ValueError("Invites must be a list.")

    cleaned: list[tuple[str, str]] = []
    seen = set()
    for item in invites:
        email = _clean((item or {}).get("email")).lower()
        role = _clean((item or {}).get("role")) or "Viewer"
        if not email:
            continue
        if not _EMAIL_RE.match(email):
            raise ValueError(f"Invalid invite email: {email}")
        if role not in _VALID_ROLES:
            raise ValueError("Select a valid invite role.")
        if email in seen:
            continue
        seen.add(email)
        cleaned.append((email, role))

    now = _utc_now()
    with closing(_database()) as db:
        for email, role in cleaned:
            db.execute(
                """
                INSERT INTO workspace_team_invites (
                    invite_id, user_id, email, role, personal_message, status, created_at, updated_at
                )
                VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)
                ON CONFLICT(user_id, email) DO UPDATE SET
                    role=excluded.role,
                    personal_message=excluded.personal_message,
                    updated_at=excluded.updated_at
                """,
                (f"inv_{secrets.token_hex(10)}", user_id, email, role, personal_message, now, now),
            )
        db.commit()
    return {"invites": list_team_invites(user_id), "count": len(list_team_invites(user_id))}
