from __future__ import annotations

import json
import math
import os
import re
import sqlite3
import time
from collections import Counter
from pathlib import Path

DATA_DIR = Path(os.getenv("BYIZON_DATA_DIR", "")).expanduser() if os.getenv("BYIZON_DATA_DIR", "").strip() else Path(__file__).resolve().parents[1] / "data"
DB_PATH = DATA_DIR / "voice_memory.sqlite3"


def _tokens(text: str) -> Counter:
    return Counter(re.findall(r"[a-z0-9_]+", text.lower()))


def _similarity(left: Counter, right: Counter) -> float:
    if not left or not right:
        return 0.0
    dot = sum(value * right.get(key, 0) for key, value in left.items())
    norm_left = math.sqrt(sum(value * value for value in left.values()))
    norm_right = math.sqrt(sum(value * value for value in right.values()))
    return dot / (norm_left * norm_right) if norm_left and norm_right else 0.0


class VoiceMemory:
    """Small local vector store using deterministic sparse token vectors."""

    def __init__(self):
        DB_PATH.parent.mkdir(parents=True, exist_ok=True)
        with sqlite3.connect(DB_PATH) as db:
            db.execute("""CREATE TABLE IF NOT EXISTS voice_memory (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id TEXT NOT NULL,
                user_text TEXT NOT NULL,
                assistant_text TEXT NOT NULL,
                vector_json TEXT NOT NULL,
                created_at INTEGER NOT NULL
            )""")

    def add(self, session_id: str, user_text: str, assistant_text: str):
        vector = dict(_tokens(f"{user_text} {assistant_text}"))
        with sqlite3.connect(DB_PATH) as db:
            db.execute(
                "INSERT INTO voice_memory(session_id,user_text,assistant_text,vector_json,created_at) VALUES(?,?,?,?,?)",
                (session_id, user_text[:4000], assistant_text[:4000], json.dumps(vector), int(time.time())),
            )

    def search(self, session_id: str, query: str, limit: int = 3) -> list[dict]:
        query_vector = _tokens(query)
        with sqlite3.connect(DB_PATH) as db:
            rows = db.execute(
                "SELECT user_text,assistant_text,vector_json FROM voice_memory WHERE session_id=? ORDER BY id DESC LIMIT 60",
                (session_id,),
            ).fetchall()
        ranked = []
        for user_text, assistant_text, vector_json in rows:
            score = _similarity(query_vector, Counter(json.loads(vector_json)))
            if score > 0:
                ranked.append({"user": user_text, "assistant": assistant_text, "score": round(score, 4)})
        return sorted(ranked, key=lambda item: item["score"], reverse=True)[:limit]
