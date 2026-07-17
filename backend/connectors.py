from __future__ import annotations

import base64
import json
import os
import re
import requests
import secrets
import shutil
import subprocess
import time
from datetime import datetime, timedelta, timezone
from email.message import EmailMessage
from typing import Any
from urllib.parse import quote, urlencode, urlparse
from uuid import uuid4

from .connection_store import delete_connection, load_connections, save_connection
from .notifications import slack_configured


def _load_local_env() -> None:
    env_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), ".env")
    if not os.path.isfile(env_path):
        return
    with open(env_path, "r", encoding="utf-8") as handle:
        for raw_line in handle:
            line = raw_line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            key = key.strip()
            value = value.strip().strip('"').strip("'")
            if key and key not in os.environ:
                os.environ[key] = value


_load_local_env()

REQUIRED_SLACK_SCOPES = {
    "channels:read", "channels:history", "channels:join",
    "groups:read", "groups:history", "files:read", "chat:write",
}
REQUIRED_GOOGLE_SCOPES = {
    "https://www.googleapis.com/auth/drive.readonly",
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/gmail.send",
    "https://www.googleapis.com/auth/calendar.readonly",
    "https://www.googleapis.com/auth/calendar.events",
    "https://www.googleapis.com/auth/documents",
}

CONNECTOR_CATALOG = [
    {
        "id": "microsoft-365", "name": "Microsoft 365", "category": "Productivity",
        "description": "Analyze Microsoft 365 data and automate business workflows.",
        "authModes": ["oauth", "url"], "capabilities": ["OneDrive", "SharePoint", "Excel", "Outlook"],
        "accent": "#2563eb",
    },
    {
        "id": "salesforce", "name": "Salesforce", "category": "CRM",
        "description": "Connect CRM objects and prepare account, pipeline, and service analysis.",
        "authModes": ["oauth", "url"], "capabilities": ["Sales Cloud", "Service Cloud", "CRM objects"],
        "accent": "#0ea5e9",
    },
    {
        "id": "google-workspace", "name": "Google Workspace", "category": "Productivity",
        "description": "Analyze and automate Google Sheets, Gmail, Calendar, Drive, and Docs through one secure login.",
        "authModes": ["oauth", "url"], "capabilities": ["Google Sheets", "Gmail", "Calendar", "Google Docs"],
        "accent": "#16a34a",
    },
    {
        "id": "slack", "name": "Slack", "category": "Collaboration",
        "description": "Analyze channel history and send governed workspace notifications.",
        "authModes": ["oauth"], "capabilities": ["Channels", "Messages", "Notifications"],
        "accent": "#4a154b",
    },
    {
        "id": "glean", "name": "Glean", "category": "Enterprise Search",
        "description": "Bring discoverable company knowledge into one analytical workspace.",
        "authModes": ["oauth", "url"], "capabilities": ["Enterprise search", "Knowledge sources"],
        "accent": "#7c3aed",
    },
    {
        "id": "zapier", "name": "Zapier", "category": "Automation",
        "description": "Receive workflow data through secure webhooks and connected apps.",
        "authModes": ["oauth", "url"], "capabilities": ["Webhooks", "App workflows", "Automation events"],
        "accent": "#f97316",
    },
    {
        "id": "workato", "name": "Workato", "category": "Enterprise Automation",
        "description": "Connect enterprise recipes, events, and operational workflows.",
        "authModes": ["oauth", "url"], "capabilities": ["Recipes", "Enterprise apps", "Workflow events"],
        "accent": "#dc2626",
    },
    {
        "id": "hubspot", "name": "HubSpot", "category": "CRM",
        "description": "Connect CRM, marketing, and service data for unified analysis.",
        "authModes": ["oauth", "url"], "capabilities": ["CRM", "Marketing", "Service"],
        "accent": "#ea580c",
    },
    {
        "id": "jira", "name": "Jira", "category": "Project Management",
        "description": "Connect Jira projects and analyze issues, status, priority, and delivery activity.",
        "authModes": ["oauth"], "capabilities": ["Projects", "Issues", "Workflows"],
        "accent": "#0c66e4",
    },
]

_CONNECTIONS, _TOKENS = load_connections()
_OAUTH_STATES: dict[str, dict[str, Any]] = {}


def _connector(connector_id: str) -> dict[str, Any]:
    item = next((value for value in CONNECTOR_CATALOG if value["id"] == connector_id), None)
    if not item:
        raise ValueError("Unknown connector.")
    return item


def _provider_config(connector_id: str) -> dict[str, str]:
    prefix = connector_id.upper().replace("-", "_")
    standard = {
        "microsoft-365": {
            "authorize_url": "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
            "token_url": "https://login.microsoftonline.com/common/oauth2/v2.0/token",
            "scope": "openid profile email offline_access User.Read Files.Read",
        },
        "google-workspace": {
            "authorize_url": "https://accounts.google.com/o/oauth2/v2/auth",
            "token_url": "https://oauth2.googleapis.com/token",
            "scope": (
                "openid email profile "
                "https://www.googleapis.com/auth/drive.readonly "
                "https://www.googleapis.com/auth/spreadsheets "
                "https://www.googleapis.com/auth/gmail.readonly "
                "https://www.googleapis.com/auth/gmail.send "
                "https://www.googleapis.com/auth/calendar.readonly "
                "https://www.googleapis.com/auth/calendar.events "
                "https://www.googleapis.com/auth/documents"
            ),
        },
        "slack": {
            "authorize_url": "https://slack.com/oauth/v2/authorize",
            "token_url": "https://slack.com/api/oauth.v2.access",
            "scope": "channels:read channels:history channels:join groups:read groups:history files:read chat:write",
        },
        "salesforce": {
            "authorize_url": "https://login.salesforce.com/services/oauth2/authorize",
            "token_url": "https://login.salesforce.com/services/oauth2/token",
            "scope": "api refresh_token id",
        },
        "hubspot": {
            "authorize_url": "https://app.hubspot.com/oauth/authorize",
            "token_url": "https://api.hubapi.com/oauth/v3/token",
            "scope": "oauth crm.objects.contacts.read crm.objects.companies.read crm.objects.deals.read",
        },
        "jira": {
            "authorize_url": "https://auth.atlassian.com/authorize",
            "token_url": "https://auth.atlassian.com/oauth/token",
            "scope": "offline_access read:jira-work read:jira-user",
        },
    }.get(connector_id, {})
    return {
        "client_id": os.getenv(f"{prefix}_CLIENT_ID", "").strip(),
        "client_secret": os.getenv(f"{prefix}_CLIENT_SECRET", "").strip(),
        "authorize_url": os.getenv(f"{prefix}_AUTHORIZE_URL", standard.get("authorize_url", "")).strip(),
        "token_url": os.getenv(f"{prefix}_TOKEN_URL", standard.get("token_url", "")).strip(),
        "scope": os.getenv(f"{prefix}_SCOPES", standard.get("scope", "")).strip(),
    }


def _oauth_ready(connector_id: str) -> bool:
    config = _provider_config(connector_id)
    return all(config.get(key) for key in ("client_id", "client_secret", "authorize_url", "token_url"))


def _public_connection(connection: dict[str, Any]) -> dict[str, Any]:
    public = {
        key: value for key, value in connection.items()
        if key not in {"accessToken", "refreshToken", "ownerUserId"}
    }
    if connection.get("connectorId") == "slack":
        token = _TOKENS.get(str(connection.get("connectionId")), {})
        granted = {scope.strip() for scope in str(token.get("scope") or "").replace(" ", ",").split(",") if scope.strip()}
        public["missingScopes"] = sorted(REQUIRED_SLACK_SCOPES - granted)
        public["requiresReconnect"] = bool(public["missingScopes"])
    elif connection.get("connectorId") == "google-workspace":
        token = _TOKENS.get(str(connection.get("connectionId")), {})
        granted = {
            scope.strip()
            for scope in str(token.get("scope") or "").replace(",", " ").split()
            if scope.strip()
        }
        public["missingScopes"] = sorted(REQUIRED_GOOGLE_SCOPES - granted)
        public["requiresReconnect"] = bool(public["missingScopes"])
    return public


def _owned_connection(connection_id: str, owner_user_id: str | None = None) -> dict[str, Any]:
    connection = _CONNECTIONS.get(connection_id)
    if not connection:
        raise ValueError("Connection was not found.")
    if owner_user_id and connection.get("ownerUserId") != owner_user_id:
        raise ValueError("Connection does not belong to this Byizon workspace.")
    return connection


def _owned_connections(owner_user_id: str | None = None) -> list[dict[str, Any]]:
    return [
        item for item in _CONNECTIONS.values()
        if not owner_user_id or item.get("ownerUserId") == owner_user_id
    ]


def list_connectors(owner_user_id: str) -> dict[str, Any]:
    catalog = [
        {
            **item,
            "oauthReady": _oauth_ready(item["id"]),
            "webhookReady": item["id"] == "slack" and slack_configured(),
        }
        for item in CONNECTOR_CATALOG
    ]
    return {
        "catalog": catalog,
        "connections": [_public_connection(item) for item in _owned_connections(owner_user_id)],
        "workspaceUserId": owner_user_id,
        "legacyConnectionsRequireReconnect": sum(
            1 for item in _CONNECTIONS.values() if not item.get("ownerUserId")
        ),
    }


