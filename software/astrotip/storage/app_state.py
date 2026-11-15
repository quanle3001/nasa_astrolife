"""Local state for the guided flow: mission profile, sessions and follow-up actions.

It lives in the same SQLite file as the health history but in its own tables,
so the existing `checkins` table and `HistoryStore` are untouched and history
written by earlier versions stays readable. The schema version is tracked with
`PRAGMA user_version`; an older file is upgraded in place by adding tables.
"""

from __future__ import annotations

from contextlib import closing
from datetime import datetime, timezone
import json
from pathlib import Path
import sqlite3
from uuid import uuid4

SCHEMA_VERSION = 1

_MIGRATIONS = {
    1: (
        # Same definition as HistoryStore.save, so reading history works even if
        # the guided flow wrote to this file before any check-in was saved.
        """CREATE TABLE IF NOT EXISTS checkins (
            id INTEGER PRIMARY KEY, created_at TEXT NOT NULL,
            checkin_json TEXT NOT NULL, assessment_json TEXT NOT NULL)""",
        """CREATE TABLE IF NOT EXISTS mission_profile (
            id INTEGER PRIMARY KEY CHECK (id = 1), profile_json TEXT NOT NULL, updated_at TEXT NOT NULL)""",
        """CREATE TABLE IF NOT EXISTS assessment_sessions (
            id TEXT PRIMARY KEY, started_at TEXT NOT NULL, updated_at TEXT NOT NULL,
            status TEXT NOT NULL CHECK (status IN ('in_progress', 'submitted', 'abandoned')),
            registry_version TEXT NOT NULL, mission_json TEXT NOT NULL, answers_json TEXT NOT NULL,
            position TEXT NOT NULL DEFAULT '', entry_id INTEGER, result_json TEXT)""",
        """CREATE TABLE IF NOT EXISTS followup_actions (
            id INTEGER PRIMARY KEY, session_id TEXT NOT NULL, entry_id INTEGER,
            condition_id TEXT NOT NULL, level TEXT NOT NULL, text TEXT NOT NULL, observation TEXT NOT NULL,
            status TEXT NOT NULL CHECK (status IN ('open', 'done')),
            created_at TEXT NOT NULL, completed_at TEXT)""",
    ),
}


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


