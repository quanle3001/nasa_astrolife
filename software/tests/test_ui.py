"""Headless desktop checks for the check-in, priorities, and saved-history flow."""

import importlib.util
import json
import os
from pathlib import Path
import sys
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch

os.environ.setdefault("QT_QPA_PLATFORM", "offscreen")
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

HAS_QT = importlib.util.find_spec("PySide6") is not None
if HAS_QT:
    from PySide6.QtWidgets import QApplication
    from astrotip.analysis.nasa_guidance import load_catalog
    from astrotip.models.health_indicator import CheckIn, SYMPTOMS
    from astrotip.storage.database import HistoryStore
    from astrotip.ui.main_window import AstroTipWindow


@unittest.skipUnless(HAS_QT, "Install software/requirements.txt for desktop integration checks")
class DesktopFlowTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.app = QApplication.instance() or QApplication([])
        cls.catalog = load_catalog()

    def setUp(self):
        self.temp = TemporaryDirectory()
        self.path = Path(self.temp.name) / "history.sqlite3"
        self.window = AstroTipWindow(catalog=self.catalog, history_store=HistoryStore(self.path))

    def tearDown(self):
        self.window.close()
        self.window.deleteLater()
        self.app.processEvents()
        self.temp.cleanup()

    def test_empty_form_preserves_unknown_values_and_has_every_observation(self):
        checkin = self.window.checkin_page.collect_checkin()
        self.assertIsNone(checkin.spo2)
        self.assertIsNone(checkin.heart_rate)
        self.assertIsNone(checkin.sleep_hours)
        self.assertIsNone(checkin.exercise_completed)
        self.assertEqual(checkin.symptoms, frozenset())
        self.assertEqual(set(self.window.checkin_page.symptom_checks), set(SYMPTOMS))
        self.assertFalse(self.window.assessment_page.save_button.isEnabled())
        self.assertFalse(self.path.exists())

    def test_form_to_urgent_assessment_then_explicit_save_and_reload(self):
        form = self.window.checkin_page
        form.spo2.setText("87.5")
        form.heart_rate.setText("72")
        form.signal_quality.setCurrentIndex(form.signal_quality.findData("poor"))
        form.mission.setCurrentIndex(form.mission.findData("mars"))
        form.exercise_completed.setCurrentIndex(form.exercise_completed.findData(False))
        form.symptom_checks["vision_changes"].setChecked(True)
        form.notes.setPlainText("<b>Recorded literally</b>")
        form.submit_button.click()
        self.app.processEvents()
        self.assertEqual(self.window.latest_assessment.level, "urgent")
        self.assertEqual(self.window.latest_checkin.mission, "mars")
        self.assertIs(self.window.latest_checkin.exercise_completed, False)
        self.assertIs(self.window.tabs.currentWidget(), self.window.assessment_page)
        self.assertFalse(self.window.assessment_page.urgent_action.isHidden())
        self.assertIn("ACT NOW", self.window.assessment_page.urgent_action.text())
        self.assertIn("87.5", self.window.assessment_page.content.toPlainText())
        self.assertNotIn("Prevention & risk reduction", self.window.assessment_page.content.toPlainText())
        self.assertFalse(self.path.exists(), "Assessment must not silently save health data")
        self.window.assessment_page.save_button.click()
        self.app.processEvents()
        self.assertTrue(self.path.exists())
        self.assertFalse(self.window.assessment_page.save_button.isEnabled())
        self.assertEqual(self.window.history_page.table.rowCount(), 1)
        self.assertIn("<b>Recorded literally</b>", self.window.history_page.content.toPlainText())
        self.window.assessment_page.save_button.click()
        self.assertEqual(len(HistoryStore(self.path).list_entries()), 1)
        reopened = AstroTipWindow(catalog=self.catalog, history_store=HistoryStore(self.path))
        try:
            reopened.refresh_history()
            self.assertEqual(reopened.history_page.table.rowCount(), 1)
            self.assertEqual(reopened.history_page.entries[0]["assessment"]["level"], "urgent")
        finally:
            reopened.close()
            reopened.deleteLater()

    def test_invalid_measurements_display_error_without_emitting_assessment(self):
        for value in ("not a number", "nan", "inf", "0", "101"):
            with self.subTest(value=value):
                self.window.checkin_page.spo2.setText(value)
                with patch("astrotip.ui.pages.checkin.QMessageBox.warning") as warning:
                    self.window.checkin_page.submit_button.click()
                    self.assertEqual(warning.call_count, 1)
                self.assertIsNone(self.window.latest_assessment)
                self.assertFalse(self.path.exists())

    def test_sensor_is_home_and_reference_library_is_not_in_ui(self):
        tabs = self.window.tabs
        self.assertIs(tabs.currentWidget(), self.window.sensor_page)
        self.assertEqual([tabs.tabText(i) for i in range(tabs.count())],
                         ["Sensor monitor", "Optional check-in", "Assessment", "Health History"])
        self.window.run_assessment(CheckIn(spo2=91))
        text = self.window.assessment_page.content.toPlainText()
        self.assertIn("Suggested next steps", text)
        self.assertNotIn("Research in progress", text)
        self.assertNotIn("Risk references", text)
        self.assertNotIn("href=", self.window.assessment_page.content.toHtml())

    def test_new_assessment_resets_saved_state_and_hides_old_urgent_callout(self):
        self.window.run_assessment(CheckIn(symptoms={"chest_pain"}))
        self.assertFalse(self.window.assessment_page.urgent_action.isHidden())
        self.window.assessment_page.save_button.click()
        self.assertFalse(self.window.assessment_page.save_button.isEnabled())
        self.window.run_assessment(CheckIn())
        self.assertEqual(self.window.latest_assessment.level, "info")
        self.assertTrue(self.window.assessment_page.urgent_action.isHidden())
        self.assertTrue(self.window.assessment_page.save_button.isEnabled())
        self.assertEqual(len(HistoryStore(self.path).list_entries()), 1)

    def test_failed_save_keeps_assessment_available_for_retry(self):
        self.window.run_assessment(CheckIn(symptoms={"vision_changes"}))
        assessment = self.window.latest_assessment
        with patch.object(self.window.history_store, "save", side_effect=OSError("Disk unavailable")):
            with patch("astrotip.ui.main_window.QMessageBox.warning") as warning:
                self.window.assessment_page.save_button.click()
                self.assertEqual(warning.call_count, 1)
        self.assertIs(self.window.latest_assessment, assessment)
        self.assertTrue(self.window.assessment_page.save_button.isEnabled())
        self.assertFalse(self.path.exists())

    def test_sensor_snapshot_saves_sensor_values_without_old_manual_symptoms(self):
        from astrotip.inputs.sensor_serial import SensorReading
        self.window.checkin_page.symptom_checks["chest_pain"].setChecked(True)
        sensor = self.window.sensor_page
        sensor.active_port = "COM7"
        sensor.receive_reading(SensorReading(75, 91, True, 60000, 80000, 30, "2026-11-14T20:00:00+00:00"))
        sensor.snapshot_button.click()
        self.assertIs(self.window.tabs.currentWidget(), self.window.assessment_page)
        self.assertEqual(self.window.latest_checkin.spo2, 91)
        self.assertEqual(self.window.latest_checkin.symptoms, frozenset())
        self.assertFalse(self.path.exists())
        self.window.assessment_page.save_button.click()
        saved = HistoryStore(self.path).list_entries()[0]
        self.assertEqual(saved["checkin"]["input_source"], "sensor")
        self.assertEqual(saved["checkin"]["sensor_port"], "COM7")
        self.assertEqual(saved["checkin"]["sensor_received_at"], "2026-11-14T20:00:00+00:00")

    def test_background_research_is_not_presented_as_a_sensor_result(self):
        self.window.run_assessment(CheckIn(spo2=98, heart_rate=72))
        content = self.window.assessment_page.content.toPlainText()
        self.assertIn("Suggested next steps", content)
        self.assertNotIn("B-Complex", content)
        self.assertNotIn("Radiation-induced", content)
        self.assertNotIn("Research in progress", content)

    def test_mission_cards_and_combo_share_one_state_with_offline_assets(self):
        form = self.window.checkin_page
        gallery = form.mission_gallery
        gallery.cards["mars"].selected.emit("mars")
        self.app.processEvents()
        self.assertEqual(form.mission.currentData(), "mars")
        self.assertTrue(gallery.cards["mars"]._selected)
        form.mission.setCurrentIndex(form.mission.findData("lunar"))
        self.app.processEvents()
        self.assertTrue(gallery.cards["lunar"]._selected)
        self.assertFalse(gallery.cards["mars"]._selected)
        manifest_path = Path(__file__).resolve().parents[1] / "assets" / "nasa" / "media_manifest.json"
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        self.assertEqual({item["mission"] for item in manifest["assets"]}, {"leo", "lunar", "mars"})
        for item in manifest["assets"]:
            self.assertTrue((manifest_path.parent / item["local_path"]).is_file())
            self.assertTrue(item["nasa_id"])
            self.assertTrue(item["source_url"].startswith("https://images.nasa.gov/"))


if __name__ == "__main__":
    unittest.main()