def create_connection(payload: dict[str, Any], owner_user_id: str) -> dict[str, Any]:
    connector_id = str(payload.get("connectorId", "")).strip()
    connector = _connector(connector_id)
    auth_mode = str(payload.get("authMode", "url")).strip().lower()
    if auth_mode not in connector["authModes"]:
        raise ValueError("This authentication mode is not supported by the connector.")
    if auth_mode == "oauth":
        raise ValueError("Use the secure OAuth authorization endpoint for account connections.")

    source_url = str(payload.get("sourceUrl", "")).strip()
    parsed = urlparse(source_url)
    if parsed.scheme not in {"https", "http"} or not parsed.netloc:
        raise ValueError("Enter a valid HTTP or HTTPS source URL.")

    connection = _new_connection(connector_id, "url", owner_user_id, source_url=source_url)
    connection["message"] = "Source registered. Endpoint authorization is verified when data is imported."
    save_connection(connection)
    return _public_connection(connection)


def _new_connection(
    connector_id: str,
    auth_mode: str,
    owner_user_id: str,
    *,
    source_url: str = "",
    account: dict[str, Any] | None = None,
) -> dict[str, Any]:
    connector = _connector(connector_id)
    connection_id = f"conn_{uuid4().hex[:12]}"
    connection = {
        "connectionId": connection_id,
        "ownerUserId": owner_user_id,
        "connectorId": connector_id,
        "name": connector["name"],
        "authMode": auth_mode,
        "sourceUrl": source_url,
        "status": "connected",
        "account": account or {},
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "lastSyncAt": None,
        "message": "Account authorized successfully.",
    }
    _CONNECTIONS[connection_id] = connection
    return connection


def oauth_start(connector_id: str, frontend_return: str | None, owner_user_id: str) -> str:
    _connector(connector_id)
    config = _provider_config(connector_id)
    missing = [key for key in ("client_id", "client_secret", "authorize_url", "token_url") if not config.get(key)]
    if missing:
        prefix = connector_id.upper().replace("-", "_")
        raise ValueError(
            f"{_connector(connector_id)['name']} OAuth is not configured. Set {prefix}_CLIENT_ID and {prefix}_CLIENT_SECRET in the backend environment."
        )

    state = secrets.token_urlsafe(32)
    callback_base = os.getenv("OAUTH_CALLBACK_BASE", "http://localhost:8000").rstrip("/")
    redirect_uri = f"{callback_base}/api/oauth/callback/{connector_id}"
    safe_return = _safe_frontend_return(frontend_return)
    _OAUTH_STATES[state] = {
        "connectorId": connector_id,
        "redirectUri": redirect_uri,
        "frontendReturn": safe_return,
        "createdAt": time.time(),
        "ownerUserId": owner_user_id,
    }
    params = {
        "client_id": config["client_id"],
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "scope": config["scope"],
        "state": state,
    }
    if connector_id == "microsoft-365":
        params.update({"response_mode": "query", "prompt": "select_account"})
    elif connector_id == "google-workspace":
        params.update({
            "access_type": "offline",
            "include_granted_scopes": "true",
            "prompt": "select_account consent",
        })
    elif connector_id == "slack":
        params["scope"] = config["scope"].replace(" ", ",")
    elif connector_id == "jira":
        params.update({"audience": "api.atlassian.com", "prompt": "consent"})
    return f"{config['authorize_url']}?{urlencode(params)}"


def _safe_frontend_return(frontend_return: str | None) -> str:
    fallback = os.getenv("FRONTEND_URL", "http://127.0.0.1:5173/connections")
    candidate = frontend_return or fallback
    parsed = urlparse(candidate)
    fallback_parsed = urlparse(fallback)
    allowed_origins = {
        f"{fallback_parsed.scheme}://{fallback_parsed.netloc}",
        os.getenv("FRONTEND_ORIGIN", "http://127.0.0.1:5173").rstrip("/"),
    }
    if os.getenv("BYIZON_ENV", "development").lower() != "production":
        allowed_origins.update({"http://127.0.0.1:5173", "http://localhost:5173"})
    origin = f"{parsed.scheme}://{parsed.netloc}"
    return candidate if origin in allowed_origins else fallback


def reassign_owner(previous_owner_user_id: str, owner_user_id: str) -> int:
    if not previous_owner_user_id or previous_owner_user_id == owner_user_id:
        return 0
    updated = 0
    for connection in _CONNECTIONS.values():
        if connection.get("ownerUserId") != previous_owner_user_id:
            continue
        connection["ownerUserId"] = owner_user_id
        save_connection(connection, _TOKENS.get(connection["connectionId"]))
        updated += 1
    return updated


def workspace_profile(owner_user_id: str) -> dict[str, Any]:
    google_connection = next(
        (
            item for item in _owned_connections(owner_user_id)
            if item.get("connectorId") == "google-workspace" and item.get("account", {}).get("id")
        ),
        None,
    )
    account = google_connection.get("account", {}) if google_connection else {}
    return {
        "authenticated": bool(google_connection and owner_user_id.startswith("usr_g_")),
        "provider": "google" if google_connection else None,
        "displayName": account.get("displayName") or "Guest Workspace",
        "email": account.get("email") or "",
    }


def oauth_callback(
    connector_id: str,
    query: dict[str, str],
    _callback_user_id: str,
) -> tuple[str, dict[str, Any] | None, str | None, str | None]:
    state = query.get("state", "")
    pending = _OAUTH_STATES.pop(state, None)
    fallback = os.getenv("FRONTEND_URL", "http://127.0.0.1:5173/connections")
    frontend_return = pending.get("frontendReturn", fallback) if pending else fallback
    if not pending or pending.get("connectorId") != connector_id or time.time() - pending["createdAt"] > 600:
        return _result_redirect(frontend_return, "error", "OAuth state is invalid or expired."), None, None, None
    # The callback may use localhost while the frontend uses 127.0.0.1, so its
    # cookie can differ. The random, single-use state securely carries the
    # workspace identity created by the original authorization request.
    state_owner_user_id = str(pending.get("ownerUserId") or "").strip()
    if not state_owner_user_id:
        return _result_redirect(frontend_return, "error", "OAuth workspace identity is missing."), None, None, None
    if query.get("error"):
        message = query.get("error_description") or query.get("error") or "Authorization was denied."
        return _result_redirect(frontend_return, "error", message), None, None, None
    code = query.get("code", "")
    if not code:
        return _result_redirect(frontend_return, "error", "Authorization code was not returned."), None, None, None

    try:
        token = _exchange_code(connector_id, code, pending["redirectUri"])
        account = _fetch_account(connector_id, token)
        authenticated_owner_user_id = None
        connection_owner_user_id = state_owner_user_id
        if connector_id == "google-workspace":
            from .workspace_identity import google_workspace_id

            authenticated_owner_user_id = google_workspace_id(str(account.get("id") or ""))
            reassign_owner(state_owner_user_id, authenticated_owner_user_id)
            connection_owner_user_id = authenticated_owner_user_id
        connection = next(
            (
                item for item in _CONNECTIONS.values()
                if item.get("connectorId") == connector_id
                and item.get("ownerUserId") == connection_owner_user_id
                and account.get("id")
                and item.get("account", {}).get("id") == account.get("id")
            ),
            None,
        )
        if connection:
            connection["account"] = account
            connection["status"] = "connected"
            connection["message"] = "Account authorization updated successfully."
        else:
            connection = _new_connection(connector_id, "oauth", connection_owner_user_id, account=account)
        _TOKENS[connection["connectionId"]] = token
        save_connection(connection, token)
        return (
            _result_redirect(frontend_return, "success", connection["connectionId"]),
            _public_connection(connection),
            authenticated_owner_user_id,
            state_owner_user_id,
        )
    except Exception as exc:
        return _result_redirect(frontend_return, "error", str(exc)), None, None, None


def _result_redirect(frontend_return: str, status: str, value: str) -> str:
    separator = "&" if "?" in frontend_return else "?"
    key = "connectionId" if status == "success" else "message"
    return f"{frontend_return}{separator}oauth={status}&{key}={quote(value, safe='')}"


def _exchange_code(connector_id: str, code: str, redirect_uri: str) -> dict[str, Any]:
    config = _provider_config(connector_id)
    payload = {
        "grant_type": "authorization_code",
        "client_id": config["client_id"],
        "client_secret": config["client_secret"],
        "redirect_uri": redirect_uri,
        "code": code,
    }
    if connector_id == "microsoft-365":
        payload["scope"] = config["scope"]
    token = _http_json(
        config["token_url"],
        method="POST",
        json_body=payload if connector_id == "jira" else None,
        form=None if connector_id == "jira" else payload,
    )
    if connector_id == "slack" and not token.get("ok", False):
        raise ValueError(f"Slack authorization failed: {token.get('error', 'unknown_error')}")
    if not token.get("access_token"):
        raise ValueError("The provider did not return an access token.")
    expires_in = int(token.get("expires_in") or (315360000 if connector_id == "slack" else 3600))
    token["expiresAt"] = time.time() + max(60, expires_in - 60)
    return token


