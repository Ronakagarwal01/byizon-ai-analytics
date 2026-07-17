from __future__ import annotations

import time
import uuid
from typing import Any


_SESSIONS: dict[str, dict[str, Any]] = {}


def create_session(
    analysis: dict[str, Any],
    file_metadata: dict[str, Any] | None = None,
    owner_user_id: str | None = None,
) -> dict[str, Any]:
    session_id = analysis.get("sessionId") or f"session_{uuid.uuid4().hex}"
    now = time.time()
    analysis["sessionId"] = session_id
    session = {
        "sessionId": session_id,
        "fileMetadata": file_metadata or {
            "fileName": analysis.get("fileName"),
            "fileType": analysis.get("fileType"),
            "rowCount": analysis.get("rowCount"),
            "colCount": analysis.get("colCount"),
        },
        "analysis": analysis,
        "chatHistory": [],
        "analysisStatus": "complete",
        "ownerUserId": owner_user_id,
        "createdAt": now,
        "updatedAt": now,
    }
    _SESSIONS[session_id] = session
    return session


def get_session(session_id: str | None, owner_user_id: str | None = None) -> dict[str, Any] | None:
    if not session_id:
        return None
    session = _SESSIONS.get(session_id)
    if session and owner_user_id and session.get("ownerUserId") != owner_user_id:
        return None
    return session


def append_chat(session_id: str, role: str, text: str, owner_user_id: str | None = None) -> None:
    session = get_session(session_id, owner_user_id)
    if not session:
        return
    session["chatHistory"].append({"role": role, "text": text, "timestamp": time.time()})
    session["updatedAt"] = time.time()


def clear_session(session_id: str | None, owner_user_id: str | None = None) -> bool:
    if not session_id:
        return False
    if not get_session(session_id, owner_user_id):
        return False
    return _SESSIONS.pop(session_id, None) is not None


def reassign_owner(previous_owner_user_id: str, owner_user_id: str) -> int:
    if not previous_owner_user_id or previous_owner_user_id == owner_user_id:
        return 0
    updated = 0
    for session in _SESSIONS.values():
        if session.get("ownerUserId") == previous_owner_user_id:
            session["ownerUserId"] = owner_user_id
            session["updatedAt"] = time.time()
            updated += 1
    return updated


def progress(session_id: str | None, owner_user_id: str | None = None) -> dict[str, Any]:
    session = get_session(session_id, owner_user_id)
    if not session:
        return {"sessionId": session_id, "status": "not_found", "progress": 0}
    return {"sessionId": session_id, "status": session["analysisStatus"], "progress": 100}
