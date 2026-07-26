from __future__ import annotations

import json
import hashlib
import mimetypes
import os
import re
import traceback
from contextvars import ContextVar
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, unquote

from .analytics.service import ANALYSIS_VERSION, analyze_file, chat_answer
from .analytics.analytics_dataset import (
    build_power_bi_manifest,
    create_or_update_analytics_dataset,
    get_analytics_dataset,
    get_power_bi_semantic_view,
)
from .analytics.evidence_builder import build_evidence
from .analytics.universal_pipeline import run_universal_pipeline
from .analytics.session_manager import (
    append_chat,
    clear_session,
    create_session,
    get_session,
    progress,
    reassign_owner as reassign_session_owner,
)
from .connectors import (
    connected_source_metadata,
    create_connection,
    download_resource,
    execute_connected_command,
    list_connectors,
    list_resources,
    mark_connection_synced,
    oauth_callback,
    oauth_start,
    reassign_owner as reassign_connection_owner,
    remove_connection,
    resolve_connected_resource,
    validate_connected_source,
    workspace_profile,
)
from .workspace_identity import (
    COOKIE_NAME,
    clear_session_cookie,
    resolve_workspace,
    session_cookie,
    workspace_cookie_value,
)
from .notifications import send_slack_message, slack_configured
from .dashboard_studio import plan_dashboard, studio_config
from .activity_store import list_activities, record_activity
from .pdf_exporter import create_encrypted_pdf
from .share_manager import (
    ShareAccessError,
    access_cookie,
    access_protected_share,
    cookie_token,
    create_protected_share,
    revoke_share,
    share_metadata,
    verify_share_password,
)
from .voice.agent import answer as voice_answer, configured as ai_voice_configured, huggingface_configured
from .voice.elevenlabs import configured as elevenlabs_configured, synthesize as voice_synthesize, transcribe as voice_transcribe
from .voice.tool_catalog import public_catalog as voice_tool_catalog
from .ai.orchestrator import orchestrate_text


MAX_UPLOAD_BYTES = 100 * 1024 * 1024
CORS_ORIGIN = os.getenv("FRONTEND_ORIGIN", "http://127.0.0.1:5173")
LOCAL_FRONTEND_ORIGINS = {"http://127.0.0.1:5173", "http://localhost:5173"}
REQUEST_ORIGIN: ContextVar[str] = ContextVar("request_origin", default="")
DIST_DIR = Path(__file__).resolve().parents[1] / "dist"


def _headers(scope: dict[str, Any]) -> dict[str, str]:
    return {key.decode("latin1").lower(): value.decode("latin1") for key, value in scope.get("headers", [])}


async def _read_body(receive) -> bytes:
    chunks: list[bytes] = []
    total = 0
    while True:
        message = await receive()
        if message["type"] == "http.request":
            chunk = message.get("body", b"")
            total += len(chunk)
            if total > MAX_UPLOAD_BYTES:
                raise ValueError("Upload exceeds 100 MB limit.")
            chunks.append(chunk)
            if not message.get("more_body", False):
                break
    return b"".join(chunks)


def _json_bytes(payload: Any) -> bytes:
    return json.dumps(payload, ensure_ascii=False).encode("utf-8")


def _cors_origin() -> bytes:
    request_origin = REQUEST_ORIGIN.get()
    allowed = {CORS_ORIGIN, *LOCAL_FRONTEND_ORIGINS}
    selected = request_origin if request_origin in allowed else CORS_ORIGIN
    return selected.encode("utf-8")


async def _send_json(send, status: int, payload: Any, extra_headers: list[tuple[bytes, bytes]] | None = None):
    body = _json_bytes(payload)
    await send({
        "type": "http.response.start",
        "status": status,
        "headers": [
            (b"content-type", b"application/json; charset=utf-8"),
            (b"access-control-allow-origin", _cors_origin()),
            (b"access-control-allow-credentials", b"true"),
            (b"access-control-allow-methods", b"GET,POST,OPTIONS"),
            (b"access-control-allow-headers", b"content-type"),
        ] + (extra_headers or []),
    })
    await send({"type": "http.response.body", "body": body})


async def _send_bytes(send, status: int, body: bytes, content_type: str, file_name: str):
    safe_name = _sanitize_filename(file_name)
    await send({
        "type": "http.response.start",
        "status": status,
        "headers": [
            (b"content-type", content_type.encode("ascii")),
            (b"content-disposition", f'attachment; filename="{safe_name}"'.encode("ascii", errors="ignore")),
            (b"content-length", str(len(body)).encode("ascii")),
            (b"cache-control", b"no-store"),
            (b"access-control-allow-origin", _cors_origin()),
            (b"access-control-allow-credentials", b"true"),
        ],
    })
    await send({"type": "http.response.body", "body": body})


