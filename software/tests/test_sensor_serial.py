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
from astrotip.inputs.sensor_serial import ReportParser, SensorReading, SerialReader
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
            def __init__(self, **kwargs):
                self.chunks = [report()]
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
        readings, errors = [], []
        reader.reading_received.connect(readings.append)
        reader.status_changed.connect(errors.append)
        reader.run()
        self.assertEqual(len(readings), 1)
        self.assertIn("unplugged", errors[0])
        self.assertTrue(connection.closed)


class FakeReader(QObject):
    reading_received = Signal(object)
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
        self.assertIn("87", self.page.spo2.text())
        self.assertEqual(self.page.latest_checkin.input_source, "sensor")
        self.assertEqual(self.page.latest_checkin.sensor_port, "COM9")
        self.assertEqual(self.page.latest_checkin.sensor_received_at, reading.received_at)
        snapshots = []
        self.page.snapshot_requested.connect(snapshots.append)
        self.page.snapshot_button.click()
        self.assertEqual(snapshots, [self.page.latest_checkin])

    def test_finger_loss_and_sensor_errors_clear_old_vitals(self):
        valid, = ReportParser().feed(report())
        invalid, = ReportParser().feed(report(finger=False))
        for invalidate in (lambda: self.page.receive_reading(invalid), lambda: self.page.device_status("ERROR: sensor timeout")):
            self.page.receive_reading(valid)
            invalidate()
            self.assertIsNone(self.page.latest_checkin)
            self.assertFalse(self.page.snapshot_button.isEnabled())
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
        self.assertIsNone(self.page.latest_checkin)
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
            pending = report()
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
        self.assertIn("98", self.page.spo2.text())
        self.assertTrue(port.closed)


if __name__ == "__main__":
    unittest.main()
