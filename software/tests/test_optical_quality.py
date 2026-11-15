"""Optical engineering gates must recover using only fresh contiguous data."""

from math import sin, pi
from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from astrotip.analysis.optical_quality import OpticalSignalQuality
from astrotip.inputs.sensor_serial import OpticalSample


def sample(index, *, step=0.04, red_offset=0, ir_offset=0):
    pulse = sin(index * step * 2 * pi * 1.2)
    return OpticalSample(index, index * step,
                         int(90000 + 700 * pulse + red_offset),
                         int(120000 + 1000 * pulse + ir_offset))


class OpticalQualityTests(unittest.TestCase):
    def fill(self, monitor, start=0, count=100, **kwargs):
        for index in range(start, start + count):
            monitor.add_sample(sample(index, **kwargs))

    def test_legacy_fallback_only_before_first_stream_or_after_disconnect(self):
        monitor = OpticalSignalQuality()
        self.assertEqual(monitor.evaluate(1), "unavailable")
        monitor.add_sample(sample(0))
        self.assertTrue(monitor.stream_seen)
        self.assertEqual(monitor.evaluate(0), "collecting")
        self.assertEqual(monitor.evaluate(4), "timing")
        monitor.reset(keep_stream=True)
        self.assertTrue(monitor.stream_seen)
        self.assertEqual(monitor.evaluate(4), "collecting")
        self.fill(monitor, start=100, count=99)
        self.assertEqual(monitor.evaluate(8), "collecting")
        monitor.add_sample(sample(199))
        self.assertEqual(monitor.evaluate(8), "ready")
        monitor.reset()
        self.assertFalse(monitor.stream_seen)
        self.assertEqual(monitor.evaluate(4), "unavailable")

    def test_steady_pulse_requires_complete_window(self):
        monitor = OpticalSignalQuality()
        self.fill(monitor, count=99)
        self.assertEqual(monitor.evaluate(3.92), "collecting")
        monitor.add_sample(sample(99))
        self.assertEqual(monitor.evaluate(4), "ready")

    def test_large_step_or_slow_drift_on_either_channel_is_changing(self):
        for channel in ("red_offset", "ir_offset"):
            with self.subTest(channel=channel):
                monitor = OpticalSignalQuality()
                self.fill(monitor, count=99)
                monitor.add_sample(sample(99, **{channel: 15000}))
                self.assertEqual(monitor.evaluate(4), "changing")
                monitor.reset()
                for index in range(100):
                    monitor.add_sample(sample(index, **{channel: 200 * index}))
                self.assertEqual(monitor.evaluate(4), "changing")

    def test_movement_recovers_when_changed_window_has_aged_out(self):
        monitor = OpticalSignalQuality()
        self.fill(monitor, count=99)
        monitor.add_sample(sample(99, red_offset=15000))
        self.assertEqual(monitor.evaluate(4), "changing")
        self.fill(monitor, start=100)
        self.assertEqual(monitor.evaluate(8), "ready")

    def test_packet_loss_and_time_reset_require_new_full_window(self):
        for interrupted in (sample(101), sample(0)):
            with self.subTest(interrupted=interrupted):
                monitor = OpticalSignalQuality()
                self.fill(monitor)
                monitor.add_sample(interrupted)
                self.assertEqual(monitor.evaluate(interrupted.elapsed_seconds), "collecting")
                self.fill(monitor, start=interrupted.sequence + 1, count=98)
                self.assertEqual(monitor.evaluate(monitor.samples[-1].elapsed_seconds), "collecting")
                monitor.add_sample(sample(interrupted.sequence + 99))
                self.assertEqual(monitor.evaluate(monitor.samples[-1].elapsed_seconds), "ready")

    def test_contact_loss_and_clipping_discard_previous_window(self):
        for red, infrared, state in ((90000, 40000, "no_contact"),
                                    (0, 120000, "clipped"),
                                    (262143, 120000, "clipped"),
                                    (90000, 262143, "clipped")):
            with self.subTest(state=state, red=red, infrared=infrared):
                monitor = OpticalSignalQuality()
                self.fill(monitor)
                monitor.add_sample(OpticalSample(100, 4, red, infrared))
                self.assertEqual(monitor.evaluate(4), state)
                self.assertTrue(monitor.stream_seen)
                self.fill(monitor, start=101, count=99)
                self.assertEqual(monitor.evaluate(8), "collecting")
                monitor.add_sample(sample(200))
                self.assertEqual(monitor.evaluate(8), "ready")

    def test_incorrect_rate_and_stale_or_reversed_report_time(self):
        for step in (0.02, 0.08):
            monitor = OpticalSignalQuality()
            self.fill(monitor, step=step)
            self.assertEqual(monitor.evaluate(99 * step), "timing")
        monitor = OpticalSignalQuality()
        self.fill(monitor)
        self.assertEqual(monitor.evaluate(6), "timing")
        self.assertEqual(monitor.evaluate(3), "timing")
        self.assertEqual(monitor.evaluate(3.9), "ready")
        self.assertEqual(monitor.evaluate(float("nan")), "timing")

    def test_sequence_rollover_is_contiguous(self):
        monitor = OpticalSignalQuality()
        for index in range(100):
            source = sample(index)
            monitor.add_sample(OpticalSample((0xFFFFFFFF - 50 + index) & 0xFFFFFFFF,
                                            source.elapsed_seconds, source.red, source.infrared))
        self.assertEqual(monitor.evaluate(4), "ready")


if __name__ == "__main__":
    unittest.main()