def _refresh_access_token(connection_id: str) -> str:
    connection = _CONNECTIONS.get(connection_id)
    token = _TOKENS.get(connection_id)
    if not connection or not token:
        raise ValueError("Authorized connection was not found. Please connect the account again.")
    if token.get("expiresAt", 0) > time.time():
        return token["access_token"]
    refresh_token = token.get("refresh_token")
    if not refresh_token:
        raise ValueError("Authorization expired. Please connect the account again.")
    config = _provider_config(connection["connectorId"])
    payload = {
        "grant_type": "refresh_token",
        "client_id": config["client_id"],
        "client_secret": config["client_secret"],
        "refresh_token": refresh_token,
    }
    if connection["connectorId"] == "microsoft-365":
        payload["scope"] = config["scope"]
    refreshed = _http_json(
        config["token_url"],
        method="POST",
        json_body=payload if connection["connectorId"] == "jira" else None,
        form=None if connection["connectorId"] == "jira" else payload,
    )
    token.update(refreshed)
    token["refresh_token"] = refreshed.get("refresh_token") or refresh_token
    token["expiresAt"] = time.time() + max(60, int(refreshed.get("expires_in", 3600)) - 60)
    save_connection(connection, token)
    return token["access_token"]


def _fetch_account(connector_id: str, token: dict[str, Any]) -> dict[str, Any]:
    access_token = token["access_token"]
    if connector_id == "microsoft-365":
        data = _http_json("https://graph.microsoft.com/v1.0/me?$select=id,displayName,mail,userPrincipalName", token=access_token)
        return {"id": data.get("id"), "displayName": data.get("displayName"), "email": data.get("mail") or data.get("userPrincipalName")}
    if connector_id == "google-workspace":
        data = _http_json("https://www.googleapis.com/oauth2/v3/userinfo", token=access_token)
        return {"id": data.get("sub"), "displayName": data.get("name"), "email": data.get("email")}
    if connector_id == "salesforce":
        identity_url = token.get("id")
        data = _http_json(identity_url, token=access_token) if identity_url else {}
        return {"id": data.get("user_id"), "displayName": data.get("display_name"), "email": data.get("email"), "instanceUrl": token.get("instance_url")}
    if connector_id == "hubspot":
        return {"id": str(token.get("hub_id") or ""), "displayName": "HubSpot account", "email": ""}
    if connector_id == "slack":
        data = _slack_json("https://slack.com/api/auth.test", access_token)
        return {
            "id": data.get("team_id"),
            "displayName": data.get("team") or "Slack workspace",
            "email": "",
            "user": data.get("user"),
        }
    if connector_id == "jira":
        sites = _http_json_list("https://api.atlassian.com/oauth/token/accessible-resources", token=access_token)
        site = sites[0] if sites else {}
        if not site.get("id"):
            raise ValueError("No Jira Cloud site is available for this account.")
        return {
            "id": site.get("id"),
            "displayName": site.get("name") or "Jira Cloud",
            "url": site.get("url"),
            "scopes": site.get("scopes", []),
        }
    return {"displayName": _connector(connector_id)["name"] + " account"}


def list_resources(connection_id: str, owner_user_id: str | None = None) -> list[dict[str, Any]]:
    connection = _owned_connection(connection_id, owner_user_id)
    if connection["authMode"] != "oauth":
        return [{"id": connection_id, "name": connection["sourceUrl"], "type": "url", "canAnalyze": True}]
    token = _refresh_access_token(connection_id)
    connector_id = connection["connectorId"]
    if connector_id == "microsoft-365":
        data = _http_json("https://graph.microsoft.com/v1.0/me/drive/root/children?$select=id,name,file,folder,size,lastModifiedDateTime,webUrl", token=token)
        supported = (".csv", ".xlsx", ".xls", ".json", ".txt", ".pdf")
        return [
            {"id": item["id"], "name": item.get("name", "Untitled"), "type": "file", "size": item.get("size"), "modifiedAt": item.get("lastModifiedDateTime"), "canAnalyze": item.get("name", "").lower().endswith(supported)}
            for item in data.get("value", []) if item.get("file")
        ]
    if connector_id == "google-workspace":
        return _list_google_resources(token)
    if connector_id == "salesforce":
        instance = _TOKENS[connection_id].get("instance_url") or connection.get("account", {}).get("instanceUrl")
        data = _http_json(f"{instance}/services/data/v61.0/sobjects/", token=token)
        return [
            {"id": item["name"], "name": item.get("label", item["name"]), "type": "crm_object", "canAnalyze": bool(item.get("queryable"))}
            for item in data.get("sobjects", []) if item.get("queryable")
        ][:100]
    if connector_id == "hubspot":
        return [
            {"id": item, "name": item.title(), "type": "crm_object", "canAnalyze": True}
            for item in ("contacts", "companies", "deals")
        ]
    if connector_id == "slack":
        return _list_slack_resources(token)
    if connector_id == "jira":
        cloud_id = connection.get("account", {}).get("id")
        data = _http_json(
            f"https://api.atlassian.com/ex/jira/{quote(str(cloud_id), safe='')}/rest/api/3/project/search?maxResults=100",
            token=token,
        )
        return [
            {
                "id": f"jira:{item.get('key')}",
                "name": f"{item.get('key')} - {item.get('name')}",
                "type": "jira_project",
                "size": None,
                "modifiedAt": None,
                "canAnalyze": bool(item.get("key")),
            }
            for item in data.get("values", []) if item.get("key")
        ]
    return []


def download_resource(connection_id: str, resource_id: str, owner_user_id: str | None = None) -> tuple[str, bytes]:
    connection = _owned_connection(connection_id, owner_user_id)
    if connection["authMode"] == "url":
        return _download_url_source(connection["sourceUrl"])
    token = _refresh_access_token(connection_id)
    connector_id = connection["connectorId"]
    if connector_id == "microsoft-365":
        meta = _http_json(f"https://graph.microsoft.com/v1.0/me/drive/items/{quote(resource_id)}?$select=name", token=token)
        content = _http_bytes(f"https://graph.microsoft.com/v1.0/me/drive/items/{quote(resource_id)}/content", token=token)
        return meta.get("name", "microsoft_data.xlsx"), content
    if connector_id == "google-workspace":
        return _download_google_resource(resource_id, token)
    if connector_id == "salesforce":
        return _download_salesforce_object(connection_id, resource_id, token)
    if connector_id == "hubspot":
        return _download_hubspot_object(resource_id, token)
    if connector_id == "slack":
        if resource_id.startswith("file:"):
            return _download_slack_file(resource_id, token)
        return _download_slack_channel(resource_id, token)
    if connector_id == "jira":
        return _download_jira_project(connection, resource_id, token)
    raise ValueError("This connector does not expose an analyzable resource API yet.")


def _list_google_resources(token: str) -> list[dict[str, Any]]:
    resources: list[dict[str, Any]] = []
    errors: list[dict[str, Any]] = []
    try:
        query = "trashed = false"
        fields = "files(id,name,mimeType,size,modifiedTime,webViewLink)"
        url = f"https://www.googleapis.com/drive/v3/files?q={quote(query)}&pageSize=100&orderBy=modifiedTime%20desc&fields={quote(fields, safe='(),')}"
        data = _http_json(url, token=token)
        allowed = {
            "application/vnd.google-apps.spreadsheet", "text/csv", "application/json", "text/plain",
            "application/pdf", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "application/vnd.google-apps.document",
        }
        resources.extend(
            {
                "id": f"drive:{item['id']}",
                "name": item.get("name", "Untitled"),
                "type": (
                    "google_sheet"
                    if item.get("mimeType") == "application/vnd.google-apps.spreadsheet"
                    else "google_doc"
                    if item.get("mimeType") == "application/vnd.google-apps.document"
                    else "google_drive_file"
                ),
                "size": item.get("size"),
                "modifiedAt": item.get("modifiedTime"),
                "canAnalyze": item.get("mimeType") in allowed,
            }
            for item in data.get("files", [])
            if item.get("id")
        )
    except ValueError as exc:
        errors.append(_source_error("Google Drive / Sheets", str(exc)))

    try:
        profile = _http_json("https://gmail.googleapis.com/gmail/v1/users/me/profile", token=token)
        resources.append({
            "id": "gmail:recent",
            "name": "Gmail - recent messages",
            "type": "gmail_messages",
            "size": profile.get("messagesTotal"),
            "modifiedAt": None,
            "canAnalyze": True,
        })
    except ValueError as exc:
        errors.append(_source_error("Gmail", str(exc)))

    try:
        calendars = _http_json("https://www.googleapis.com/calendar/v3/users/me/calendarList?maxResults=100", token=token)
        resources.extend(
            {
                "id": f"calendar:{item['id']}",
                "name": f"Calendar - {item.get('summary') or item['id']}",
                "type": "google_calendar_events",
                "size": None,
                "modifiedAt": None,
                "canAnalyze": True,
            }
            for item in calendars.get("items", [])
            if item.get("id")
        )
    except ValueError as exc:
        errors.append(_source_error("Google Calendar", str(exc)))
    return resources + errors


