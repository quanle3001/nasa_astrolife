"""Local history must be opt-in and preserve observations and explanations."""

from dataclasses import replace
from pathlib import Path
import sys
from tempfile import TemporaryDirectory
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from astrotip.analysis.rules import assess
from astrotip.models.health_indicator import CheckIn
from astrotip.storage.database import HistoryStore


class HistoryTests(unittest.TestCase):
    def test_reading_empty_history_does_not_create_database_or_directories(self):
        with TemporaryDirectory() as directory:
            path = Path(directory) / "new" / "history.sqlite3"
            store = HistoryStore(path)
            self.assertEqual(store.list_entries(), [])
            self.assertFalse(path.exists())
            self.assertFalse(path.parent.exists())

    def test_save_and_reopen_preserves_observations_and_assessment(self):
        with TemporaryDirectory() as directory:
            path = Path(directory) / "history.sqlite3"
            checkin = CheckIn(spo2=87.5, signal_quality="poor",
                              symptoms={"chest_pain", "poor_sleep"},
                              exercise_completed=False, notes="Crew's note <b>unchanged</b>")
            assessment = assess(checkin)
            identifier = HistoryStore(path).save(checkin, assessment)
            self.assertIsInstance(identifier, int)
            entries = HistoryStore(path).list_entries()
            self.assertEqual(len(entries), 1)
            entry = entries[0]
            self.assertEqual(entry["id"], identifier)
            self.assertEqual(entry["checkin"]["spo2"], 87.5)
            self.assertNotIn("mission", entry["checkin"])
            self.assertIsNone(entry["checkin"]["heart_rate"])
            self.assertEqual(set(entry["checkin"]["symptoms"]), set(checkin.symptoms))
            self.assertEqual(entry["checkin"]["notes"], checkin.notes)
            self.assertEqual(entry["assessment"]["level"], "urgent")
            self.assertEqual(entry["assessment"]["summary"], assessment.summary)
            self.assertEqual(entry["assessment"]["catalog_reviewed_on"], assessment.catalog_reviewed_on)
            self.assertEqual(entry["created_at"], assessment.created_at)
            self.assertEqual(len(entry["assessment"]["findings"]), 13)
            self.assertTrue(entry["assessment"]["data_notes"])

    def test_multiple_entries_are_returned_newest_first(self):
        with TemporaryDirectory() as directory:
            store = HistoryStore(Path(directory) / "history.sqlite3")
            first = CheckIn(notes="first")
            second = CheckIn(notes="second")
            first_id = store.save(first, assess(first))
            second_id = store.save(second, assess(second))
            entries = store.list_entries()
            self.assertEqual([e["id"] for e in entries], [second_id, first_id])
            self.assertEqual([e["checkin"]["notes"] for e in entries], ["second", "first"])

    def test_history_keeps_assessment_evidence_date_instead_of_save_time_catalog(self):
        with TemporaryDirectory() as directory:
            store = HistoryStore(Path(directory) / "history.sqlite3")
            checkin = CheckIn()
            assessment = replace(assess(checkin), catalog_reviewed_on="2025-01-01")
            store.save(checkin, assessment)
            self.assertEqual(store.list_entries()[0]["assessment"]["catalog_reviewed_on"], "2025-01-01")


if __name__ == "__main__":
    unittest.main()
