from __future__ import annotations

import time
import uuid
from typing import Any

from .dataset_store import delete_session, load_session, reassign_sessions, save_session


def create_session(
    analysis: dict[str, Any],
    file_metadata: dict[str, Any] | None = None,
    owner_user_id: str | None = None,
    dataset_id: str | None = None,
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
        "ownerUserId": owner_user_id or "anonymous",
        "datasetId": dataset_id or analysis.get("datasetId"),
        "createdAt": now,
        "updatedAt": now,
    }
    return save_session(session, session.get("datasetId"))


def get_session(session_id: str | None, owner_user_id: str | None = None) -> dict[str, Any] | None:
    if not session_id:
        return None
    return load_session(session_id, owner_user_id)


def append_chat(
    session_id: str,
    role: str,
    text: str,
    owner_user_id: str | None = None,
    conversation_id: str | None = None,
) -> None:
    session = get_session(session_id, owner_user_id)
    if not session:
        return
    message = {"role": role, "text": text, "timestamp": time.time()}
    if conversation_id:
        threads = session.setdefault("chatThreads", {})
        history = threads.setdefault(conversation_id, [])
        history.append(message)
        threads[conversation_id] = history[-200:]
    else:
        session.setdefault("chatHistory", []).append(message)
    session["updatedAt"] = time.time()
    save_session(session, session.get("datasetId"))


def clear_chat(
    session_id: str | None,
    conversation_id: str | None,
    owner_user_id: str | None = None,
) -> bool:
    session = get_session(session_id, owner_user_id)
    if not session or not conversation_id:
        return False
    threads = session.setdefault("chatThreads", {})
    existed = conversation_id in threads
    threads.pop(conversation_id, None)
    session["updatedAt"] = time.time()
    save_session(session, session.get("datasetId"))
    return existed


def clear_session(session_id: str | None, owner_user_id: str | None = None) -> bool:
    if not session_id:
        return False
    if not get_session(session_id, owner_user_id):
        return False
    return delete_session(session_id, owner_user_id)


def reassign_owner(previous_owner_user_id: str, owner_user_id: str) -> int:
    if not previous_owner_user_id or previous_owner_user_id == owner_user_id:
        return 0
    return reassign_sessions(previous_owner_user_id, owner_user_id)


def progress(session_id: str | None, owner_user_id: str | None = None) -> dict[str, Any]:
    session = get_session(session_id, owner_user_id)
    if not session:
        return {"sessionId": session_id, "status": "not_found", "progress": 0}
    return {"sessionId": session_id, "status": session["analysisStatus"], "progress": 100}