def _source_error(source: str, message: str) -> dict[str, Any]:
    return {
        "id": f"error:{source.lower().replace(' ', '-')}",
        "name": f"{source} unavailable",
        "type": "permission_error",
        "canAnalyze": False,
        "message": message[:280],
    }


def _download_google_resource(resource_id: str, token: str) -> tuple[str, bytes]:
    if resource_id.startswith("gmail:"):
        return _download_gmail_messages(token)
    if resource_id.startswith("calendar:"):
        return _download_calendar_events(resource_id.split(":", 1)[1], token)

    drive_id = resource_id.split(":", 1)[1] if resource_id.startswith("drive:") else resource_id
    encoded_id = quote(drive_id, safe="")
    meta = _http_json(f"https://www.googleapis.com/drive/v3/files/{encoded_id}?fields=id,name,mimeType", token=token)
    if meta.get("mimeType") == "application/vnd.google-apps.spreadsheet":
        mime = quote("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", safe="")
        name = meta.get("name", "google_sheet")
        return f"{name}.xlsx", _http_bytes(
            f"https://www.googleapis.com/drive/v3/files/{encoded_id}/export?mimeType={mime}", token=token,
        )
    if meta.get("mimeType") == "application/vnd.google-apps.document":
        mime = quote("text/plain", safe="")
        name = meta.get("name", "google_doc")
        return f"{name}.txt", _http_bytes(
            f"https://www.googleapis.com/drive/v3/files/{encoded_id}/export?mimeType={mime}", token=token,
        )
    return meta.get("name", "google_drive_file"), _http_bytes(
        f"https://www.googleapis.com/drive/v3/files/{encoded_id}?alt=media", token=token,
    )


def _download_gmail_messages(token: str) -> tuple[str, bytes]:
    message_ids: list[str] = []
    page_token = ""
    while len(message_ids) < 250:
        params = {"maxResults": min(100, 250 - len(message_ids)), "q": "newer_than:1y"}
        if page_token:
            params["pageToken"] = page_token
        listing = _http_json(f"https://gmail.googleapis.com/gmail/v1/users/me/messages?{urlencode(params)}", token=token)
        message_ids.extend(item["id"] for item in listing.get("messages", []) if item.get("id"))
        page_token = listing.get("nextPageToken", "")
        if not page_token:
            break

    rows: list[dict[str, Any]] = []
    for message_id in message_ids:
        params = urlencode({"format": "metadata", "metadataHeaders": ["From", "To", "Cc", "Subject", "Date"]}, doseq=True)
        item = _http_json(
            f"https://gmail.googleapis.com/gmail/v1/users/me/messages/{quote(message_id, safe='')}?{params}",
            token=token,
        )
        headers = {
            str(header.get("name", "")).lower(): header.get("value", "")
            for header in item.get("payload", {}).get("headers", [])
        }
        internal_date = item.get("internalDate")
        rows.append({
            "message_id": item.get("id"),
            "thread_id": item.get("threadId"),
            "timestamp_utc": datetime.fromtimestamp(int(internal_date) / 1000, timezone.utc).isoformat() if internal_date else None,
            "from": headers.get("from"),
            "to": headers.get("to"),
            "cc": headers.get("cc"),
            "subject": headers.get("subject"),
            "date_header": headers.get("date"),
            "labels": ", ".join(item.get("labelIds", [])),
            "snippet": item.get("snippet"),
            "estimated_size_bytes": item.get("sizeEstimate"),
        })
    return "google_gmail_recent.json", json.dumps(rows, ensure_ascii=False).encode("utf-8")


def _download_calendar_events(calendar_id: str, token: str) -> tuple[str, bytes]:
    now = datetime.now(timezone.utc)
    params = urlencode({
        "singleEvents": "true",
        "orderBy": "startTime",
        "maxResults": 2500,
        "timeMin": (now - timedelta(days=365)).isoformat().replace("+00:00", "Z"),
        "timeMax": (now + timedelta(days=365)).isoformat().replace("+00:00", "Z"),
    })
    data = _http_json(
        f"https://www.googleapis.com/calendar/v3/calendars/{quote(calendar_id, safe='')}/events?{params}",
        token=token,
    )
    rows = []
    for item in data.get("items", []):
        attendees = item.get("attendees", [])
        rows.append({
            "event_id": item.get("id"),
            "status": item.get("status"),
            "summary": item.get("summary"),
            "description": item.get("description"),
            "start": item.get("start", {}).get("dateTime") or item.get("start", {}).get("date"),
            "end": item.get("end", {}).get("dateTime") or item.get("end", {}).get("date"),
            "created": item.get("created"),
            "updated": item.get("updated"),
            "location": item.get("location"),
            "organizer": item.get("organizer", {}).get("email"),
            "attendee_count": len(attendees),
            "accepted_count": sum(1 for attendee in attendees if attendee.get("responseStatus") == "accepted"),
            "meeting_link": item.get("hangoutLink"),
        })
    return "google_calendar_events.json", json.dumps(rows, ensure_ascii=False).encode("utf-8")


def _list_slack_resources(token: str) -> list[dict[str, Any]]:
    channel_data = _slack_json(
        "https://slack.com/api/conversations.list?types=public_channel,private_channel&exclude_archived=true&limit=200",
        token,
    )
    channels = [item for item in channel_data.get("channels", []) if item.get("id")]
    channel_names = {item["id"]: item.get("name", item["id"]) for item in channels}
    resources = [
        {
            "id": f"channel:{item['id']}",
            "name": f"#{item.get('name', item['id'])} messages",
            "type": "slack_channel",
            "size": item.get("num_members"),
            "modifiedAt": None,
            "canAnalyze": True,
            "channelNames": [item.get("name", item["id"])],
            "isMember": bool(item.get("is_member")),
            "isPrivate": bool(item.get("is_private")),
        }
        for item in channels
    ]

    try:
        files_data = _slack_json("https://slack.com/api/files.list?count=100&page=1", token)
    except ValueError as exc:
        if "missing_scope" in str(exc):
            resources.append(_source_error("Slack files", "Reconnect Slack to grant the files:read permission."))
            return resources
        raise

    supported = (".csv", ".tsv", ".xlsx", ".xls", ".json", ".pdf", ".txt", ".log", ".sql", ".sqlite", ".sqlite3", ".db")
    for item in files_data.get("files", []):
        file_id = item.get("id")
        if not file_id:
            continue
        name = item.get("name") or item.get("title") or f"slack_file_{file_id}"
        file_channels = item.get("channels", []) + item.get("groups", [])
        resources.append({
            "id": f"file:{file_id}",
            "name": name,
            "type": "slack_file",
            "size": item.get("size"),
            "modifiedAt": datetime.fromtimestamp(item.get("timestamp"), timezone.utc).isoformat() if item.get("timestamp") else None,
            "canAnalyze": name.lower().endswith(supported),
            "channelNames": [channel_names.get(channel_id, channel_id) for channel_id in file_channels],
            "title": item.get("title"),
        })
    return resources


def _download_slack_channel(resource_id: str, token: str) -> tuple[str, bytes]:
    channel_id = resource_id.split(":", 1)[1] if resource_id.startswith("channel:") else resource_id
    rows: list[dict[str, Any]] = []
    cursor = ""
    while len(rows) < 1000:
        params: dict[str, Any] = {"channel": channel_id, "limit": min(200, 1000 - len(rows))}
        if cursor:
            params["cursor"] = cursor
        try:
            data = _slack_json(f"https://slack.com/api/conversations.history?{urlencode(params)}", token)
        except ValueError as exc:
            if "not_in_channel" not in str(exc):
                raise
            try:
                _slack_json(
                    "https://slack.com/api/conversations.join",
                    token,
                    method="POST",
                    form={"channel": channel_id},
                )
            except ValueError as join_exc:
                if "missing_scope" in str(join_exc):
                    raise ValueError(
                        "Slack app is not a member of this channel. Invite the connected app from the channel Integrations menu, "
                        "or reconnect Slack to grant channels:join."
                    ) from join_exc
                raise ValueError(
                    "Slack app cannot access this channel. For a private channel, invite the connected app from the channel Integrations menu."
                ) from join_exc
            data = _slack_json(f"https://slack.com/api/conversations.history?{urlencode(params)}", token)
        for item in data.get("messages", []):
            timestamp = item.get("ts")
            rows.append({
                "channel_id": channel_id,
                "message_ts": timestamp,
                "timestamp_utc": datetime.fromtimestamp(float(timestamp), timezone.utc).isoformat() if timestamp else None,
                "user_id": item.get("user") or item.get("bot_id"),
                "message_type": item.get("subtype") or item.get("type"),
                "text": item.get("text"),
                "thread_ts": item.get("thread_ts"),
                "reply_count": item.get("reply_count", 0),
                "reaction_count": sum(reaction.get("count", 0) for reaction in item.get("reactions", [])),
            })
        cursor = data.get("response_metadata", {}).get("next_cursor", "")
        if not cursor:
            break
    return f"slack_{channel_id}_messages.json", json.dumps(rows, ensure_ascii=False).encode("utf-8")


