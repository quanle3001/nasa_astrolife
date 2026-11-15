"""Regression tests for prioritization, uncertainty, and escalation behavior."""

from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from astrotip.analysis.nasa_guidance import CONDITION_IDS, load_catalog
from astrotip.analysis.rules import assess
from astrotip.models.health_indicator import CheckIn


def findings_by_id(assessment):
    return {finding.condition_id: finding for finding in assessment.findings}


class AssessmentTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.catalog = load_catalog()

    def assess(self, **kwargs):
        return assess(CheckIn(**kwargs), self.catalog)

    def test_empty_checkin_keeps_unmeasured_risks_visible(self):
        result = self.assess()
        self.assertEqual({f.condition_id for f in result.findings}, CONDITION_IDS)
        self.assertEqual(result.level, "info")
        self.assertTrue(result.data_notes)
        self.assertTrue(all(f.level == "info" for f in result.findings))
        for finding in result.findings:
            self.assertTrue(finding.reason)
            self.assertNotIn("no risk", finding.reason.lower())
            self.assertIn("not assessed", finding.reason.lower())

    def test_oximetry_boundaries_remain_exact(self):
        for value, expected in ((87.9, "urgent"), (88, "urgent"), (88.1, "review"),
                                (92, "review"), (92.1, "info"), (98, "info")):
            with self.subTest(spo2=value):
                result = self.assess(spo2=value, signal_quality="good")
                finding = findings_by_id(result)["hypoxia"]
                self.assertEqual(finding.level, expected)
                if expected in {"urgent", "review"}:
                    self.assertIn("medlineplus_oximetry", finding.source_ids)
                    self.assertTrue(finding.actions)

    def test_uncertain_sensor_quality_does_not_suppress_low_oxygen_alert(self):
        for quality in ("unknown", "poor"):
            with self.subTest(quality=quality):
                result = self.assess(spo2=86, signal_quality=quality)
                self.assertEqual(result.level, "urgent")
                self.assertEqual(findings_by_id(result)["hypoxia"].level, "urgent")
                self.assertTrue(result.data_notes)

    def test_red_flags_override_normal_readings_for_every_signal_quality(self):
        symptoms = ("chest_pain", "breathing_difficulty", "fainting", "confusion", "sudden_neurological",
                    "sudden_vision_loss", "eva_symptoms", "radiation_alert", "environmental_alert")
        for symptom in symptoms:
            for quality in ("good", "poor", "unknown"):
                with self.subTest(symptom=symptom, quality=quality):
                    result = self.assess(spo2=99, heart_rate=72,
                                         signal_quality=quality, symptoms={symptom})
                    self.assertEqual(result.level, "urgent")
                    self.assertEqual(result.findings[0].level, "urgent")
                    self.assertTrue(result.findings[0].actions)

    def test_normal_vitals_do_not_measure_bones_eyes_or_radiation(self):
        result = self.assess(spo2=98, heart_rate=70, signal_quality="good")
        findings = findings_by_id(result)
        for condition_id in ("bone", "sans", "radiation", "immune"):
            self.assertEqual(findings[condition_id].level, "info")
            self.assertTrue(findings[condition_id].reason)
        self.assertTrue(result.data_notes)

    def test_reported_concerns_select_related_groups(self):
        cases = (
            ("vision_changes", "sans", "review"),
            ("palpitations", "cardiovascular", "review"),
            ("fever_or_infection", "immune", "review"),
            ("bone_pain", "bone", "review"),
            ("poor_sleep", "sleep", "watch"),
            ("mood_concern", "behavioral", "watch"),
            ("team_conflict", "behavioral", "watch"),
            ("poor_intake", "nutrition", "watch"),
            ("muscle_weakness", "fitness", "watch"),
            ("dizziness", "vestibular", "watch"),
        )
        for symptom, condition_id, level in cases:
            with self.subTest(symptom=symptom):
                result = self.assess(symptoms={symptom})
                finding = findings_by_id(result)[condition_id]
                self.assertEqual(finding.level, level)
                self.assertTrue(finding.actions)

    def test_sleep_and_exercise_reminders_require_reported_values(self):
        missing = findings_by_id(self.assess())
        self.assertEqual(missing["sleep"].level, "info")
        self.assertEqual(missing["fitness"].level, "info")
        self.assertEqual(findings_by_id(self.assess(sleep_hours=0))["sleep"].level, "watch")
        self.assertEqual(findings_by_id(self.assess(sleep_hours=5.9))["sleep"].level, "watch")
        self.assertEqual(findings_by_id(self.assess(sleep_hours=6))["sleep"].level, "info")
        missed = findings_by_id(self.assess(exercise_completed=False))
        self.assertEqual(missed["fitness"].level, "watch")
        self.assertEqual(missed["bone"].level, "watch")

    def test_planning_priorities_are_not_inferred_without_reported_observations(self):
        result = self.assess(heart_rate=72, spo2=98)
        findings = findings_by_id(result)
        self.assertEqual(findings["radiation"].level, "info")
        self.assertEqual(findings["medical_support"].level, "info")
        self.assertFalse(any("Beyond low Earth orbit" in finding.reason for finding in result.findings))
        radiation = findings_by_id(self.assess(symptoms={"radiation_alert"}))["radiation"]
        self.assertEqual(radiation.level, "urgent")

    def test_mixed_findings_sort_by_urgency_and_reference_real_sources(self):
        result = self.assess(spo2=87,
                             symptoms={"poor_sleep", "vision_changes", "bone_pain"})
        severity = {"urgent": 0, "review": 1, "watch": 2, "info": 3}
        ranks = [severity[f.level] for f in result.findings]
        self.assertEqual(ranks, sorted(ranks))
        self.assertEqual(len(result.findings), len(CONDITION_IDS))
        source_ids = {s["id"] for s in self.catalog["sources"]}
        for finding in result.findings:
            self.assertLessEqual(set(finding.source_ids), source_ids)

    def test_notes_are_retained_as_notes_without_silent_diagnosis(self):
        result = self.assess(notes="Chest pain and radiation alert written only in notes")
        self.assertEqual(result.level, "info")
        self.assertTrue(any("not automatically analyzed" in note for note in result.data_notes))

    def test_multiple_triggers_for_one_group_preserve_highest_urgency(self):
        result = self.assess(spo2=86, signal_quality="poor",
                             symptoms={"breathing_difficulty", "confusion", "environmental_alert"})
        finding = findings_by_id(result)["hypoxia"]
        self.assertEqual(finding.level, "urgent")
        self.assertIn("86", finding.reason)
        self.assertIn("confusion", finding.reason)
        self.assertIn("signal quality", finding.reason)
        self.assertEqual(len(finding.actions), len(set(finding.actions)))


if __name__ == "__main__":
    unittest.main()