async def _send_options(send):
    await send({
        "type": "http.response.start",
        "status": 204,
        "headers": [
            (b"access-control-allow-origin", _cors_origin()),
            (b"access-control-allow-credentials", b"true"),
            (b"access-control-allow-methods", b"GET,POST,OPTIONS"),
            (b"access-control-allow-headers", b"content-type"),
        ],
    })
    await send({"type": "http.response.body", "body": b""})


async def _send_redirect(send, location: str, extra_headers: list[tuple[bytes, bytes]] | None = None):
    await send({
        "type": "http.response.start",
        "status": 302,
        "headers": [
            (b"location", location.encode("utf-8")),
            (b"cache-control", b"no-store"),
        ] + (extra_headers or []),
    })
    await send({"type": "http.response.body", "body": b""})


async def _send_static(send, path: str, head_only: bool = False) -> bool:
    if not DIST_DIR.is_dir():
        return False
    requested = unquote(path).lstrip("/")
    candidate = (DIST_DIR / requested).resolve() if requested else DIST_DIR / "index.html"
    try:
        candidate.relative_to(DIST_DIR.resolve())
    except ValueError:
        return False
    if not candidate.is_file():
        candidate = DIST_DIR / "index.html"
    body = candidate.read_bytes()
    content_type = mimetypes.guess_type(candidate.name)[0] or "application/octet-stream"
    cache_control = b"no-cache" if candidate.name == "index.html" else b"public, max-age=31536000, immutable"
    await send({
        "type": "http.response.start",
        "status": 200,
        "headers": [
            (b"content-type", content_type.encode("ascii")),
            (b"content-length", str(len(body)).encode("ascii")),
            (b"cache-control", cache_control),
            (b"x-content-type-options", b"nosniff"),
        ],
    })
    await send({"type": "http.response.body", "body": b"" if head_only else body})
    return True


def _query_params(scope: dict[str, Any]) -> dict[str, str]:
    raw = scope.get("query_string", b"").decode("utf-8", errors="replace")
    return {key: values[-1] for key, values in parse_qs(raw).items() if values}


def _parse_content_disposition(value: str) -> dict[str, str]:
    output: dict[str, str] = {}
    for part in value.split(";"):
        part = part.strip()
        if "=" not in part:
            continue
        key, raw = part.split("=", 1)
        raw = raw.strip().strip('"')
        output[key.lower()] = unquote(raw)
    return output


def _parse_multipart(content_type: str, body: bytes) -> dict[str, Any]:
    match = re.search(r"boundary=(?P<boundary>[^;]+)", content_type)
    if not match:
        raise ValueError("Missing multipart boundary.")
    boundary = match.group("boundary").strip().strip('"').encode("utf-8")
    marker = b"--" + boundary
    fields: dict[str, Any] = {}

    for raw_part in body.split(marker):
        raw_part = raw_part.strip()
        if not raw_part or raw_part == b"--":
            continue
        if raw_part.endswith(b"--"):
            raw_part = raw_part[:-2].strip()
        if b"\r\n\r\n" not in raw_part:
            continue
        header_blob, content = raw_part.split(b"\r\n\r\n", 1)
        content = content.rstrip(b"\r\n")
        part_headers = {}
        for line in header_blob.decode("latin1").split("\r\n"):
            if ":" in line:
                key, value = line.split(":", 1)
                part_headers[key.lower().strip()] = value.strip()
        disposition = _parse_content_disposition(part_headers.get("content-disposition", ""))
        name = disposition.get("name")
        if not name:
            continue
        if "filename" in disposition:
            fields[name] = {
                "filename": disposition["filename"],
                "content": content,
                "content_type": part_headers.get("content-type", "application/octet-stream"),
            }
        else:
            fields[name] = content.decode("utf-8", errors="replace")
    return fields


def _sanitize_filename(value: str) -> str:
    name = re.sub(r"[^\w.\- ()]+", "_", value or "uploaded_file")
    return name.strip(" .")[:180] or "uploaded_file"


def _attach_source_provenance(
    analysis: dict[str, Any],
    content: bytes,
    source_kind: str,
    original_name: str,
) -> None:
    analysis["sourceProvenance"] = {
        "kind": source_kind,
        "originalFileName": original_name,
        "sizeBytes": len(content),
        "sha256": hashlib.sha256(content).hexdigest(),
        "analyzedAt": datetime.now(timezone.utc).isoformat(),
    }


