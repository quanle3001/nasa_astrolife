"""Persistence of the mission profile, check-in sessions and follow-up actions."""

from contextlib import closing
import json
from pathlib import Path
import sqlite3
import sys
from tempfile import TemporaryDirectory
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from astrotip.analysis.rules import assess
from astrotip.models.health_indicator import CheckIn
from astrotip.storage.app_state import SCHEMA_VERSION, AppStateStore
from astrotip.storage.database import HistoryStore

MISSION = {"environment": "mars", "phase": "transit", "mission_day": 120, "eva_recent": False, "gravity_transition_recent": False}
ACTION = {"condition_id": "sleep", "level": "watch", "text": "Review fatigue with the crew.", "observation": "Reported: poor sleep."}
MEASUREMENT = {
    "heart_rate": 73,
    "spo2": 98,
    "signal_quality": "unknown",
    "input_source": "sensor",
    "sensor_port": "COM7",
    "sensor_received_at": "2026-11-15T08:00:00+00:00",
    "aggregation": "median",
    "report_count": 3,
    "reports_required": 3,
}


class AppStateTests(unittest.TestCase):
    def setUp(self):
        self.temp = TemporaryDirectory()
        self.path = Path(self.temp.name) / "history.sqlite3"
        self.store = AppStateStore(self.path)

    def tearDown(self):
        self.temp.cleanup()

    def test_reading_empty_state_creates_no_file(self):
        self.assertIsNone(self.store.get_mission())
        self.assertIsNone(self.store.open_session())
        self.assertIsNone(self.store.latest_submitted())
        self.assertEqual(self.store.list_actions(), [])
        self.assertFalse(self.path.exists())

    def test_mission_profile_survives_a_restart_and_can_be_changed(self):
        self.store.save_mission(MISSION)
        self.assertEqual(AppStateStore(self.path).get_mission(), MISSION)
        self.store.save_mission({**MISSION, "environment": "lunar", "phase": "surface"})
        self.assertEqual(AppStateStore(self.path).get_mission()["environment"], "lunar")

    def test_interrupted_session_can_be_resumed_with_its_answers_and_position(self):
        session = self.store.start_session(MISSION, "2026.11.1")
        self.store.save_progress(session["session_id"], {"sleep.quality": "poorly"}, "sleep.hours")
        resumed = AppStateStore(self.path).open_session()
        self.assertEqual(resumed["session_id"], session["session_id"])
        self.assertEqual(resumed["answers"], {"sleep.quality": "poorly"})
        self.assertEqual((resumed["position"], resumed["status"], resumed["mission"]), ("sleep.hours", "in_progress", MISSION))

    def test_first_stable_measurement_is_latched_and_survives_a_restart(self):
        session = self.store.start_session(MISSION, "2026.11.1")
        self.assertIsNone(session["measurement"])
        captured = self.store.save_measurement(session["session_id"], MEASUREMENT)
        self.assertEqual(captured["measurement"], MEASUREMENT)

        replacement = {**MEASUREMENT, "heart_rate": 91, "spo2": 95}
        still_captured = self.store.save_measurement(session["session_id"], replacement)
        self.assertEqual(still_captured["measurement"], MEASUREMENT)
        self.assertEqual(AppStateStore(self.path).open_session()["measurement"], MEASUREMENT)

        new_session = self.store.start_session(MISSION, "2026.11.1")
        self.assertIsNone(new_session["measurement"])

    def test_starting_again_abandons_the_old_session_without_deleting_it(self):
        first = self.store.start_session(MISSION, "2026.11.1")
        second = self.store.start_session(MISSION, "2026.11.1")
        self.assertEqual(self.store.open_session()["session_id"], second["session_id"])
        self.assertEqual(self.store.get_session(first["session_id"])["status"], "abandoned")
        with self.assertRaises(ValueError):
            self.store.save_progress(first["session_id"], {}, "")

    def test_completed_session_keeps_result_and_actions_and_cannot_be_resubmitted(self):
        session = self.store.start_session(MISSION, "2026.11.1")
        result = {"assessment": {"level": "watch"}, "session_notes": []}
        actions = self.store.complete_session(session["session_id"], {"sleep.quality": "poorly"}, 7, result, [ACTION])
        self.assertEqual([(a["text"], a["status"], a["entry_id"]) for a in actions], [(ACTION["text"], "open", 7)])
        reopened = AppStateStore(self.path)
        self.assertIsNone(reopened.open_session())
        latest = reopened.latest_submitted()
        self.assertEqual((latest["status"], latest["entry_id"], latest["result"]), ("submitted", 7, result))
        with self.assertRaises(ValueError):
            self.store.complete_session(session["session_id"], {}, 8, result, [])

    def test_action_status_persists_and_can_be_reopened(self):
        session = self.store.start_session(MISSION, "2026.11.1")
        action, = self.store.complete_session(session["session_id"], {}, 1, {}, [ACTION])
        done = self.store.set_action_status(action["id"], "done")
        self.assertEqual(done["status"], "done")
        self.assertTrue(done["completed_at"])
        self.assertEqual(AppStateStore(self.path).list_actions()[0]["status"], "done")
        reopened = self.store.set_action_status(action["id"], "open")
        self.assertIsNone(reopened["completed_at"])
        for bad_id, bad_status in ((action["id"], "ignored"), (999, "done")):
            with self.assertRaises(ValueError):
                self.store.set_action_status(bad_id, bad_status)

    def test_existing_history_file_is_upgraded_in_place_without_touching_old_records(self):
        history = HistoryStore(self.path)
        checkin = CheckIn(heart_rate=72, spo2=98)
        history.save(checkin, assess(checkin))
        before = history.list_entries()
        with closing(sqlite3.connect(self.path)) as connection:
            self.assertEqual(connection.execute("PRAGMA user_version").fetchone()[0], 0)
        self.assertIsNone(self.store.get_mission(), "Reading before the upgrade must not fail")
        self.store.save_mission(MISSION)
        with closing(sqlite3.connect(self.path)) as connection:
            self.assertEqual(connection.execute("PRAGMA user_version").fetchone()[0], SCHEMA_VERSION)
        self.assertEqual(history.list_entries(), before)
        history.save(checkin, assess(checkin))
        self.assertEqual(len(history.list_entries()), 2)

    def test_version_one_open_session_is_upgraded_with_an_empty_measurement(self):
        with closing(sqlite3.connect(self.path)) as connection:
            connection.execute(
                """CREATE TABLE assessment_sessions (
                    id TEXT PRIMARY KEY, started_at TEXT NOT NULL, updated_at TEXT NOT NULL,
                    status TEXT NOT NULL, registry_version TEXT NOT NULL, mission_json TEXT NOT NULL,
                    answers_json TEXT NOT NULL, position TEXT NOT NULL DEFAULT '',
                    entry_id INTEGER, result_json TEXT)""")
            connection.execute(
                "INSERT INTO assessment_sessions VALUES (?, ?, ?, 'in_progress', ?, ?, '{}', '', NULL, NULL)",
                ("legacy", "2026-11-15T08:00:00+00:00", "2026-11-15T08:00:00+00:00", "2026.11.1",
                 json.dumps(MISSION)))
            connection.execute("PRAGMA user_version = 1")
            connection.commit()
        resumed = self.store.open_session()
        self.assertEqual(resumed["session_id"], "legacy")
        self.assertIsNone(resumed["measurement"])
        with closing(sqlite3.connect(self.path)) as connection:
            self.assertEqual(connection.execute("PRAGMA user_version").fetchone()[0], SCHEMA_VERSION)

    def test_history_is_readable_when_the_guided_flow_created_the_file_first(self):
        self.store.save_mission(MISSION)
        self.assertEqual(HistoryStore(self.path).list_entries(), [])

    def test_database_from_a_newer_version_is_refused(self):
        with closing(sqlite3.connect(self.path)) as connection:
            connection.execute(f"PRAGMA user_version = {SCHEMA_VERSION + 1}")
        with self.assertRaises(ValueError):
            self.store.save_mission(MISSION)


if __name__ == "__main__":
    unittest.main()
