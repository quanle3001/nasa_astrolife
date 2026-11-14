"""Local, opt-in history. Assessment snapshots retain the evidence review date."""

from dataclasses import asdict
from contextlib import closing
import json
import os
from pathlib import Path
import sqlite3

from astrotip.models.health_indicator import Assessment, CheckIn


def _json_default(value):
    if isinstance(value, (set, frozenset)):
        return sorted(value)
    raise TypeError(f"Unsupported history value: {type(value).__name__}")


class HistoryStore:
    def __init__(self, path: str | Path | None = None):
        # Merely opening the app or reading an empty history creates no files.
        local_data = Path(os.environ.get("LOCALAPPDATA", Path.home() / ".local" / "share"))
        self.path = Path(path) if path is not None else local_data / "AstroTip" / "history.sqlite3"

    def save(self, checkin: CheckIn, assessment: Assessment) -> int:
        payload = asdict(assessment)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with closing(sqlite3.connect(self.path)) as connection, connection:
            connection.execute("""CREATE TABLE IF NOT EXISTS checkins (
                id INTEGER PRIMARY KEY, created_at TEXT NOT NULL,
                checkin_json TEXT NOT NULL, assessment_json TEXT NOT NULL
            )""")
            cursor = connection.execute(
                "INSERT INTO checkins(created_at, checkin_json, assessment_json) VALUES (?, ?, ?)",
                (assessment.created_at,
                 json.dumps(asdict(checkin), default=_json_default, allow_nan=False),
                 json.dumps(payload, allow_nan=False)),
            )
            return cursor.lastrowid

    def list_entries(self) -> list[dict]:
        if not self.path.exists():
            return []
        # Read-only mode also prevents accidental creation if the file disappears.
        with closing(sqlite3.connect(self.path.resolve().as_uri() + "?mode=ro", uri=True)) as connection:
            rows = connection.execute(
                "SELECT id, created_at, checkin_json, assessment_json FROM checkins ORDER BY id DESC"
            ).fetchall()
        return [
            {"id": row[0], "created_at": row[1], "checkin": json.loads(row[2]), "assessment": json.loads(row[3])}
            for row in rows
        ]