def _store_then_analyze(
    file_name: str,
    content: bytes,
    owner_user_id: str,
    source_kind: str,
    *,
    content_type: str = "application/octet-stream",
    metadata: dict[str, Any] | None = None,
) -> tuple[dict[str, Any], dict[str, Any]]:
    """Commit the source first, then analyze through the universal ETL pipeline."""
    result, dataset = run_universal_pipeline(
        file_name,
        content,
        owner_user_id,
        source_kind,
        content_type=content_type,
        metadata=metadata,
        analyzer=analyze_file,
    )
    _attach_source_provenance(result, content, source_kind, file_name)
    result["sourceProvenance"]["databaseRecordId"] = dataset["datasetId"]
    result["sourceProvenance"]["databaseSha256"] = dataset["sha256"]
    analytics_record = create_or_update_analytics_dataset(
        result,
        owner_user_id,
        refresh_kind=source_kind,
    )
    result["analyticsDatasetId"] = analytics_record["analyticsDatasetId"]
    result["analyticsDataset"] = analytics_record["payload"]
    return result, dataset


async def app(scope, receive, send):
    if scope["type"] == "lifespan":
        while True:
            message = await receive()
            if message["type"] == "lifespan.startup":
                await send({"type": "lifespan.startup.complete"})
            elif message["type"] == "lifespan.shutdown":
                await send({"type": "lifespan.shutdown.complete"})
                return

    if scope["type"] != "http":
        return

    method = scope.get("method", "GET").upper()
    path = scope.get("path", "/")
    headers = _headers(scope)
    REQUEST_ORIGIN.set(headers.get("origin", ""))

    if method == "OPTIONS":
        await _send_options(send)
        return

    workspace_user_id, new_workspace_cookie = resolve_workspace(headers.get("cookie", ""))
    if new_workspace_cookie:
        original_send = send
        secure_cookie = scope.get("scheme") == "https" or headers.get("x-forwarded-proto") == "https"

        async def send_with_workspace_cookie(message):
            if message.get("type") == "http.response.start":
                message = dict(message)
                response_headers = list(message.get("headers", []))
                has_workspace_cookie = any(
                    key.lower() == b"set-cookie"
                    and value.decode("latin1", errors="ignore").startswith(f"{COOKIE_NAME}=")
                    for key, value in response_headers
                )
                if not has_workspace_cookie:
                    response_headers.append(
                        (b"set-cookie", session_cookie(new_workspace_cookie, secure_cookie).encode("utf-8"))
                    )
                message["headers"] = response_headers
            await original_send(message)

        send = send_with_workspace_cookie

    try:
        if method == "GET" and path == "/api/health":
            await _send_json(send, 200, {
                "ok": True,
                "engine": "Universal File Analytics Engine",
                "version": ANALYSIS_VERSION,
            })
            return

        if method == "GET" and path == "/api/auth/session":
            await _send_json(send, 200, {
                "ok": True,
                "workspaceUserId": workspace_user_id,
                "user": workspace_profile(workspace_user_id),
            })
            return

        if method == "POST" and path == "/api/auth/logout":
            secure_cookie = scope.get("scheme") == "https" or headers.get("x-forwarded-proto") == "https"
            await _send_json(
                send,
                200,
                {"ok": True},
                [(b"set-cookie", clear_session_cookie(secure_cookie).encode("utf-8"))],
            )
            return

        if method == "GET" and path == "/api/voice/config":
            await _send_json(send, 200, {
                "ok": True,
                "aiConfigured": ai_voice_configured(),
                "openaiConfigured": bool(os.getenv("OPENAI_API_KEY", "").strip()),
                "huggingFaceConfigured": huggingface_configured(),
                "elevenLabsConfigured": elevenlabs_configured(),
                "tools": voice_tool_catalog(),
            })
            return

        if method == "GET" and path == "/api/dashboard-studio/config":
            await _send_json(send, 200, {"ok": True, **studio_config()})
            return

        if method == "POST" and path == "/api/dashboard-studio/plan":
            body = await _read_body(receive)
            payload = json.loads(body.decode("utf-8")) if body else {}
            share_id = str(payload.get("shareId") or "").strip()
            session_id = str(payload.get("sessionId") or "").strip()
            if share_id:
                analysis = access_protected_share(share_id, cookie_token(headers.get("cookie", "")))
            elif session_id:
                session = get_session(session_id, workspace_user_id)
                if session:
                    analysis = session["analysis"]
                elif isinstance(payload.get("analysis"), dict):
                    analysis = payload["analysis"]
                else:
                    raise ValueError("Current analysis session was not found. Upload the file again.")
            elif isinstance(payload.get("analysis"), dict):
                analysis = payload["analysis"]
            else:
                raise ValueError("A protected share or analysis session is required.")
            prompt = str(payload.get("prompt") or "").strip()
            if not prompt:
                raise ValueError("Describe how you want to customize the dashboard.")
            current = payload.get("currentPlan") if isinstance(payload.get("currentPlan"), dict) else None
            stitch_state = payload.get("stitchState") if isinstance(payload.get("stitchState"), dict) else None
            await _send_json(send, 200, {"ok": True, **plan_dashboard(prompt, analysis, current, bool(payload.get("useStitch")), stitch_state)})
            return

        if method == "POST" and path == "/api/voice/agent":
            body = await _read_body(receive)
            payload = json.loads(body.decode("utf-8")) if body else {}
            result = voice_answer(
                str(payload.get("sessionId") or "anonymous")[:160],
                str(payload.get("transcript") or ""),
                payload.get("context") if isinstance(payload.get("context"), dict) else {},
            )
            await _send_json(send, 200, {"ok": True, **result})
            return

        if method == "POST" and path == "/api/voice/transcribe":
            body = await _read_body(receive)
            fields = _parse_multipart(headers.get("content-type", ""), body)
            upload = fields.get("audio")
            if not isinstance(upload, dict) or not upload.get("content"):
                raise ValueError("An audio file is required.")
            transcript = voice_transcribe(upload["content"], upload["filename"], upload["content_type"])
            await _send_json(send, 200, {"ok": True, "transcript": transcript.get("text", ""), "language": transcript.get("language_code")})
            return

        if method == "POST" and path == "/api/voice/speak":
            body = await _read_body(receive)
            payload = json.loads(body.decode("utf-8")) if body else {}
            audio = voice_synthesize(str(payload.get("text") or ""))
            await _send_bytes(send, 200, audio, "audio/mpeg", "byizon-voice.mp3")
            return

        if method == "GET" and path == "/api/connectors":
            await _send_json(send, 200, {"ok": True, **list_connectors(workspace_user_id)})
            return

        if method == "POST" and path == "/api/integrations/slack/test":
            result = send_slack_message("Byizon AI connection test successful. Slack notifications are ready.")
            await _send_json(send, 200, {"ok": True, **result})
            return

        if method == "GET" and path.startswith("/api/shares/") and path.endswith("/data"):
            share_id = path.split("/")[3]
            analysis = access_protected_share(share_id, cookie_token(headers.get("cookie", "")))
            await _send_json(send, 200, {"ok": True, "analysis": analysis})
            return

        if method == "GET" and path.startswith("/api/shares/"):
            share_id = path.rsplit("/", 1)[-1]
            metadata = share_metadata(share_id)
            if not metadata:
                await _send_json(send, 404, {"ok": False, "error": "Protected report was not found."})
                return
            await _send_json(send, 200, {"ok": True, "share": metadata})
            return

        if method == "GET" and path.startswith("/api/oauth/start/"):
            connector_id = path.rsplit("/", 1)[-1]
            query = _query_params(scope)
            await _send_redirect(
                send,
                oauth_start(
                    connector_id,
                    query.get("returnUrl"),
                    workspace_user_id,
                    query.get("capability"),
                ),
            )
            return

        if method == "GET" and path.startswith("/api/oauth/callback/"):
            connector_id = path.rsplit("/", 1)[-1]
            location, _connection, authenticated_owner_user_id, previous_owner_user_id = oauth_callback(
                connector_id,
                _query_params(scope),
                workspace_user_id,
            )
            redirect_headers = []
            if authenticated_owner_user_id:
                reassign_connection_owner(previous_owner_user_id or workspace_user_id, authenticated_owner_user_id)
                reassign_session_owner(previous_owner_user_id or workspace_user_id, authenticated_owner_user_id)
                secure_cookie = scope.get("scheme") == "https" or headers.get("x-forwarded-proto") == "https"
                redirect_headers.append((
                    b"set-cookie",
                    session_cookie(
                        workspace_cookie_value(authenticated_owner_user_id),
                        secure_cookie,
                    ).encode("utf-8"),
                ))
            await _send_redirect(send, location, redirect_headers)
            return

        if method == "GET" and path.startswith("/api/connections/") and path.endswith("/resources"):
            connection_id = path.split("/")[3]
            await _send_json(send, 200, {"ok": True, "resources": list_resources(connection_id, workspace_user_id)})
            return

        if method == "POST" and path == "/api/connections":
            body = await _read_body(receive)
            payload = json.loads(body.decode("utf-8")) if body else {}
            await _send_json(send, 201, {"ok": True, "connection": create_connection(payload, workspace_user_id)})
            return

        if method == "POST" and path == "/api/connections/remove":
            body = await _read_body(receive)
            payload = json.loads(body.decode("utf-8")) if body else {}
            connection_id = str(payload.get("connectionId", "")).strip()
            await _send_json(send, 200, {"ok": True, "removed": remove_connection(connection_id, workspace_user_id)})
            return

        if method == "POST" and path == "/api/connections/import":
            body = await _read_body(receive)
            payload = json.loads(body.decode("utf-8")) if body else {}
            connection_id = str(payload.get("connectionId", "")).strip()
            resource_id = str(payload.get("resourceId", "")).strip()
            if not connection_id or not resource_id:
                raise ValueError("Connection ID and resource ID are required.")
            file_name, content = download_resource(connection_id, resource_id, workspace_user_id)
            safe_name = _sanitize_filename(file_name)
            result, dataset = _store_then_analyze(
                safe_name,
                content,
                workspace_user_id,
                "connected_tool",
                metadata={"connectionId": connection_id, "resourceId": resource_id},
            )
            resource = next((item for item in list_resources(connection_id, workspace_user_id) if item.get("id") == resource_id), {"id": resource_id, "name": safe_name})
            result["connectedSource"] = connected_source_metadata(connection_id, resource)
            session = create_session(
                result,
                {"fileName": safe_name, "source": "connected_tool", "connectionId": connection_id, "resourceId": resource_id},
                workspace_user_id,
                dataset["datasetId"],
            )
            mark_connection_synced(connection_id, workspace_user_id)
            if slack_configured() and os.getenv("SLACK_NOTIFY_ANALYSIS", "false").strip().lower() == "true":
                try:
                    send_slack_message(f"Byizon AI completed analysis for connected resource: {safe_name}")
                except ValueError:
                    pass
            await _send_json(send, 200, {"ok": True, "sessionId": session["sessionId"], "analysis": session["analysis"]})
            return

        if method == "POST" and path == "/api/connections/validate-source":
            body = await _read_body(receive)
            payload = json.loads(body.decode("utf-8")) if body else {}
            source = payload.get("source") if isinstance(payload.get("source"), dict) else {}
            validation = validate_connected_source(source, workspace_user_id)
            await _send_json(send, 200, {"ok": True, **validation})
            return

        if method == "POST" and path == "/api/connections/refresh-source":
            body = await _read_body(receive)
            payload = json.loads(body.decode("utf-8")) if body else {}
            source = payload.get("source") if isinstance(payload.get("source"), dict) else {}
            validation = validate_connected_source(source, workspace_user_id)
            if not validation.get("valid"):
                clear_session(payload.get("sessionId"), workspace_user_id)
                await _send_json(send, 200, {"ok": True, **validation, "clearActiveAnalysis": True})
                return
            connection_id = str(source.get("connectionId"))
            resource = validation["resource"]
            file_name, content = download_resource(connection_id, resource["id"], workspace_user_id)
            safe_name = _sanitize_filename(file_name)
            result, dataset = _store_then_analyze(
                safe_name,
                content,
                workspace_user_id,
                "connected_tool_refresh",
                metadata={"connectionId": connection_id, "resourceId": resource["id"]},
            )
            result["connectedSource"] = connected_source_metadata(connection_id, resource)
            clear_session(payload.get("sessionId"), workspace_user_id)
            session = create_session(
                result,
                {"fileName": safe_name, "source": "connected_tool_refresh", "connectionId": connection_id, "resourceId": resource["id"]},
                workspace_user_id,
                dataset["datasetId"],
            )
            mark_connection_synced(connection_id, workspace_user_id)
            await _send_json(send, 200, {"ok": True, "valid": True, "sessionId": session["sessionId"], "analysis": session["analysis"]})
            return

        if method == "POST" and path == "/api/shares":
            body = await _read_body(receive)
            payload = json.loads(body.decode("utf-8")) if body else {}
            session = get_session(payload.get("sessionId"), workspace_user_id)
            fallback_analysis = payload.get("analysis") if isinstance(payload.get("analysis"), dict) else None
            if not session and not fallback_analysis:
                raise ValueError("Current analysis session was not found. Upload the file again before sharing.")
            analysis = dict(session["analysis"] if session else fallback_analysis)
            customization = payload.get("customization") if isinstance(payload.get("customization"), dict) else None
            if customization:
                analysis["studioCustomization"] = {
                    "projectId": str(customization.get("projectId") or "")[:120],
                    "screenId": str(customization.get("screenId") or "")[:120],
                    "htmlUrl": str(customization.get("htmlUrl") or "")[:2000],
                    "imageUrl": str(customization.get("imageUrl") or "")[:2000],
                    "html": str(customization.get("html") or "")[:3000000],
                    "prompt": str(customization.get("prompt") or "")[:1000],
                }
            session_id = str((session or {}).get("sessionId") or payload.get("sessionId") or "portable-analysis")
            share = create_protected_share(
                session_id,
                analysis,
                int(payload.get("expiresInDays") or 7),
            )
            await _send_json(send, 201, {"ok": True, "share": share})
            return

        if method == "POST" and path == "/api/shares/access":
            body = await _read_body(receive)
            payload = json.loads(body.decode("utf-8")) if body else {}
            client = scope.get("client") or ("unknown", 0)
            share_id = str(payload.get("shareId") or payload.get("reportId") or "")
            token = verify_share_password(
                share_id,
                str(payload.get("password") or ""),
                str(client[0]),
            )
            forwarded_proto = headers.get("x-forwarded-proto", "")
            secure_cookie = scope.get("scheme") == "https" or forwarded_proto == "https"
            await _send_json(
                send,
                200,
                {"ok": True, "verified": True, "expiresIn": 3600},
                [(b"set-cookie", access_cookie(token, secure_cookie).encode("utf-8"))],
            )
            return

        if method == "POST" and path == "/api/shares/revoke":
            body = await _read_body(receive)
            payload = json.loads(body.decode("utf-8")) if body else {}
            revoked = revoke_share(str(payload.get("shareId") or ""), str(payload.get("sessionId") or ""))
            if not revoked:
                raise ValueError("Share link was not found or does not belong to this analysis session.")
            await _send_json(send, 200, {"ok": True, "revoked": True})
            return

        if method == "POST" and path == "/api/export-protected-pdf":
            body = await _read_body(receive)
            payload = json.loads(body.decode("utf-8")) if body else {}
            session = get_session(payload.get("sessionId"), workspace_user_id)
            if not session:
                raise ValueError("Current analysis session was not found. Upload the file again before exporting.")
            file_name, pdf_bytes = create_encrypted_pdf(session["analysis"], str(payload.get("password") or ""))
            await _send_bytes(send, 200, pdf_bytes, "application/pdf", file_name)
            return

        if method == "POST" and path == "/api/analyze":
            body = await _read_body(receive)
            fields = _parse_multipart(headers.get("content-type", ""), body)
            upload = fields.get("file")
            if not upload:
                raise ValueError("No file field found in upload.")
            safe_name = _sanitize_filename(upload["filename"])
            result, dataset = _store_then_analyze(
                safe_name,
                upload["content"],
                workspace_user_id,
                "manual_upload",
                content_type=upload.get("content_type") or "application/octet-stream",
            )
            session = create_session(
                result,
                owner_user_id=workspace_user_id,
                dataset_id=dataset["datasetId"],
            )
            await _send_json(send, 200, {
                "ok": True,
                "sessionId": session["sessionId"],
                "datasetId": dataset["datasetId"],
                "storagePolicy": "database-first",
                "analysis": session["analysis"],
            })
            return

        if method == "GET" and path.startswith("/api/analysis/"):
            session_id = path.rsplit("/", 1)[-1]
            session = get_session(session_id, workspace_user_id)
            if not session:
                await _send_json(send, 404, {"ok": False, "error": "Analysis session not found."})
                return
            await _send_json(send, 200, {"ok": True, "session": session, "analysis": session["analysis"]})
            return

        if method == "GET" and path.startswith("/api/analytics-dataset/"):
            analytics_id = path.rsplit("/", 1)[-1]
            query = _query_params(scope)
            filters = {
                key: value
                for key, value in query.items()
                if key not in {"page", "pageSize", "pagesize"}
            }
            payload = get_analytics_dataset(
                analytics_id,
                workspace_user_id,
                page=int(query.get("page") or 1),
                page_size=int(query.get("pageSize") or query.get("pagesize") or 100),
                filters=filters,
            )
            if not payload:
                await _send_json(send, 404, {"ok": False, "error": "Analytics dataset not found."})
                return
            await _send_json(send, 200, {"ok": True, "analyticsDataset": payload})
            return

        if method == "GET" and path.startswith("/api/powerbi/manifest/"):
            analytics_id = path.rsplit("/", 1)[-1]
            manifest = build_power_bi_manifest(analytics_id, workspace_user_id)
            if not manifest:
                await _send_json(send, 404, {"ok": False, "error": "Power BI semantic manifest not found."})
                return
            await _send_json(send, 200, manifest)
            return

        if method == "GET" and path.startswith("/api/powerbi/semantic-view/"):
            suffix = path[len("/api/powerbi/semantic-view/"):]
            parts = suffix.split("/", 1)
            if len(parts) != 2:
                await _send_json(send, 400, {"ok": False, "error": "Power BI semantic view path is invalid."})
                return
            analytics_id, view_name = parts
            query = _query_params(scope)
            filters = {
                key: value
                for key, value in query.items()
                if key not in {"page", "pageSize", "pagesize"}
            }
            semantic_view = get_power_bi_semantic_view(
                analytics_id,
                workspace_user_id,
                view_name,
                page=int(query.get("page") or 1),
                page_size=int(query.get("pageSize") or query.get("pagesize") or 100),
                filters=filters,
            )
            if not semantic_view:
                await _send_json(send, 404, {"ok": False, "error": "Power BI semantic view not found."})
                return
            await _send_json(send, 200, semantic_view)
            return

        if method == "POST" and path == "/api/analytics-dataset/refresh":
            body = await _read_body(receive)
            payload = json.loads(body.decode("utf-8")) if body else {}
            session = get_session(payload.get("sessionId"), workspace_user_id)
            if not session:
                await _send_json(send, 404, {"ok": False, "error": "Analysis session not found."})
                return
            analytics_record = create_or_update_analytics_dataset(
                session["analysis"],
                workspace_user_id,
                refresh_kind=str(payload.get("refreshKind") or "manual"),
            )
            await _send_json(send, 200, {"ok": True, "analyticsDataset": analytics_record["payload"]})
            return

        if method == "GET" and path.startswith("/api/progress/"):
            session_id = path.rsplit("/", 1)[-1]
            await _send_json(send, 200, {"ok": True, **progress(session_id, workspace_user_id)})
            return

        if method == "GET" and path == "/api/activities":
            query = _query_params(scope)
            await _send_json(
                send,
                200,
                {"ok": True, "activities": list_activities(workspace_user_id, int(query.get("limit") or 30))},
            )
            return

        if method == "POST" and path == "/api/clear-session":
            body = await _read_body(receive)
            payload = json.loads(body.decode("utf-8")) if body else {}
            await _send_json(send, 200, {"ok": True, "cleared": clear_session(payload.get("sessionId"), workspace_user_id)})
            return

        if method == "POST" and path == "/api/chat":
            body = await _read_body(receive)
            payload = json.loads(body.decode("utf-8"))
            question = str(payload.get("question", "")).strip()
            session_id = payload.get("sessionId")
            session = get_session(session_id, workspace_user_id)
            # Dataset chat only trusts analysis loaded from a persisted session.
            # Browser-supplied analysis would bypass database provenance checks.
            analysis = session["analysis"] if session else None
            connected_command = execute_connected_command(question, analysis, workspace_user_id)
            if connected_command:
                task = connected_command.get("task")
                if task:
                    task = record_activity(workspace_user_id, task)
                await _send_json(send, 200, {
                    "ok": True,
                    "answer": connected_command.get("message", "Connected app command completed."),
                    "action": "connected_command_complete" if connected_command.get("status") == "complete" else "connected_command_attention",
                    "source": {
                        "connector": connected_command.get("connector"),
                        "channel": connected_command.get("channel"),
                        "providerAction": connected_command.get("providerAction"),
                        "resource": connected_command.get("resource"),
                        "url": connected_command.get("url"),
                    },
                    "task": task,
                    "capability": connected_command.get("capability"),
                    "choices": connected_command.get("choices") or [],
                })
                return
            try:
                connected_action = resolve_connected_resource(question, workspace_user_id)
            except ValueError as exc:
                await _send_json(send, 200, {
                    "ok": True,
                    "answer": f"I found the connected source, but it needs attention: {exc}",
                    "action": "connected_source_permission_required",
                })
                return
            if connected_action:
                if connected_action.get("status") != "ready":
                    invalidate = bool(connected_action.get("invalidateCurrentAnalysis"))
                    if invalidate:
                        clear_session(payload.get("sessionId"), workspace_user_id)
                    await _send_json(send, 200, {
                        "ok": True,
                        "answer": connected_action.get("message", "The connected source is not ready."),
                        "action": "connected_source_unavailable" if invalidate else "connected_source_selection_required",
                        "clearActiveAnalysis": invalidate,
                    })
                    return
                connection_id = connected_action["connectionId"]
                resource = connected_action["resource"]
                try:
                    file_name, content = download_resource(connection_id, resource["id"], workspace_user_id)
                    safe_name = _sanitize_filename(file_name)
                    result, dataset = _store_then_analyze(
                        safe_name,
                        content,
                        workspace_user_id,
                        "chat_connected_tool",
                        metadata={"connectionId": connection_id, "resourceId": resource["id"]},
                    )
                except Exception as exc:
                    clear_session(session_id, workspace_user_id)
                    await _send_json(send, 200, {
                        "ok": True,
                        "answer": (
                            "The requested connected file could not be freshly downloaded and verified, "
                            f"so the previous dataset was cleared instead of being reused. Details: {exc}"
                        ),
                        "action": "connected_source_download_failed",
                        "clearActiveAnalysis": True,
                    })
                    return
                result["connectedSource"] = connected_source_metadata(connection_id, resource)
                result["connectedSource"]["resourceModifiedAt"] = resource.get("modifiedAt")
                connector_id = str(result["connectedSource"].get("connectorId") or "connected source")
                connector_label = connector_id.replace("-", " ").title()
                imported_session = create_session(
                    result,
                    {
                        "fileName": safe_name,
                        "source": "chat_connected_tool",
                        "connectionId": connection_id,
                        "resourceId": resource["id"],
                    },
                    workspace_user_id,
                    dataset["datasetId"],
                )
                if session_id and session_id != imported_session["sessionId"]:
                    clear_session(session_id, workspace_user_id)
                mark_connection_synced(connection_id, workspace_user_id)
                answer = (
                    f"I imported {safe_name} from {connector_label} and completed deterministic analysis of "
                    f"{result.get('rowCount', 0):,} rows and {result.get('colCount', 0):,} columns. "
                    "The dashboard, report, and follow-up chat now use this dataset."
                )
                append_chat(imported_session["sessionId"], "user", question, workspace_user_id)
                append_chat(imported_session["sessionId"], "assistant", answer, workspace_user_id)
                await _send_json(send, 200, {
                    "ok": True,
                    "answer": answer,
                    "action": "connected_source_analyzed",
                    "sessionId": imported_session["sessionId"],
                    "analysis": imported_session["analysis"],
                    "source": {
                        "connector": connector_id,
                        "resourceId": resource["id"],
                        "resourceName": resource.get("name"),
                    },
                })
                return
            if not question or not analysis:
                raise ValueError("Question and current analysis session are required.")
            append_chat(session_id, "user", question, workspace_user_id) if session_id else None
            evidence, context_audit = build_evidence(question, analysis, workspace_user_id, session_id=session_id)
            deterministic_answer = chat_answer(question, analysis)
            evidence_ready = bool(evidence.get("evidenceValidation", {}).get("sufficientForModel", True))
            model_allowed = os.getenv("BYIZON_ALLOW_LLM_CHAT", "false").strip().lower() == "true" and evidence_ready
            orchestrated = orchestrate_text(
                purpose="chat_answer",
                evidence=evidence,
                owner_user_id=workspace_user_id,
                fallback=deterministic_answer,
                allow_model=model_allowed,
                system_prompt=(
                    "You are Byizon's grounded analyst. Use only the evidence JSON. "
                    "If a requested number or action is not present, say it cannot be calculated from available evidence."
                ),
            )
            answer = orchestrated["text"]
            append_chat(session_id, "assistant", answer, workspace_user_id) if session_id else None
            await _send_json(send, 200, {
                "ok": True,
                "answer": answer,
                "sessionId": session_id,
                "queryPlan": evidence["queryPlan"],
                "contextAudit": context_audit,
                "aiBoundary": {
                    "provider": orchestrated.get("provider"),
                    "requestId": orchestrated.get("requestId"),
                    "modelAllowed": model_allowed,
                    "modelBlockedReason": None if evidence_ready else evidence.get("evidenceValidation", {}).get("reason"),
                    "rawRowsSent": False,
                },
                "dataFlow": evidence.get("mandatoryFlow") or [
                    "user_query",
                    "backend_api",
                    "authentication",
                    "workspace_validation",
                    "intent_detection",
                    "determine_data_source",
                    "determine_metrics",
                    "query_planner",
                    "safe_sql_generator",
                    "sql_validation",
                    "execute_sql",
                    "fetch_only_required_data",
                    "data_processing_engine",
                    "structured_json",
                    "context_optimization",
                    "evidence_validation",
                    "ai_orchestrator",
                    "dashboard_and_final_response",
                ],
            })
            return

        if method == "POST" and path == "/api/recalculate":
            body = await _read_body(receive)
            payload = json.loads(body.decode("utf-8")) if body else {}
            session = get_session(payload.get("sessionId"), workspace_user_id)
            if not session:
                await _send_json(send, 404, {"ok": False, "error": "Analysis session not found."})
                return
            await _send_json(send, 200, {"ok": True, "analysis": session["analysis"], "note": "Filtered recalculation endpoint is ready; current deterministic full-session analysis returned."})
            return

        if method == "POST" and path == "/api/generate-chart":
            body = await _read_body(receive)
            payload = json.loads(body.decode("utf-8")) if body else {}
            session = get_session(payload.get("sessionId"), workspace_user_id)
            if not session:
                await _send_json(send, 404, {"ok": False, "error": "Analysis session not found."})
                return
            await _send_json(send, 200, {"ok": True, "charts": session["analysis"].get("charts", []), "dataSciencePlots": session["analysis"].get("dataScience", {}).get("visualizations", {}).get("plots", [])})
            return

        if method == "POST" and path == "/api/export-report":
            body = await _read_body(receive)
            payload = json.loads(body.decode("utf-8")) if body else {}
            session = get_session(payload.get("sessionId"), workspace_user_id)
            if not session:
                await _send_json(send, 404, {"ok": False, "error": "Analysis session not found."})
                return
            await _send_json(send, 200, {"ok": True, "fileName": f"{session['analysis'].get('fileName', 'analysis')}_report.txt", "reportText": session["analysis"].get("reportText", "")})
            return

        if method in {"GET", "HEAD"} and not path.startswith("/api/"):
            if await _send_static(send, path, method == "HEAD"):
                return

        await _send_json(send, 404, {"ok": False, "error": f"Route not found: {method} {path}"})

    except Exception as exc:
        status = exc.status if isinstance(exc, ShareAccessError) else 400
        error_payload = {
            "ok": False,
            "error": str(exc),
        }
        if os.getenv("BYIZON_DEBUG", "false").strip().lower() == "true":
            error_payload["trace"] = traceback.format_exc(limit=3)
        await _send_json(send, status, error_payload)
