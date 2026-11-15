"""Stable measurement windows reject disagreement and aggregate agreeing reports."""

from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from astrotip.analysis.reading_stability import ReadingStability
from astrotip.inputs.sensor_serial import SensorReading


def reading(time, hr=72, spo2=98, finger=True):
    return SensorReading(hr, spo2, finger, 60000, 80000, time, "test")


class ConsistencyTests(unittest.TestCase):
    def test_missing_oxygen_does_not_reset_consistent_pulse(self):
        monitor = ReadingStability()
        for time in range(1, 8):
            monitor.update(reading(time, spo2=None if time % 2 else 98))
            if time >= 3:
                self.assertEqual(monitor.display_value("heart_rate"), 72)
            self.assertIsNone(monitor.display_value("spo2"))
        for time in (8, 9, 10):
            monitor.update(reading(time))
        self.assertEqual(monitor.display_value("spo2"), 98)

    def test_normal_report_timing_jitter_does_not_blank_stable_numbers(self):
        monitor = ReadingStability()
        for time in (10.1, 11.0, 12.0):
            monitor.update(reading(time))
        self.assertEqual(monitor.display_value("heart_rate"), 72)

    def test_small_jitter_uses_median_without_mutating_original(self):
        monitor = ReadingStability()
        for time, hr, oxygen in ((1, 72, 98), (2, 75, 97), (3, 73, 99)):
            monitor.update(reading(time, hr, oxygen))
        self.assertEqual(monitor.display_value("heart_rate"), 73)
        self.assertEqual(monitor.display_value("spo2"), 98)
        self.assertEqual(monitor.readings[-1].spo2, 99)

    def test_alternating_extremes_are_never_presented_as_a_stable_number(self):
        monitor = ReadingStability()
        for time in range(1, 15):
            monitor.update(reading(time, 60 if time % 2 else 190))
            self.assertIsNone(monitor.display_value("heart_rate"))
        self.assertEqual(monitor.display_value("spo2"), 98)

    def test_large_change_blanks_then_recovers_without_clamping_high_values(self):
        monitor = ReadingStability()
        for time in (1, 2, 3):
            monitor.update(reading(time))
        monitor.update(reading(4, 187, 87))
        self.assertIsNone(monitor.display_value("heart_rate"))
        self.assertIsNone(monitor.display_value("spo2"))
        for time in (5, 6):
            monitor.update(reading(time, 187, 87))
        self.assertEqual(monitor.display_value("heart_rate"), 187)
        self.assertEqual(monitor.display_value("spo2"), 87)

    def test_burst_reports_and_bad_signal_cannot_establish_stability(self):
        monitor = ReadingStability()
        for time in (1, 1.1, 1.2):
            self.assertEqual(monitor.update(reading(time)), "collecting")
        self.assertIsNone(monitor.display_value("heart_rate"))
        for time in (2, 3, 4):
            monitor.update(reading(time))
        self.assertEqual(monitor.update(reading(5), signal_ready=False), "settling")
        self.assertIsNone(monitor.display_value("heart_rate"))
        for time in (6, 7):
            self.assertEqual(monitor.update(reading(time)), "collecting")
        self.assertEqual(monitor.update(reading(8)), "steady")

    def test_three_consecutive_similar_reports_are_steady(self):
        monitor = ReadingStability()
        self.assertEqual(monitor.update(reading(1)), "collecting")
        self.assertEqual(monitor.update(reading(2, 73)), "collecting")
        self.assertEqual(monitor.update(reading(3, 71)), "steady")

    def test_sudden_changes_are_marked_immediately_and_recover_with_fresh_reports(self):
        monitor = ReadingStability()
        monitor.update(reading(1))
        high = reading(2, 187)
        self.assertEqual(monitor.update(high), "changing")
        self.assertEqual(monitor.readings[-1].heart_rate, 187)
        self.assertEqual(monitor.update(reading(3, 187)), "changing")
        self.assertEqual(monitor.update(reading(4, 187)), "steady")
        # Consistency does not turn a high value into a normal value.
        self.assertEqual(monitor.readings[-1].heart_rate, 187)
        self.assertEqual(monitor.update(reading(5, 187, 87)), "changing")
        self.assertEqual(monitor.readings[-1].spo2, 87)

    def test_disconnection_missing_channels_and_restarts_require_new_readings(self):
        for next_reading in (reading(20), reading(0), reading(3),
                             reading(4, finger=False)):
            with self.subTest(next_reading=next_reading):
                monitor = ReadingStability()
                for t in (1, 2, 3):
                    monitor.update(reading(t))
                self.assertNotEqual(monitor.update(next_reading), "steady")
        monitor.reset()
        self.assertEqual(monitor.update(reading(5)), "collecting")


if __name__ == "__main__":
    unittest.main()