def _download_slack_file(resource_id: str, token: str) -> tuple[str, bytes]:
    file_id = resource_id.split(":", 1)[1]
    data = _slack_json(f"https://slack.com/api/files.info?file={quote(file_id, safe='')}", token)
    item = data.get("file", {})
    name = item.get("name") or item.get("title") or f"slack_file_{file_id}"
    download_url = item.get("url_private_download") or item.get("url_private")
    if not download_url:
        raise ValueError("Slack did not provide a downloadable URL for this file.")
    content = _http_bytes(download_url, token=token, max_bytes=100 * 1024 * 1024)
    return name, content


def _join_slack_channel(channel_id: str, token: str) -> None:
    try:
        _slack_json(
            "https://slack.com/api/conversations.join",
            token,
            method="POST",
            form={"channel": channel_id},
        )
    except ValueError as exc:
        if "missing_scope" in str(exc):
            raise ValueError(
                "Slack needs the channels:join permission. Reconnect Slack after adding the new scopes."
            ) from exc
        raise


def _download_salesforce_object(connection_id: str, object_name: str, token: str) -> tuple[str, bytes]:
    instance = _TOKENS[connection_id].get("instance_url") or _CONNECTIONS[connection_id].get("account", {}).get("instanceUrl")
    describe = _http_json(f"{instance}/services/data/v61.0/sobjects/{quote(object_name)}/describe", token=token)
    fields = [item["name"] for item in describe.get("fields", []) if item.get("name") and not item.get("deprecatedAndHidden")][:80]
    if not fields:
        raise ValueError("No readable fields were found for this Salesforce object.")
    soql = f"SELECT {','.join(fields)} FROM {object_name} LIMIT 5000"
    data = _http_json(f"{instance}/services/data/v61.0/query?q={quote(soql)}", token=token)
    rows = [{key: value for key, value in row.items() if key != "attributes"} for row in data.get("records", [])]
    return f"salesforce_{object_name}.json", json.dumps(rows, ensure_ascii=False).encode("utf-8")


def _download_hubspot_object(object_name: str, token: str) -> tuple[str, bytes]:
    properties_data = _http_json(f"https://api.hubapi.com/crm/v3/properties/{quote(object_name)}", token=token)
    properties = [item["name"] for item in properties_data.get("results", []) if not item.get("hidden")][:50]
    rows = []
    after = ""
    while len(rows) < 5000:
        request_params = {"limit": min(100, 5000 - len(rows)), "archived": "false", "properties": ",".join(properties)}
        if after:
            request_params["after"] = after
        data = _http_json(
            f"https://api.hubapi.com/crm/v3/objects/{quote(object_name)}?{urlencode(request_params)}",
            token=token,
        )
        for item in data.get("results", []):
            rows.append({"id": item.get("id"), **item.get("properties", {}), "createdAt": item.get("createdAt"), "updatedAt": item.get("updatedAt")})
        after = str(data.get("paging", {}).get("next", {}).get("after") or "")
        if not after:
            break
    return f"hubspot_{object_name}.json", json.dumps(rows, ensure_ascii=False).encode("utf-8")


def _download_jira_project(connection: dict[str, Any], resource_id: str, token: str) -> tuple[str, bytes]:
    project_key = resource_id.split(":", 1)[1] if resource_id.startswith("jira:") else resource_id
    cloud_id = str(connection.get("account", {}).get("id") or "")
    if not project_key or not cloud_id:
        raise ValueError("Jira project or Cloud ID is missing.")
    fields = "summary,status,priority,assignee,reporter,issuetype,created,updated,resolutiondate,labels,components"
    rows: list[dict[str, Any]] = []
    next_page_token = ""
    while len(rows) < 5000:
        params = {
            "jql": f"project = {project_key} ORDER BY created DESC",
            "maxResults": min(100, 5000 - len(rows)),
            "fields": fields,
        }
        if next_page_token:
            params["nextPageToken"] = next_page_token
        data = _http_json(
            f"https://api.atlassian.com/ex/jira/{quote(cloud_id, safe='')}/rest/api/3/search/jql?{urlencode(params)}",
            token=token,
        )
        for issue in data.get("issues", []):
            values = issue.get("fields", {})
            rows.append({
                "issue_id": issue.get("id"),
                "issue_key": issue.get("key"),
                "summary": values.get("summary"),
                "issue_type": (values.get("issuetype") or {}).get("name"),
                "status": (values.get("status") or {}).get("name"),
                "priority": (values.get("priority") or {}).get("name"),
                "assignee": (values.get("assignee") or {}).get("displayName"),
                "reporter": (values.get("reporter") or {}).get("displayName"),
                "created": values.get("created"),
                "updated": values.get("updated"),
                "resolution_date": values.get("resolutiondate"),
                "labels": ", ".join(values.get("labels") or []),
                "components": ", ".join(item.get("name", "") for item in values.get("components") or []),
            })
        next_page_token = str(data.get("nextPageToken") or "")
        if not next_page_token or data.get("isLast") is True:
            break
    return f"jira_{project_key}_issues.json", json.dumps(rows, ensure_ascii=False).encode("utf-8")


def _download_url_source(source_url: str) -> tuple[str, bytes]:
    parsed = urlparse(source_url)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        raise ValueError("The source URL is invalid.")
    if parsed.hostname.lower() in {"localhost", "127.0.0.1", "::1"}:
        raise ValueError("Local and loopback source URLs are not allowed.")
    name = parsed.path.rsplit("/", 1)[-1] or "connected_data.csv"
    return name, _http_bytes(source_url, max_bytes=100 * 1024 * 1024)


def remove_connection(connection_id: str, owner_user_id: str | None = None) -> bool:
    _owned_connection(connection_id, owner_user_id)
    _TOKENS.pop(connection_id, None)
    removed = _CONNECTIONS.pop(connection_id, None) is not None
    if removed:
        delete_connection(connection_id)
    return removed


def mark_connection_synced(connection_id: str, owner_user_id: str | None = None) -> None:
    connection = _owned_connection(connection_id, owner_user_id)
    connection["lastSyncAt"] = datetime.now(timezone.utc).isoformat()
    save_connection(connection, _TOKENS.get(connection_id))


def connected_source_metadata(connection_id: str, resource: dict[str, Any]) -> dict[str, Any]:
    connection = _CONNECTIONS.get(connection_id) or {}
    return {
        "connectorId": connection.get("connectorId"),
        "connectionId": connection_id,
        "resourceId": resource.get("id"),
        "resourceName": resource.get("name"),
        "resourceType": resource.get("type"),
        "size": resource.get("size"),
        "modifiedAt": resource.get("modifiedAt"),
        "importedAt": datetime.now(timezone.utc).isoformat(),
    }


def validate_connected_source(source: dict[str, Any], owner_user_id: str | None = None) -> dict[str, Any]:
    connection_id = str(source.get("connectionId") or "").strip()
    resource_id = str(source.get("resourceId") or "").strip()
    if not connection_id or not resource_id:
        return {"valid": False, "reason": "missing_source_identity"}
    if connection_id not in _CONNECTIONS:
        return {"valid": False, "reason": "connection_removed"}
    try:
        _owned_connection(connection_id, owner_user_id)
    except ValueError:
        return {"valid": False, "reason": "connection_not_owned"}
    resources = list_resources(connection_id, owner_user_id)
    resource = next((item for item in resources if item.get("id") == resource_id), None)
    if not resource:
        return {"valid": False, "reason": "resource_deleted_or_inaccessible"}
    if not resource.get("canAnalyze"):
        return {"valid": False, "reason": "resource_not_analyzable", "resource": resource}
    changed = any(
        source.get(field) is not None and resource.get(field) is not None and source.get(field) != resource.get(field)
        for field in ("size", "modifiedAt")
    )
    return {"valid": True, "changed": changed, "resource": resource}


def _latest_owned_connection(connector_id: str, owner_user_id: str | None) -> dict[str, Any] | None:
    connections = [
        item for item in _owned_connections(owner_user_id)
        if item.get("connectorId") == connector_id and item.get("status") == "connected"
    ]
    return sorted(connections, key=lambda item: item.get("createdAt", ""), reverse=True)[0] if connections else None


def _analysis_report_text(analysis: dict[str, Any] | None) -> str:
    if not analysis:
        return ""
    lines = [
        f"Byizon analysis report: {analysis.get('fileName', 'Current dataset')}",
        f"Rows analyzed: {int(analysis.get('rowCount') or 0):,}",
        f"Columns analyzed: {int(analysis.get('colCount') or 0):,}",
        "",
        "Key metrics:",
    ]
    metrics = [
        item for item in (analysis.get("kpis") or [])[:10]
        if item.get("label") and item.get("value") is not None
    ]
    lines.extend(f"- {item['label']}: {item['value']}" for item in metrics)
    summary = str(analysis.get("summary") or analysis.get("executiveSummary") or "").strip()
    if summary:
        lines.extend(["", "Summary:", summary[:3000]])
    return "\n".join(lines).strip()


