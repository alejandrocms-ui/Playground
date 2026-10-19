"""Versioned scenario store on SQLite. Every change writes a full snapshot, so any
version can be compared or restored exactly. Swap for Postgres when going multi-school."""
from __future__ import annotations

import json
import sqlite3
import threading
import time
from pathlib import Path


class Store:
    def __init__(self, path: str | Path):
        self.path = str(path)
        self.lock = threading.Lock()
        with self._conn() as c:
            c.execute("""CREATE TABLE IF NOT EXISTS versions (
                n INTEGER PRIMARY KEY AUTOINCREMENT,
                created REAL NOT NULL,
                author TEXT,
                message TEXT,
                data TEXT NOT NULL)""")

    def _conn(self):
        conn = sqlite3.connect(self.path)
        conn.row_factory = sqlite3.Row
        return conn

    def current(self) -> tuple[int, dict] | tuple[None, None]:
        with self._conn() as c:
            row = c.execute("SELECT n, data FROM versions ORDER BY n DESC LIMIT 1").fetchone()
        return (row["n"], json.loads(row["data"])) if row else (None, None)

    def get(self, n: int) -> dict | None:
        with self._conn() as c:
            row = c.execute("SELECT data FROM versions WHERE n=?", (n,)).fetchone()
        return json.loads(row["data"]) if row else None

    def commit(self, data: dict, message: str, author: str = "dirección") -> int:
        with self.lock, self._conn() as c:
            cur = c.execute("INSERT INTO versions (created, author, message, data) VALUES (?,?,?,?)",
                            (time.time(), author, message, json.dumps(data, ensure_ascii=False)))
            return cur.lastrowid

    def history(self, limit: int = 100) -> list:
        with self._conn() as c:
            rows = c.execute("SELECT n, created, author, message FROM versions ORDER BY n DESC LIMIT ?",
                             (limit,)).fetchall()
        return [dict(r) for r in rows]

    def reset(self):
        with self.lock, self._conn() as c:
            c.execute("DELETE FROM versions")
