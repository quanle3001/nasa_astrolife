"""Firmware protocol and live-monitor failure cases; no physical device needed."""

import os
from pathlib import Path
import sys
import unittest
from unittest.mock import patch

os.environ.setdefault("QT_QPA_PLATFORM", "offscreen")
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import serial
from PySide6.QtCore import QEventLoop, QTimer, QObject, Signal
from PySide6.QtWidgets import QApplication
from astrotip.analysis.nasa_guidance import load_catalog
from astrotip.inputs.sensor_serial import OpticalSample, ReportParser, SensorReading, SerialReader
from astrotip.ui.pages.sensor import SensorPage


def report(hr="72 BPM", spo2="98%", finger=True, hr_valid=True, spo2_valid=True):
    # Matches printHealthReport() in the user's ESP32 firmware (not its CSV comment).
    return f"""
======================================
       ASTROTIP HEALTH MONITOR
======================================
Sensor Status: Connected
Finger Detection: {'Likely detected' if finger else 'Not detected'}
--- HEALTH MEASUREMENTS ---
Heart Rate: {hr}
Description: Estimated heartbeats per minute.
Measurement Valid: {'Yes' if hr_valid else 'No'}
Blood Oxygen (SpO2): {spo2}
Description: Estimated peripheral oxygen saturation.
Measurement Valid: {'Yes' if spo2_valid else 'No'}
--- RAW SENSOR DATA ---
Red Light: 60000
Infrared Light: 80000
Elapsed Time: 12.5 seconds
Note: Experimental estimates only.
Not for medical diagnosis.
======================================
""".replace("\n", "\r\n").encode()


