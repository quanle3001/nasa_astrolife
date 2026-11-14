"""Input validation protects the assessment boundary, including non-finite values."""

import math
from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from astrotip.models.health_indicator import CheckIn


class CheckInTests(unittest.TestCase):
    def test_blank_checkin_does_not_invent_measurements(self):
        value = CheckIn()
        self.assertIsNone(value.heart_rate)
        self.assertIsNone(value.spo2)
        self.assertIsNone(value.sleep_hours)
        self.assertIsNone(value.exercise_completed)
        self.assertEqual(value.signal_quality, "unknown")

    def test_rejects_nonfinite_out_of_range_and_boolean_measurements(self):
        for field, values in {
            "spo2": [0, -1, 101, math.nan, math.inf, True, "95"],
            "heart_rate": [0, -1, 301, math.nan, -math.inf, True, "70"],
            "sleep_hours": [-1, 25, math.nan, math.inf, False, "8"],
        }.items():
            for value in values:
                with self.subTest(field=field, value=value):
                    with self.assertRaises(ValueError):
                        CheckIn(**{field: value})

    def test_zero_sleep_is_distinct_from_missing(self):
        self.assertEqual(CheckIn(sleep_hours=0).sleep_hours, 0)

    def test_symptoms_are_copied_into_immutable_observations(self):
        symptoms = {"poor_sleep"}
        value = CheckIn(symptoms=symptoms)
        symptoms.add("chest_pain")
        self.assertEqual(value.symptoms, frozenset({"poor_sleep"}))

    def test_unknown_categories_are_rejected(self):
        for kwargs in (
            {"mission": "venus"}, {"signal_quality": "excellent"},
            {"symptoms": {"invented_diagnosis"}}, {"symptoms": "chest_pain"},
            {"exercise_completed": 1}, {"notes": "x" * 5001},
        ):
            with self.subTest(kwargs=kwargs):
                with self.assertRaises(ValueError):
                    CheckIn(**kwargs)


if __name__ == "__main__":
    unittest.main()