def _labeled_value(question: str, label: str) -> str:
    match = re.search(
        rf"(?:^|\s){re.escape(label)}\s*[:=]\s*(.+?)(?=\s+(?:subject|body|message|content|title)\s*[:=]|$)",
        question,
        flags=re.IGNORECASE,
    )
    return match.group(1).strip().strip("\"'") if match else ""


def _google_action_connection(owner_user_id: str | None) -> tuple[dict[str, Any] | None, dict[str, Any] | None]:
    connection = _latest_owned_connection("google-workspace", owner_user_id)
    if not connection:
        return None, {
            "status": "unavailable",
            "message": "Connect Google Workspace first, then repeat this command.",
            "connector": "google-workspace",
        }
    token_record = _TOKENS.get(str(connection.get("connectionId")), {})
    granted = {
        scope.strip()
        for scope in str(token_record.get("scope") or "").replace(",", " ").split()
        if scope.strip()
    }
    missing = sorted(REQUIRED_GOOGLE_SCOPES - granted)
    if missing:
        return None, {
            "status": "permission_required",
            "message": (
                "Reconnect Google Workspace once and approve the new Sheets, Gmail, Calendar, and Docs permissions. "
                "The existing connection has read-only or incomplete access."
            ),
            "connector": "google-workspace",
        }
    return connection, None


def _send_gmail_command(
    question: str,
    analysis: dict[str, Any] | None,
    connection: dict[str, Any],
    owner_user_id: str | None,
) -> dict[str, Any]:
    recipient_match = re.search(r"[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}", question)
    if not recipient_match:
        return {
            "status": "selection_required",
            "message": "Recipient email is required. Example: Gmail se name@example.com ko current report bhejo.",
            "connector": "google-workspace",
            "providerAction": "gmail_send",
        }
    recipient = recipient_match.group(0)
    report = _analysis_report_text(analysis)
    body = _labeled_value(question, "body") or _labeled_value(question, "message") or report
    if not body:
        return {
            "status": "selection_required",
            "message": "Add `body: your message` or analyze a dataset before sending the email.",
            "connector": "google-workspace",
            "providerAction": "gmail_send",
        }
    subject = _labeled_value(question, "subject")
    if not subject:
        subject = f"Byizon report - {(analysis or {}).get('fileName', 'Workspace update')}"
    email = EmailMessage()
    email["To"] = recipient
    email["Subject"] = subject[:200]
    email.set_content(body[:15000])
    raw = base64.urlsafe_b64encode(email.as_bytes()).decode("ascii")
    token = _refresh_access_token(connection["connectionId"])
    result = _http_json(
        "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
        method="POST",
        json_body={"raw": raw},
        token=token,
    )
    mark_connection_synced(connection["connectionId"], owner_user_id)
    return {
        "status": "complete",
        "message": f"Email sent to {recipient} from the authorized Gmail account.",
        "connector": "google-workspace",
        "providerAction": "gmail_send",
        "resource": result.get("id"),
    }


def _create_google_doc_command(
    question: str,
    analysis: dict[str, Any] | None,
    connection: dict[str, Any],
    owner_user_id: str | None,
) -> dict[str, Any]:
    content = _labeled_value(question, "content") or _analysis_report_text(analysis)
    if not content:
        return {
            "status": "selection_required",
            "message": "Add `content: ...` or analyze a dataset before creating the Google Doc.",
            "connector": "google-workspace",
            "providerAction": "google_doc_create",
        }
    title = _labeled_value(question, "title")
    if not title:
        base_name = str((analysis or {}).get("fileName") or "Workspace report").rsplit(".", 1)[0]
        title = f"Byizon - {base_name}"
    token = _refresh_access_token(connection["connectionId"])
    document = _http_json(
        "https://docs.googleapis.com/v1/documents",
        method="POST",
        json_body={"title": title[:240]},
        token=token,
    )
    document_id = str(document.get("documentId") or "")
    if not document_id:
        raise ValueError("Google Docs did not return a document ID.")
    _http_json(
        f"https://docs.googleapis.com/v1/documents/{quote(document_id, safe='')}:batchUpdate",
        method="POST",
        json_body={"requests": [{"insertText": {"location": {"index": 1}, "text": content[:50000]}}]},
        token=token,
    )
    mark_connection_synced(connection["connectionId"], owner_user_id)
    document_url = f"https://docs.google.com/document/d/{document_id}/edit"
    return {
        "status": "complete",
        "message": f'Google Doc "{title}" created in the authorized account.',
        "connector": "google-workspace",
        "providerAction": "google_doc_create",
        "resource": document_id,
        "url": document_url,
    }


def _create_calendar_event_command(
    question: str,
    connection: dict[str, Any],
    owner_user_id: str | None,
) -> dict[str, Any]:
    date_match = re.search(r"\b(20\d{2}-\d{2}-\d{2})\b", question)
    time_match = re.search(r"\b([01]\d|2[0-3]):([0-5]\d)\b", question)
    if not date_match or not time_match:
        return {
            "status": "selection_required",
            "message": "Use an exact date and time. Example: Calendar event create karo title: Review on 2026-07-20 15:30.",
            "connector": "google-workspace",
            "providerAction": "calendar_event_create",
        }
    try:
        local_zone = timezone(timedelta(hours=5, minutes=30))
        start = datetime.fromisoformat(f"{date_match.group(1)}T{time_match.group(0)}").replace(tzinfo=local_zone)
    except ValueError:
        return {
            "status": "selection_required",
            "message": "Calendar date or time is invalid. Use YYYY-MM-DD HH:MM.",
            "connector": "google-workspace",
            "providerAction": "calendar_event_create",
        }
    duration_match = re.search(r"\b(?:for|duration)\s*[:=]?\s*(\d{1,3})\s*(?:minutes?|mins?)\b", question, re.IGNORECASE)
    duration = max(5, min(720, int(duration_match.group(1)))) if duration_match else 60
    title_match = re.search(
        r"(?:^|\s)title\s*[:=]\s*(.+?)(?=\s+(?:on\s+)?20\d{2}-\d{2}-\d{2}\b|$)",
        question,
        flags=re.IGNORECASE,
    )
    title = title_match.group(1).strip().strip("\"'") if title_match else "Byizon scheduled event"
    description = _labeled_value(question, "content") or _labeled_value(question, "message")
    token = _refresh_access_token(connection["connectionId"])
    event = _http_json(
        "https://www.googleapis.com/calendar/v3/calendars/primary/events?sendUpdates=none",
        method="POST",
        json_body={
            "summary": title[:240],
            "description": description[:4000],
            "start": {"dateTime": start.isoformat(), "timeZone": "Asia/Kolkata"},
            "end": {"dateTime": (start + timedelta(minutes=duration)).isoformat(), "timeZone": "Asia/Kolkata"},
        },
        token=token,
    )
    mark_connection_synced(connection["connectionId"], owner_user_id)
    return {
        "status": "complete",
        "message": f'Calendar event "{title}" created for {start.strftime("%d %b %Y, %I:%M %p")} IST.',
        "connector": "google-workspace",
        "providerAction": "calendar_event_create",
        "resource": event.get("id"),
        "url": event.get("htmlLink"),
    }


def _append_google_sheet_command(
    question: str,
    analysis: dict[str, Any] | None,
    connection: dict[str, Any],
    owner_user_id: str | None,
) -> dict[str, Any]:
    if not analysis:
        return {
            "status": "selection_required",
            "message": "Analyze a dataset first, then ask me to save the current report to Google Sheets.",
            "connector": "google-workspace",
            "providerAction": "google_sheet_append",
        }
    token = _refresh_access_token(connection["connectionId"])
    normalized = _match_text(question)
    create_new = any(phrase in normalized for phrase in ("create new", "new sheet", "nayi sheet", "naya sheet"))
    sheets = [
        item for item in _list_google_resources(token)
        if item.get("type") == "google_sheet" and item.get("canAnalyze")
    ]
    matches = [
        item for item in sheets
        if _match_text(str(item.get("name") or "")) in normalized
    ]
    sheet: dict[str, Any]
    if create_new or not sheets:
        title = _labeled_value(question, "title") or f"Byizon - {str(analysis.get('fileName') or 'Analysis').rsplit('.', 1)[0]}"
        created = _http_json(
            "https://sheets.googleapis.com/v4/spreadsheets",
            method="POST",
            json_body={"properties": {"title": title[:240]}},
            token=token,
        )
        spreadsheet_id = str(created.get("spreadsheetId") or "")
        sheet = {"id": f"drive:{spreadsheet_id}", "name": title}
    elif len(matches) == 1:
        sheet = matches[0]
        spreadsheet_id = str(sheet["id"]).split(":", 1)[-1]
    elif len(sheets) == 1:
        sheet = sheets[0]
        spreadsheet_id = str(sheet["id"]).split(":", 1)[-1]
    else:
        names = ", ".join(str(item.get("name") or "Untitled") for item in sheets[:10])
        return {
            "status": "selection_required",
            "message": f"Specify one Google Sheet name or say `create new sheet`. Available: {names}.",
            "connector": "google-workspace",
            "providerAction": "google_sheet_append",
        }
    if not spreadsheet_id:
        raise ValueError("Google Sheets did not return a spreadsheet ID.")
    timestamp = datetime.now(timezone.utc).isoformat()
    rows = [
        [timestamp, analysis.get("fileName", "Current dataset"), "Rows analyzed", int(analysis.get("rowCount") or 0)],
        [timestamp, analysis.get("fileName", "Current dataset"), "Columns analyzed", int(analysis.get("colCount") or 0)],
    ]
    rows.extend(
        [timestamp, analysis.get("fileName", "Current dataset"), item.get("label"), item.get("value")]
        for item in (analysis.get("kpis") or [])[:10]
        if item.get("label") and item.get("value") is not None
    )
    _http_json(
        (
            f"https://sheets.googleapis.com/v4/spreadsheets/{quote(spreadsheet_id, safe='')}"
            "/values/A%3AD:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS"
        ),
        method="POST",
        json_body={"majorDimension": "ROWS", "values": rows},
        token=token,
    )
    mark_connection_synced(connection["connectionId"], owner_user_id)
    sheet_url = f"https://docs.google.com/spreadsheets/d/{spreadsheet_id}/edit"
    return {
        "status": "complete",
        "message": f'Current calculated report appended to Google Sheet "{sheet.get("name")}".',
        "connector": "google-workspace",
        "providerAction": "google_sheet_append",
        "resource": spreadsheet_id,
        "url": sheet_url,
    }