class AppStateStore:
    """Mission profile, questionnaire sessions and follow-up actions.

    Like the history store, nothing is written until there is something to
    save: opening the app or reading empty state creates no file.
    """

    def __init__(self, path: str | Path):
        self.path = Path(path)

    def _connect(self) -> sqlite3.Connection:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        connection = sqlite3.connect(self.path)
        version = connection.execute("PRAGMA user_version").fetchone()[0]
        if version > SCHEMA_VERSION:
            connection.close()
            raise ValueError("This health database was written by a newer AstroLife version.")
        for target in range(version + 1, SCHEMA_VERSION + 1):
            with connection:
                for statement in _MIGRATIONS[target]:
                    connection.execute(statement)
                connection.execute(f"PRAGMA user_version = {target}")
        return connection

    def _read(self, query: str, parameters=()) -> list[tuple]:
        """Run a read without creating the file or the tables."""
        if not self.path.exists():
            return []
        with closing(sqlite3.connect(self.path.resolve().as_uri() + "?mode=ro", uri=True)) as connection:
            try:
                return connection.execute(query, parameters).fetchall()
            except sqlite3.OperationalError:
                return []  # A history file from before the guided flow has no such table yet.

    # --- Mission profile -------------------------------------------------
    def get_mission(self) -> dict | None:
        rows = self._read("SELECT profile_json FROM mission_profile WHERE id = 1")
        return json.loads(rows[0][0]) if rows else None

    def save_mission(self, profile: dict) -> dict:
        with closing(self._connect()) as connection, connection:
            connection.execute(
                "INSERT INTO mission_profile(id, profile_json, updated_at) VALUES (1, ?, ?) "
                "ON CONFLICT(id) DO UPDATE SET profile_json = excluded.profile_json, updated_at = excluded.updated_at",
                (json.dumps(profile), _now()))
        return profile

    # --- Questionnaire sessions ------------------------------------------
    @staticmethod
    def _session(row) -> dict:
        return {
            "session_id": row[0], "started_at": row[1], "updated_at": row[2], "status": row[3],
            "registry_version": row[4], "mission": json.loads(row[5]), "answers": json.loads(row[6]),
            "position": row[7], "entry_id": row[8], "result": json.loads(row[9]) if row[9] else None,
        }

    _SESSION_COLUMNS = ("id, started_at, updated_at, status, registry_version, mission_json, answers_json, "
                        "position, entry_id, result_json")

    def start_session(self, mission: dict, registry_version: str) -> dict:
        """Open a new session; an unfinished older one is closed as abandoned, not deleted."""
        session_id, now = uuid4().hex, _now()
        with closing(self._connect()) as connection, connection:
            connection.execute("UPDATE assessment_sessions SET status = 'abandoned', updated_at = ? WHERE status = 'in_progress'", (now,))
            connection.execute(
                "INSERT INTO assessment_sessions(id, started_at, updated_at, status, registry_version, mission_json, answers_json) "
                "VALUES (?, ?, ?, 'in_progress', ?, ?, '{}')",
                (session_id, now, now, registry_version, json.dumps(mission)))
        return self.get_session(session_id)

    def get_session(self, session_id: str) -> dict | None:
        rows = self._read(f"SELECT {self._SESSION_COLUMNS} FROM assessment_sessions WHERE id = ?", (session_id,))
        return self._session(rows[0]) if rows else None

    def open_session(self) -> dict | None:
        """The session that can be resumed, if any."""
        rows = self._read(f"SELECT {self._SESSION_COLUMNS} FROM assessment_sessions "
                          "WHERE status = 'in_progress' ORDER BY updated_at DESC LIMIT 1")
        return self._session(rows[0]) if rows else None

    def latest_submitted(self) -> dict | None:
        rows = self._read(f"SELECT {self._SESSION_COLUMNS} FROM assessment_sessions "
                          "WHERE status = 'submitted' ORDER BY updated_at DESC LIMIT 1")
        return self._session(rows[0]) if rows else None

    def save_progress(self, session_id: str, answers: dict, position: str) -> dict:
        with closing(self._connect()) as connection, connection:
            updated = connection.execute(
                "UPDATE assessment_sessions SET answers_json = ?, position = ?, updated_at = ? "
                "WHERE id = ? AND status = 'in_progress'",
                (json.dumps(answers), position, _now(), session_id)).rowcount
        if not updated:
            raise ValueError("This check-in session is no longer open.")
        return self.get_session(session_id)

    def complete_session(self, session_id: str, answers: dict, entry_id: int | None, result: dict, actions: list[dict]) -> list[dict]:
        """Mark a session submitted and record its follow-up actions in one transaction."""
        now = _now()
        with closing(self._connect()) as connection, connection:
            updated = connection.execute(
                "UPDATE assessment_sessions SET status = 'submitted', answers_json = ?, entry_id = ?, result_json = ?, updated_at = ? "
                "WHERE id = ? AND status = 'in_progress'",
                (json.dumps(answers), entry_id, json.dumps(result), now, session_id)).rowcount
            if not updated:
                raise ValueError("This check-in session is no longer open.")
            for action in actions:
                connection.execute(
                    "INSERT INTO followup_actions(session_id, entry_id, condition_id, level, text, observation, status, created_at) "
                    "VALUES (?, ?, ?, ?, ?, ?, 'open', ?)",
                    (session_id, entry_id, action["condition_id"], action["level"], action["text"], action["observation"], now))
        return self.list_actions(session_id)

    # --- Follow-up actions -----------------------------------------------
    @staticmethod
    def _action(row) -> dict:
        return {"id": row[0], "session_id": row[1], "entry_id": row[2], "condition_id": row[3], "level": row[4],
                "text": row[5], "observation": row[6], "status": row[7], "created_at": row[8], "completed_at": row[9]}

    def list_actions(self, session_id: str | None = None) -> list[dict]:
        query = ("SELECT id, session_id, entry_id, condition_id, level, text, observation, status, created_at, completed_at "
                 "FROM followup_actions")
        rows = self._read(query + (" WHERE session_id = ?" if session_id else "") + " ORDER BY id DESC",
                          (session_id,) if session_id else ())
        return [self._action(row) for row in rows]

    def set_action_status(self, action_id: int, status: str) -> dict:
        if status not in {"open", "done"}:
            raise ValueError("An action is either open or done.")
        with closing(self._connect()) as connection, connection:
            updated = connection.execute(
                "UPDATE followup_actions SET status = ?, completed_at = ? WHERE id = ?",
                (status, _now() if status == "done" else None, action_id)).rowcount
        if not updated:
            raise ValueError("This follow-up action no longer exists.")
        return next(action for action in self.list_actions() if action["id"] == action_id)
