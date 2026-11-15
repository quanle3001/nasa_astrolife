"""Waveform values, continuity, fallback behavior and bounded memory."""

import os
from pathlib import Path
import sys
import unittest
from unittest.mock import patch

os.environ.setdefault("QT_QPA_PLATFORM", "offscreen")
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import numpy as np
from PySide6.QtWidgets import QApplication

from astrotip.inputs.sensor_serial import OpticalSample, SensorReading
from astrotip.ui.optical_waveform import OpticalWaveform


class WaveformTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.app = QApplication.instance() or QApplication([])

    def setUp(self):
        self.waveform = OpticalWaveform()

    def tearDown(self):
        self.waveform.timer.stop()
        self.waveform.deleteLater()
        self.app.processEvents()

    def test_display_filter_is_causal_and_preserves_raw_samples(self):
        samples = (OpticalSample(0, 2, 60000, 80000), OpticalSample(1, 2.04, 60020, 80060),
                   OpticalSample(2, 2.08, 60010, 80030))
        for sample in samples:
            self.waveform.add_sample(sample)
        self.waveform.redraw()
        x, red = self.waveform.red_curve.getData()
        _, infrared = self.waveform.ir_curve.getData()
        np.testing.assert_allclose(x, [-0.08, -0.04, 0])
        self.assertEqual(list(self.waveform.samples), list(samples))
        self.assertEqual(red[0], 0)
        self.assertLess(red[1], 0)  # Optical absorption is inverted for display.
        np.testing.assert_allclose(infrared, red * 3)
        previous = red.copy()
        self.waveform.add_sample(OpticalSample(3, 2.12, 60030, 80090))
        self.waveform.redraw()
        np.testing.assert_allclose(self.waveform.red_curve.getData()[1][:3], previous)

    def test_gaps_restarts_and_counter_wrap_do_not_join_unrelated_segments(self):
        for next_sample in (OpticalSample(3, 1.04, 60010, 80020), OpticalSample(0, 0.8, 60010, 80020),
                            OpticalSample(1, 3, 60010, 80020), OpticalSample(1, 0, 60010, 80020)):
            with self.subTest(next_sample=next_sample):
                self.waveform.clear()
                self.waveform.add_sample(OpticalSample(0, 1, 60000, 80000))
                self.waveform.add_sample(next_sample)
                self.assertEqual(list(self.waveform.samples), [next_sample])

    def test_window_and_capacity_are_bounded(self):
        for index in range(1500):
            self.waveform.add_sample(OpticalSample(index, index / 25, 60000 + index, 80000 + index * 2))
        self.assertLessEqual(len(self.waveform.samples), 251)
        self.assertLessEqual(self.waveform.samples[-1].elapsed_seconds - self.waveform.samples[0].elapsed_seconds, 10)
        self.waveform.clear()
        for index in range(1500):
            self.waveform.add_sample(OpticalSample(index, 1, 60000 + index, 80000 + index * 2))
        self.assertEqual(len(self.waveform.samples), self.waveform.MAX_SAMPLES)
        self.assertEqual(len(self.waveform.filtered), len(self.waveform.samples))

    def test_summary_only_firmware_uses_lines_and_is_not_mixed_with_stream(self):
        reading = SensorReading(72, 98, True, 60000, 80000, 2, "test")
        self.waveform.add_report(reading)
        self.waveform.add_report(SensorReading(72, 98, True, 60020, 80040, 4, "test"))
        self.waveform.redraw()
        self.assertEqual(self.waveform.mode, "reports")
        self.assertIn("SLOW UPDATES", self.waveform.title.text())
        for curve in (self.waveform.red_curve, self.waveform.ir_curve):
            self.assertIsNotNone(curve.opts["pen"])
            self.assertIsNone(curve.opts["symbol"])
            self.assertEqual(len(curve.getData()[0]), 2)
        self.waveform.add_sample(OpticalSample(1, 3, 60010, 80020))
        self.waveform.add_report(reading)
        self.assertEqual(len(self.waveform.samples), 1)
        self.assertEqual(self.waveform.mode, "stream")

    def test_lost_contact_and_clipping_clear_the_trace_without_fake_fallback(self):
        for red, ir in ((1000, 1500), (262143, 80000), (60000, 262143)):
            with self.subTest(red=red, ir=ir):
                self.waveform.add_sample(OpticalSample(0, 1, 60000, 80000))
                self.waveform.add_sample(OpticalSample(1, 1.04, red, ir))
                self.assertFalse(self.waveform.samples)
                self.waveform.add_report(SensorReading(None, None, True, 60000, 80000, 2, "test"))
                self.assertFalse(self.waveform.samples)

    def test_details_can_show_both_channels_without_enabling_dot_markers(self):
        self.assertFalse(self.waveform.red_curve.isVisible())
        self.waveform.set_details_visible(True)
        self.assertTrue(self.waveform.red_curve.isVisible())
        self.assertTrue(self.waveform.legend.isVisible())

    def test_idle_line_is_an_indicator_and_unavailable_pulse_cannot_redraw_old_trace(self):
        self.assertTrue(self.waveform.idle_line.isVisible())
        self.assertEqual(self.waveform.title.text(), "HEART PULSE")
        self.waveform.add_sample(OpticalSample(1, 1, 60000, 80000))
        self.waveform.redraw()
        self.assertFalse(self.waveform.idle_line.isVisible())
        self.waveform.add_report(SensorReading(None, 98, True, 60000, 80000, 2, "test"))
        self.waveform.add_sample(OpticalSample(2, 2.04, 60010, 80020))
        self.waveform.redraw()
        self.assertTrue(self.waveform.idle_line.isVisible())
        self.assertIsNone(self.waveform.ir_curve.getData()[0])
        self.waveform.add_report(SensorReading(72, 98, True, 60000, 80000, 3, "test"))
        self.waveform.add_sample(OpticalSample(3, 3.04, 60010, 80020))
        self.waveform.redraw()
        self.assertFalse(self.waveform.idle_line.isVisible())

    def test_stale_signal_clears_curves_and_new_data_starts_fresh(self):
        with patch("astrotip.ui.optical_waveform.monotonic", return_value=10):
            self.waveform.add_sample(OpticalSample(0, 1, 60000, 80000))
            self.waveform.redraw()
        with patch("astrotip.ui.optical_waveform.monotonic", return_value=13):
            self.waveform.check_freshness()
        self.assertEqual(len(self.waveform.samples), 0)
        self.assertIsNone(self.waveform.red_curve.getData()[0])
        self.assertIn("Signal paused", self.waveform.status.text())
        self.waveform.add_sample(OpticalSample(50, 3, 61000, 81000))
        self.assertEqual(len(self.waveform.samples), 1)


if __name__ == "__main__":
    unittest.main()