def _execute_google_command(
    question: str,
    analysis: dict[str, Any] | None,
    owner_user_id: str | None,
) -> dict[str, Any] | None:
    normalized = _match_text(question)
    write_words = ("send", "bhejo", "bhjo", "create", "banao", "schedule", "book", "append", "write", "save")
    if not any(word in normalized for word in write_words):
        return None
    gmail_intent = any(word in normalized for word in ("gmail", "email", "mail"))
    calendar_intent = "calendar" in normalized or "event" in normalized
    doc_intent = any(word in normalized for word in ("google doc", "google document", "docs"))
    sheet_intent = any(word in normalized for word in ("google sheet", "spreadsheet", "sheets"))
    if not any((gmail_intent, calendar_intent, doc_intent, sheet_intent)):
        return None
    connection, error = _google_action_connection(owner_user_id)
    if error:
        return error
    if gmail_intent:
        return _send_gmail_command(question, analysis, connection, owner_user_id)
    if calendar_intent:
        return _create_calendar_event_command(question, connection, owner_user_id)
    if doc_intent:
        return _create_google_doc_command(question, analysis, connection, owner_user_id)
    return _append_google_sheet_command(question, analysis, connection, owner_user_id)


def execute_connected_command(
    question: str,
    analysis: dict[str, Any] | None,
    owner_user_id: str | None = None,
) -> dict[str, Any] | None:
    google_command = _execute_google_command(question, analysis, owner_user_id)
    if google_command:
        return google_command
    normalized = _match_text(question)
    send_intent = any(token in normalized for token in ("send", "post", "share", "bhejo", "bhjo", "publish"))
    slack_intent = "slack" in normalized or "channel" in normalized or "#" in question
    if not send_intent or not slack_intent:
        return None
    if not analysis:
        return {
            "status": "unavailable",
            "message": "Analyze or upload a dataset before sending a report to Slack.",
        }

    connections = [
        item for item in _owned_connections(owner_user_id)
        if item.get("connectorId") == "slack" and item.get("status") == "connected"
    ]
    if not connections:
        return {"status": "unavailable", "message": "Connect Slack first, then repeat the send command."}
    connection = sorted(connections, key=lambda item: item.get("createdAt", ""), reverse=True)[0]
    resources = list_resources(connection["connectionId"], owner_user_id)
    channels = [item for item in resources if item.get("type") == "slack_channel"]
    requested = _match_text(re.search(r"#([\w-]+)", question).group(1)) if re.search(r"#([\w-]+)", question) else ""
    matching = [
        channel for channel in channels
        if any(
            (requested and _match_text(str(name)) == requested)
            or (not requested and _match_text(str(name)) in normalized)
            for name in channel.get("channelNames", [])
        )
    ]
    if len(matching) != 1:
        available = ", ".join(f"#{item.get('channelNames', ['unknown'])[0]}" for item in channels[:12])
        return {
            "status": "selection_required",
            "message": f"Specify one Slack channel. Available channels: {available or 'none visible'}.",
        }

    channel = matching[0]
    token = _refresh_access_token(connection["connectionId"])
    channel_id = channel["id"].split(":", 1)[1]
    if not channel.get("isMember") and not channel.get("isPrivate"):
        _join_slack_channel(channel_id, token)
    kpi_lines = [
        f"- {item.get('label')}: {item.get('value')}"
        for item in (analysis.get("kpis") or [])[:6]
        if item.get("label") and item.get("value") is not None
    ]
    summary = str(analysis.get("summary") or "").strip()
    message = "\n".join([
        f"Byizon report: {analysis.get('fileName', 'Current dataset')}",
        f"Rows analyzed: {int(analysis.get('rowCount') or 0):,}",
        *(kpi_lines or ["- No report KPIs were available."]),
        "",
        summary[:1200],
    ]).strip()[:3000]
    _slack_json(
        "https://slack.com/api/chat.postMessage",
        token,
        method="POST",
        form={"channel": channel_id, "text": message},
    )
    mark_connection_synced(connection["connectionId"], owner_user_id)
    channel_name = channel.get("channelNames", [channel_id])[0]
    return {
        "status": "complete",
        "message": f"Report sent to #{channel_name} using this workspace's authorized Slack connection.",
        "connector": "slack",
        "channel": channel_name,
    }