class ParserTests(unittest.TestCase):
    def test_window_diagnostics_reject_bad_timing_contact_and_clipping(self):
        for status, rate, usable in (("ready", 25, True), ("ready", 10, False),
                                     ("timing", 10, False), ("no_contact", 25, False),
                                     ("clipped", 25, False), ("collecting", 0, False)):
            with self.subTest(status=status, rate=rate):
                data = report().replace(b"Sensor Status: Connected", (
                    f"Sensor Status: Connected\nFirmware: astro-life-ppg-2\n"
                    f"Signal Status: {status}\nSample Rate: {rate} Hz"
                ).encode())
                reading, = ReportParser().feed(data)
                self.assertEqual(reading.usable, usable)
                self.assertEqual(reading.sample_rate_hz, rate)
                self.assertEqual(reading.firmware_version, "astro-life-ppg-2")
                if not usable:
                    self.assertIsNone(reading.heart_rate)
                    self.assertIsNone(reading.spo2)

    def test_fragmented_optical_stream_and_new_reports_can_be_interleaved(self):
        parser = ReportParser()
        raw = b"PPG,0,800,60001,80002\r\n" + report().replace(
            b"ASTROTIP HEALTH MONITOR", b"ASTRO LIFE HEALTH MONITOR"
        ).replace(b"--- RAW SENSOR DATA ---", b"PPG,1,840,60003,80004\r\n--- RAW SENSOR DATA ---")
        events = []
        for byte in raw:
            events.extend(parser.feed(bytes([byte])))
        self.assertEqual(events[:2], [OpticalSample(0, 0.8, 60001, 80002), OpticalSample(1, 0.84, 60003, 80004)])
        self.assertIsInstance(events[2], SensorReading)
        self.assertEqual((events[2].heart_rate, events[2].spo2), (72, 98))

    def test_malformed_optical_packets_never_become_samples_or_vitals(self):
        for packet in (b"PPG,1,2,3", b"PPG,1,2,3,4,5", b"PPG,-1,2,3,4", b"PPG,1,nan,3,4",
                       b"PPG,1,2,262144,4", b"PPG,1,4294967296,3,4", b"PPG,1,2,3,inf"):
            with self.subTest(packet=packet):
                parser = ReportParser()
                events = parser.feed(packet + b"\nPPG,10,1000,0,262143\n")
                self.assertIsInstance(events[0], str)
                self.assertEqual(events[1], OpticalSample(10, 1, 0, 262143))

    def test_fragmented_reports_emit_only_when_complete(self):
        parser = ReportParser()
        raw = report()
        events = []
        for byte in raw[:-1]:
            events.extend(parser.feed(bytes([byte])))
        self.assertEqual(events, [])
        reading, = parser.feed(raw[-1:])
        self.assertEqual((reading.heart_rate, reading.spo2), (72, 98))
        self.assertEqual((reading.red, reading.infrared), (60000, 80000))
        self.assertEqual(reading.elapsed_seconds, 12.5)

    def test_validity_finger_sentinels_and_bounds_are_respected(self):
        for data, expected in (
            (report(finger=False), (None, None)),
            (report(hr_valid=False), (None, 98)),
            (report(spo2_valid=False), (72, None)),
            (report(hr="Unavailable", spo2="Unavailable"), (None, None)),
            (report(hr="-1 BPM", spo2="-1%"), (None, None)),
            (report(hr="221 BPM", spo2="101%"), (None, None)),
            (report(spo2="70%"), (72, 70)),
        ):
            with self.subTest(expected=expected, data=data):
                reading, = ReportParser().feed(data)
                self.assertEqual((reading.heart_rate, reading.spo2), expected)

    def test_restarts_errors_and_partial_reports_never_mix_readings(self):
        parser = ReportParser()
        parser.feed(report()[:180])
        events = parser.feed(b"\nERROR: Sensor reading timeout!\n" + report(hr="Unavailable"))
        self.assertIn("ERROR:", events[0])
        self.assertIsNone(events[1].heart_rate)
        self.assertEqual(events[1].spo2, 98)
        parser.feed(report()[:180])
        events = parser.feed(b"\nInitializing AstroTip MAX30102...\n" + report(spo2="87%"))
        self.assertIsInstance(events[0], str)
        self.assertEqual(events[1].spo2, 87)

    def test_malformed_and_incomplete_reports_recover(self):
        for data in (report(hr="nan BPM"), report(spo2="bad%"), report().replace(b"Measurement Valid: Yes\r\n", b"")):
            events = ReportParser().feed(data + report())
            readings = [value for value in events if isinstance(value, SensorReading)]
            self.assertEqual(len(readings), 1)
            self.assertEqual(readings[0].heart_rate, 72)

    def test_oversized_lines_are_bounded_and_discarded(self):
        parser = ReportParser()
        parser.feed(b"x" * 100000)
        self.assertLessEqual(len(parser.buffer), 1024)
        events = parser.feed(b"\n" + report())
        self.assertEqual(len(events), 1)

    def test_serial_reader_delivers_reports_and_closes_on_unplug(self):
        class FakeSerial:
            in_waiting = 0
            def __init__(self, **kwargs):
                self.chunks = [report(), b"PPG,0,800,60001,80002\n"]
                self.closed = False
                self.options = kwargs
            def open(self):
                pass
            def read(self, _size):
                if self.chunks:
                    return self.chunks.pop()
                raise serial.SerialException("unplugged")
            def close(self):
                self.closed = True
        connection = FakeSerial()
        reader = SerialReader("COM9", serial_factory=lambda **kw: connection)
        readings, samples, errors = [], [], []
        reader.reading_received.connect(readings.append)
        reader.optical_sample_received.connect(samples.append)
        reader.status_changed.connect(errors.append)
        reader.run()
        self.assertEqual(len(readings), 1)
        self.assertEqual(samples, [OpticalSample(0, 0.8, 60001, 80002)])
        self.assertIn("unplugged", errors[0])
        self.assertTrue(connection.closed)


class FakeReader(QObject):
    reading_received = Signal(object)
    optical_sample_received = Signal(object)
    status_changed = Signal(str)
    connected = Signal()
    finished = Signal()
    def __init__(self, port, parent):
        super().__init__(parent)
        self.interrupted = False
    def start(self):
        self.connected.emit()
    def requestInterruption(self):
        self.interrupted = True
    def isInterruptionRequested(self):
        return self.interrupted
    def wait(self, _timeout):
        return True


class LiveMonitorTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.app = QApplication.instance() or QApplication([])
        cls.catalog = load_catalog()

    def setUp(self):
        with patch("astrotip.ui.pages.sensor.available_ports", return_value=[("COM9", "ESP32")]):
            self.page = SensorPage(self.catalog, reader_factory=FakeReader)
        self.page.toggle_connection()

    def tearDown(self):
        self.page.shutdown()
        self.page.deleteLater()
        self.app.processEvents()

    def test_live_low_reading_is_analyzed_and_snapshot_is_traceable(self):
        reading, = ReportParser().feed(report(spo2="87%"))
        self.page.reader.reading_received.emit(reading)
        self.assertIn("immediate medical attention", self.page.result.toPlainText())
        self.assertFalse(self.page.urgent_notice.isHidden())
        self.assertIn("Immediate action", self.page.urgent_notice.text())
        self.assertIn("87", self.page.spo2.text())
        self.assertEqual(self.page.latest_checkin.input_source, "sensor")
        self.assertEqual(self.page.latest_checkin.sensor_port, "COM9")
        self.assertEqual(self.page.latest_checkin.sensor_received_at, reading.received_at)
        snapshots = []
        self.page.snapshot_requested.connect(snapshots.append)
        self.page.snapshot_button.click()
        self.assertEqual(snapshots, [self.page.latest_checkin])
        typical, = ReportParser().feed(report())
        self.page.receive_reading(typical)
        self.assertTrue(self.page.urgent_notice.isHidden())

    def test_changing_readings_and_low_oxygen_alert_are_displayed_immediately(self):
        from dataclasses import replace
        initial, = ReportParser().feed(report())
        for index in range(3):
            self.page.receive_reading(replace(initial, elapsed_seconds=index + 1))
        self.assertEqual(self.page.reading_state, "steady")
        self.page.receive_reading(replace(initial, heart_rate=187, elapsed_seconds=4))
        self.assertEqual(self.page.reading_state, "changing")
        self.assertEqual(self.page.heart_rate.text(), "187")
        self.assertNotIn("Rechecking", self.page.quality.text())
        self.assertNotIn("Rechecking", self.page.result.toPlainText())
        self.assertFalse(hasattr(self.page, "pulse_state"))
        self.assertFalse(hasattr(self.page, "oxygen_state"))
        self.assertEqual(self.page.spo2.text(), "98")
        self.assertEqual(self.page.latest_checkin.heart_rate, 187)
        self.assertEqual(self.page.latest_checkin.signal_quality, "poor")
        self.page.receive_reading(replace(initial, spo2=87, elapsed_seconds=5))
        self.assertEqual(self.page.spo2.text(), "87")
        self.assertFalse(self.page.urgent_notice.isHidden())
        self.assertIn("medical attention", self.page.result.toPlainText())

    def test_display_and_review_both_use_latest_estimate_without_median(self):
        from dataclasses import replace
        initial, = ReportParser().feed(report())
        for time, pulse, oxygen in ((1, 72, 98), (2, 75, 97), (3, 73, 99)):
            self.page.receive_reading(replace(initial, heart_rate=pulse, spo2=oxygen, elapsed_seconds=time))
        self.assertEqual(self.page.heart_rate.text(), "73")
        self.assertEqual(self.page.spo2.text(), "99")
        self.assertEqual(self.page.latest_checkin.spo2, 99)
        snapshots = []
        self.page.snapshot_requested.connect(snapshots.append)
        self.page.snapshot()
        self.assertEqual(snapshots[0].spo2, 99)

    def test_noisy_optical_window_keeps_latest_numbers_and_alerts_visible(self):
        from dataclasses import replace
        initial, = ReportParser().feed(report())
        for index in range(100):
            offset = 15000 if index >= 75 else 0
            self.page.receive_optical_sample(OpticalSample(index, index * .04, 60000 + offset, 80000 + offset))
        for time in (4, 4.1, 4.2):
            self.page.receive_reading(replace(initial, elapsed_seconds=time))
        self.assertEqual(self.page.reading_state, "settling")
        self.assertEqual(self.page.heart_rate.text(), "72")
        self.assertEqual(self.page.spo2.text(), "98")
        self.assertIn("Optical check: changing", self.page.technical_details.text())
        self.page.receive_reading(replace(initial, spo2=87, elapsed_seconds=4.3))
        self.assertEqual(self.page.spo2.text(), "87")
        self.assertFalse(self.page.urgent_notice.isHidden())
        self.assertEqual(self.page.latest_checkin.spo2, 87)

    def test_stream_recovers_using_fresh_samples_and_reports(self):
        from dataclasses import replace
        initial, = ReportParser().feed(report())
        for index in range(150):
            self.page.receive_optical_sample(OpticalSample(index, index * .04, 60000, 80000))
            if index in (99, 124, 149):
                self.page.receive_reading(replace(initial, elapsed_seconds=index * .04))
        self.assertEqual(self.page.heart_rate.text(), "72")
        self.assertEqual(self.page.spo2.text(), "98")
        # A missing optical stream must not silently become legacy/report-only.
        self.page.receive_reading(replace(initial, elapsed_seconds=8))
        self.assertEqual(self.page.heart_rate.text(), "72")
        self.assertEqual(self.page.reading_state, "settling")

    def test_first_report_is_displayed_without_waiting_for_more_reports(self):
        reading, = ReportParser().feed(report(hr="166 BPM", spo2="90%"))
        self.page.receive_reading(reading)
        self.assertEqual(self.page.heart_rate.text(), "166")
        self.assertEqual(self.page.spo2.text(), "90")
        self.assertIn("medical team", self.page.result.toPlainText())
        self.assertNotIn("Collecting", self.page.quality.text())

    def test_missing_channel_does_not_hide_other_channel(self):
        reading, = ReportParser().feed(report(hr_valid=False))
        self.page.receive_reading(reading)
        self.assertEqual(self.page.heart_rate.text(), "—")
        self.assertEqual(self.page.spo2.text(), "98")

    def test_contact_loss_in_raw_stream_clears_vitals_before_next_report(self):
        reading, = ReportParser().feed(report())
        self.page.receive_reading(reading)
        self.page.receive_optical_sample(OpticalSample(1, 13, 1000, 2000))
        self.assertIsNone(self.page.latest_checkin)
        self.assertEqual(self.page.heart_rate.text(), "—")
        self.assertFalse(self.page.snapshot_button.isEnabled())

    def test_technical_information_is_optional(self):
        self.assertTrue(self.page.details.isHidden())
        self.assertFalse(self.page.waveform.red_curve.isVisible())
        self.page.details_button.click()
        self.assertFalse(self.page.details.isHidden())
        self.assertTrue(self.page.waveform.red_curve.isVisible())

    def test_raw_samples_plot_without_creating_or_refreshing_vitals(self):
        self.page.reader.optical_sample_received.emit(OpticalSample(1, 1, 60000, 80000))
        self.assertEqual(len(self.page.waveform.samples), 1)
        self.assertIsNone(self.page.latest_checkin)
        self.assertFalse(self.page.snapshot_button.isEnabled())
        reading, = ReportParser().feed(report())
        self.page.receive_reading(reading)
        self.page.last_received -= 10
        self.page.reader.optical_sample_received.emit(OpticalSample(2, 1.04, 60010, 80020))
        self.page.snapshot()
        self.assertIsNone(self.page.latest_checkin)
        self.assertEqual(len(self.page.waveform.samples), 2)

    def test_invalid_vitals_can_still_show_real_optical_signal(self):
        self.page.reader.optical_sample_received.emit(OpticalSample(0, 1, 60000, 80000))
        reading, = ReportParser().feed(report(hr_valid=False, spo2_valid=False))
        self.page.receive_reading(reading)
        self.assertIsNone(self.page.latest_checkin)
        self.assertTrue(self.page.waveform.idle_line.isVisible())
        self.page.device_status("ERROR: Sensor reading timeout!")
        self.assertEqual(len(self.page.waveform.samples), 0)

    def test_finger_loss_and_sensor_errors_clear_old_vitals(self):
        valid, = ReportParser().feed(report(spo2="87%"))
        invalid, = ReportParser().feed(report(finger=False))
        for invalidate in (lambda: self.page.receive_reading(invalid), lambda: self.page.device_status("ERROR: sensor timeout")):
            self.page.receive_reading(valid)
            invalidate()
            self.assertIsNone(self.page.latest_checkin)
            self.assertFalse(self.page.snapshot_button.isEnabled())
            self.assertTrue(self.page.urgent_notice.isHidden())
            self.assertNotIn("98", self.page.spo2.text())

    def test_stale_sample_cannot_be_saved(self):
        reading, = ReportParser().feed(report())
        self.page.receive_reading(reading)
        snapshots = []
        self.page.snapshot_requested.connect(snapshots.append)
        self.page.last_received -= 10
        self.page.snapshot()
        self.assertEqual(snapshots, [])
        self.assertIsNone(self.page.latest_checkin)
        self.assertIn("8 seconds", self.page.quality.text())

    def test_disconnect_ignores_queued_samples_and_allows_reconnect(self):
        worker = self.page.reader
        reading, = ReportParser().feed(report())
        self.page.disconnect_sensor()
        worker.reading_received.emit(reading)
        worker.optical_sample_received.emit(OpticalSample(0, 1, 60000, 80000))
        self.assertIsNone(self.page.latest_checkin)
        self.assertEqual(len(self.page.waveform.samples), 0)
        worker.finished.emit()
        self.assertIsNone(self.page.reader)
        self.assertTrue(self.page.connect_button.isEnabled())
        self.page.toggle_connection()
        self.page.reader.reading_received.emit(reading)
        self.assertIsNotNone(self.page.latest_checkin)

    def test_background_reader_delivers_to_ui_and_stops_cleanly(self):
        from time import sleep
        class SimulatedPort:
            closed = False
            pending = b"".join(f"PPG,{i},{800 + i * 40},{60000 + i},{80000 + i * 2}\n".encode() for i in range(25)) + report()
            @property
            def in_waiting(self):
                return len(self.pending)
            def open(self):
                pass
            def read(self, size):
                sleep(0.01)
                result, self.pending = self.pending[:size], self.pending[size:]
                return result
            def close(self):
                self.closed = True
        port = SimulatedPort()
        worker = SerialReader("COM9", serial_factory=lambda **kwargs: port)
        loop = QEventLoop()
        timer = QTimer()
        timer.setSingleShot(True)
        timer.timeout.connect(loop.quit)
        received = []
        def on_reading(reading):
            received.append(reading)
            self.page.receive_reading(reading)
            loop.quit()
        worker.reading_received.connect(on_reading)
        worker.optical_sample_received.connect(self.page.waveform.add_sample)
        try:
            worker.start()
            timer.start(2000)
            loop.exec()
        finally:
            timer.stop()
            worker.requestInterruption()
            stopped = worker.wait(1500)
        self.assertTrue(stopped)
        self.assertEqual(len(received), 1)
        self.assertEqual(len(self.page.waveform.samples), 25)
        self.page.waveform.redraw()
        x, values = self.page.waveform.red_curve.getData()
        self.assertEqual(len(x), 25)
        self.assertTrue(all(value <= 0 for value in values))
        self.assertEqual(self.page.waveform.samples[-1].red - self.page.waveform.samples[0].red, 24)
        self.assertEqual(self.page.spo2.text(), "98")
        self.assertTrue(port.closed)


if __name__ == "__main__":
    unittest.main()