def resolve_connected_resource(question: str, owner_user_id: str | None = None) -> dict[str, Any] | None:
    normalized_question = _match_text(question)
    import_intent = any(
        token in normalized_question
        for token in ("analy", "analyse", "analysis", "fetch", "import", "load", "lao", "lekar", "mang", "data")
    )
    connector_aliases = {
        "slack": ("slack", "channel"),
        "google-workspace": ("google", "gmail", "sheet", "sheets", "calendar", "drive", "docs", "document"),
        "hubspot": ("hubspot",),
        "salesforce": ("salesforce",),
        "jira": ("jira", "atlassian"),
        "microsoft-365": ("microsoft", "office", "onedrive", "sharepoint"),
    }
    requested_connector = next(
        (connector_id for connector_id, aliases in connector_aliases.items() if any(alias in normalized_question for alias in aliases)),
        None,
    )
    source_intent = bool(requested_connector) or any(token in normalized_question for token in ("connected", "workspace"))
    file_intent = any(token in normalized_question for token in ("file", "dataset", "excel", "sheet", "spreadsheet", "data"))
    message_intent = any(token in normalized_question for token in ("message", "messages", "chat", "conversation"))
    if requested_connector and requested_connector != "slack" and import_intent:
        provider_connections = [
            item for item in _owned_connections(owner_user_id)
            if item.get("connectorId") == requested_connector and item.get("status") == "connected"
        ]
        provider_name = _connector(requested_connector)["name"]
        if not provider_connections:
            return {
                "status": "unavailable",
                "message": f"Connect {provider_name} first, then repeat this command.",
                "invalidateCurrentAnalysis": False,
            }
        provider_connection = sorted(provider_connections, key=lambda item: item.get("createdAt", ""), reverse=True)[0]
        provider_resources = [
            item for item in list_resources(provider_connection["connectionId"], owner_user_id)
            if item.get("canAnalyze")
        ]
        if not provider_resources:
            return {
                "status": "unavailable",
                "message": f"{provider_name} is connected, but it currently exposes no analyzable resource.",
                "invalidateCurrentAnalysis": False,
            }
        scored_resources = []
        for resource in provider_resources:
            name = _match_text(str(resource.get("name") or ""))
            score = 100 if name and name in normalized_question else 0
            score += 5 * len(set(normalized_question.split()) & set(name.split()))
            scored_resources.append((score, resource))
        scored_resources.sort(key=lambda item: item[0], reverse=True)
        if scored_resources[0][0] <= 5 and len(provider_resources) > 1:
            names = ", ".join(item.get("name", "Unnamed") for item in provider_resources[:8])
            return {
                "status": "selection_required",
                "message": f"Specify which {provider_name} resource to analyze. Available: {names}.",
                "invalidateCurrentAnalysis": False,
            }
        return {
            "status": "ready",
            "connectionId": provider_connection["connectionId"],
            "resource": scored_resources[0][1],
        }

    slack_connections = [
        item for item in _owned_connections(owner_user_id)
        if item.get("connectorId") == "slack" and item.get("status") == "connected"
    ]
    if not slack_connections or not import_intent:
        return None

    connection = sorted(slack_connections, key=lambda item: item.get("createdAt", ""), reverse=True)[0]
    all_resources = list_resources(connection["connectionId"], owner_user_id)
    matching_channels = [
        resource for resource in all_resources
        if resource.get("type") == "slack_channel"
        and any(_match_text(str(name)) in normalized_question for name in resource.get("channelNames", []))
    ]
    for channel in matching_channels:
        if channel.get("isMember") or channel.get("isPrivate"):
            continue
        token = _refresh_access_token(connection["connectionId"])
        _join_slack_channel(channel["id"].split(":", 1)[1], token)
        all_resources = list_resources(connection["connectionId"], owner_user_id)
        break
    source_intent = source_intent or bool(matching_channels)
    resources = [resource for resource in all_resources if resource.get("canAnalyze")]
    if not resources:
        return {
            "status": "unavailable",
            "message": "Slack is connected, but no analyzable file or channel is currently accessible. The previous dataset was not used.",
            "invalidateCurrentAnalysis": source_intent,
        }

    if matching_channels and file_intent and not message_intent:
        requested_channel_ids = {channel.get("id") for channel in matching_channels}
        requested_channel_names = {
            _match_text(str(name))
            for channel in matching_channels
            for name in channel.get("channelNames", [])
        }
        channel_files = [
            resource for resource in resources
            if resource.get("type") == "slack_file"
            and (
                any(_match_text(str(name)) in requested_channel_names for name in resource.get("channelNames", []))
                or any(channel_id.endswith(str(name)) for channel_id in requested_channel_ids for name in resource.get("channelNames", []))
            )
        ]
        if not channel_files:
            channel_label = matching_channels[0].get("channelNames", ["requested channel"])[0]
            return {
                "status": "not_found",
                "message": (
                    f"No analyzable file is currently available in #{channel_label}. "
                    "It may have been deleted or the app may no longer have access. The previous dataset has been cleared and was not used."
                ),
                "invalidateCurrentAnalysis": True,
            }
        resources = channel_files

    scored: list[tuple[int, dict[str, Any]]] = []
    for resource in resources:
        resource_name = _match_text(str(resource.get("name") or ""))
        channel_names = [_match_text(str(name)) for name in resource.get("channelNames", [])]
        score = 0
        if resource_name and resource_name in normalized_question:
            score += 100
        for channel_name in channel_names:
            if channel_name and channel_name in normalized_question:
                score += 80
        generic_tokens = {
            "analyze", "analyse", "analysis", "data", "dataset", "file", "excel", "sheet", "spreadsheet",
            "fetch", "import", "load", "lao", "lekar", "mang", "current", "quality", "batao", "karo",
            "from", "with", "the", "aur", "se", "jo", "hai",
        }
        query_tokens = {
            token for token in normalized_question.split()
            if len(token) >= 3 and token not in generic_tokens
        }
        resource_tokens = {token for token in f"{resource_name} {' '.join(channel_names)}".split() if len(token) >= 3}
        score += 5 * len(query_tokens & resource_tokens)
        if resource.get("type") == "slack_channel" and any(token in normalized_question for token in ("message", "chat", "conversation")):
            score += 20
        scored.append((score, resource))

    scored.sort(key=lambda item: (item[0], item[1].get("type") == "slack_file"), reverse=True)
    positive = [item for item in scored if item[0] > 0]
    if not positive and not source_intent:
        return None
    if not positive:
        files = [resource for resource in resources if resource.get("type") == "slack_file"]
        if len(files) == 1:
            selected = files[0]
        else:
            names = ", ".join(resource.get("name", "Unnamed") for resource in files[:8])
            return {
                "status": "selection_required",
                "message": f"Slack is connected. Specify a channel or file name. Available files: {names or 'none visible'}.",
                "invalidateCurrentAnalysis": False,
            }
    else:
        top_score = positive[0][0]
        tied = [resource for score, resource in positive if score == top_score]
        file_ties = [resource for resource in tied if resource.get("type") == "slack_file"]
        selected = file_ties[0] if len(file_ties) == 1 else tied[0]

    return {
        "status": "ready",
        "connectionId": connection["connectionId"],
        "resource": selected,
    }


def _match_text(value: str) -> str:
    return " ".join(re.sub(r"[^a-z0-9]+", " ", value.lower()).split())


def _slack_json(
    url: str,
    token: str,
    *,
    method: str = "GET",
    form: dict[str, Any] | None = None,
) -> dict[str, Any]:
    data = _http_json(url, method=method, form=form, token=token)
    if not data.get("ok", False):
        raise ValueError(f"Slack request failed: {data.get('error', 'unknown_error')}")
    return data


def _http_json(
    url: str,
    *,
    method: str = "GET",
    form: dict[str, Any] | None = None,
    json_body: dict[str, Any] | None = None,
    token: str | None = None,
) -> dict[str, Any]:
    payload = json.dumps(json_body).encode("utf-8") if json_body is not None else (urlencode(form).encode("utf-8") if form is not None else None)
    headers = {"Accept": "application/json", "User-Agent": "Byizon-Analytics/1.0"}
    if form is not None:
        headers["Content-Type"] = "application/x-www-form-urlencoded"
    if json_body is not None:
        headers["Content-Type"] = "application/json"
    if token:
        headers["Authorization"] = f"Bearer {token}"
    raw = _http_bytes(url, method=method, data=payload, headers=headers)
    value = json.loads(raw.decode("utf-8")) if raw else {}
    if not isinstance(value, dict):
        raise ValueError("Provider returned an unexpected response.")
    return value


def _http_json_list(url: str, *, token: str | None = None) -> list[dict[str, Any]]:
    headers = {"Accept": "application/json", "User-Agent": "Byizon-Analytics/1.0"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    raw = _http_bytes(url, headers=headers)
    value = json.loads(raw.decode("utf-8")) if raw else []
    if not isinstance(value, list):
        raise ValueError("Provider returned an unexpected response.")
    return [item for item in value if isinstance(item, dict)]


def _http_bytes(
    url: str,
    *,
    method: str = "GET",
    data: bytes | None = None,
    headers: dict[str, str] | None = None,
    token: str | None = None,
    max_bytes: int = 25 * 1024 * 1024,
) -> bytes:
    request_headers = {"User-Agent": "Byizon-Analytics/1.0", **(headers or {})}
    if token:
        request_headers["Authorization"] = f"Bearer {token}"
    if urlparse(url).hostname == "files.slack.com":
        curl_content = _curl_download(url, request_headers, max_bytes)
        if curl_content is not None:
            return curl_content

    last_network_error: Exception | None = None
    for attempt in range(3):
        try:
            response = requests.request(
                method,
                url,
                data=data,
                headers=request_headers,
                timeout=(10, 30),
                allow_redirects=True,
                stream=True,
            )
            if response.status_code >= 400:
                detail = response.content[:800].decode("utf-8", errors="replace")
                try:
                    parsed = json.loads(detail)
                    detail = parsed.get("error_description") or parsed.get("message") or parsed.get("error", {}).get("message") or detail
                except (json.JSONDecodeError, AttributeError):
                    pass
                raise ValueError(f"Provider request failed ({response.status_code}): {detail[:300]}")
            content_length = int(response.headers.get("Content-Length") or 0)
            if content_length > max_bytes:
                raise ValueError("Connected source exceeds the allowed size limit.")
            chunks: list[bytes] = []
            total = 0
            for chunk in response.iter_content(chunk_size=64 * 1024):
                if not chunk:
                    continue
                total += len(chunk)
                if total > max_bytes:
                    raise ValueError("Connected source exceeds the allowed size limit.")
                chunks.append(chunk)
            return b"".join(chunks)
        except requests.RequestException as exc:
            last_network_error = exc
            if attempt < 2:
                time.sleep(0.4 * (2 ** attempt))
        except (TimeoutError, ConnectionError) as exc:
            last_network_error = exc
            if attempt < 2:
                time.sleep(0.4 * (2 ** attempt))

    reason = getattr(last_network_error, "reason", last_network_error)
    raise ValueError(
        "The connected provider did not complete a secure network response after 3 attempts. "
        f"Please retry once. Technical reason: {reason}"
    ) from last_network_error


def _curl_download(url: str, headers: dict[str, str], max_bytes: int) -> bytes | None:
    executable = shutil.which("curl") or shutil.which("curl.exe")
    if not executable:
        return None
    config_lines = []
    for key, value in headers.items():
        safe_value = str(value).replace("\\", "\\\\").replace('"', '\\"')
        config_lines.append(f'header = "{key}: {safe_value}"')
    result = subprocess.run(
        [
            executable,
            "--fail-with-body",
            "--location",
            "--silent",
            "--show-error",
            "--retry",
            "2",
            "--retry-all-errors",
            "--connect-timeout",
            "15",
            "--max-time",
            "120",
            "--max-filesize",
            str(max_bytes),
            "--config",
            "-",
            url,
        ],
        input=("\n".join(config_lines) + "\n").encode("utf-8"),
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        timeout=140,
        check=False,
    )
    if result.returncode != 0:
        detail = result.stderr.decode("utf-8", errors="replace").strip()
        raise ValueError(f"Slack file download failed: {detail[:300] or 'network error'}")
    if len(result.stdout) > max_bytes:
        raise ValueError("Connected source exceeds the allowed size limit.")
    return result.stdout
