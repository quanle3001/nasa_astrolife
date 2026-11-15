"""Raw PPG forwarding, batching and sensor state handling in the desktop bridge."""

import os
from pathlib import Path
import sys
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch

os.environ.setdefault("QT_QPA_PLATFORM", "offscreen")
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from PySide6.QtCore import QCoreApplication, QObject, Signal

from astrotip.bridge.ppg_batcher import PpgBatcher, contact_state
from astrotip.bridge.service import BridgeService
from astrotip.inputs.sensor_serial import OpticalSample, ReportParser, SensorReading
from astrotip.inputs.simulated_reader import (
    DEMO_HEART_RATE, DEMO_SPO2, SAMPLES_PER_REPORT, synthetic_chunk,
)


def sample(sequence, red=60000, infrared=80000):
    return OpticalSample(sequence, sequence * 0.04, red, infrared)


def reading(heart_rate=72, spo2=98, elapsed=30.0, finger=True):
    return SensorReading(heart_rate, spo2, finger, 60000, 80000, elapsed, "2026-11-15T08:00:00+00:00",
                         "ready", 25.0, "astro-life-ppg-2")


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

    def wait(self, _timeout):
        return True


class PpgBatcherTests(unittest.TestCase):
    def setUp(self):
        self.batches = []
        self.batcher = PpgBatcher(self.batches.append)
        self.batcher.start_stream("sensor")

    def test_samples_keep_device_sequence_time_and_raw_counts(self):
        for index in range(3):
            self.batcher.add(sample(index, red=60000 + index, infrared=80000 + index))
        self.assertEqual(self.batcher.flush(), 1)
        batch, = self.batches
        self.assertEqual(batch["seq"], [0, 1, 2])
        self.assertEqual(batch["t_ms"], [0, 40, 80])
        self.assertEqual(batch["red"], [60000, 60001, 60002])
        self.assertEqual(batch["ir"], [80000, 80001, 80002])
        self.assertEqual((batch["batch_seq"], batch["dropped"], batch["contact"]), (0, 0, "ok"))
        self.assertEqual(self.batcher.flush(), 0, "An empty queue sends nothing")

    def test_batches_are_bounded_and_numbered(self):
        for index in range(PpgBatcher.MAX_BATCH * 2 + 5):
            self.batcher.add(sample(index))
        self.batcher.flush()
        self.assertEqual([len(batch["seq"]) for batch in self.batches], [32, 32, 5])
        self.assertEqual([batch["batch_seq"] for batch in self.batches], [0, 1, 2])
        self.assertEqual([seq for batch in self.batches for seq in batch["seq"]], list(range(69)))

    def test_stalled_consumer_drops_oldest_and_reports_the_gap(self):
        self.batcher.flush = lambda: 0  # Simulate a consumer that never drains.
        for index in range(PpgBatcher.MAX_QUEUE + 10):
            self.batcher.add(sample(index))
        del self.batcher.flush
        self.batcher.flush()
        self.assertEqual(self.batches[0]["dropped"], 10)
        self.assertEqual(self.batches[0]["seq"][0], 10)
        self.assertEqual(sum(len(batch["seq"]) for batch in self.batches), PpgBatcher.MAX_QUEUE)
        self.assertEqual(self.batches[1]["dropped"], 0)

    def test_new_stream_discards_old_samples_and_restarts_numbering(self):
        self.batcher.add(sample(1))
        first = self.batcher.stream_id
        self.assertEqual(self.batcher.start_stream("simulated"), first + 1)
        self.batcher.add(sample(0))
        self.batcher.flush()
        batch, = self.batches
        self.assertEqual((batch["source"], batch["batch_seq"], batch["seq"]), ("simulated", 0, [0]))

    def test_contact_states_use_raw_counts_only(self):
        self.assertEqual(contact_state(sample(0)), "ok")
        self.assertEqual(contact_state(sample(0, infrared=50000)), "no_contact")
        self.assertEqual(contact_state(sample(0, red=0)), "no_contact")
        self.assertEqual(contact_state(sample(0, infrared=262143)), "clipped")


class BridgeSensorTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.app = QCoreApplication.instance() or QCoreApplication([])

    def setUp(self):
        self.temp = TemporaryDirectory()
        with patch.dict(os.environ, {"ASTROTIP_HISTORY_PATH": str(Path(self.temp.name) / "history.sqlite3")}):
            self.service = BridgeService(self.app, reader_factory=FakeReader, simulated_factory=FakeReader)
        self.messages = []
        self.service.emit_message = self.messages.append

    def tearDown(self):
        self.service.ppg_timer.stop()
        self.service.deleteLater()
        self.temp.cleanup()

    def events(self, name):
        return [message["payload"] for message in self.messages if message.get("event") == name]

    def connect(self):
        self.service.connect_sensor({"port": "COM7"})
        return self.service.reader

    def test_raw_samples_reach_the_renderer_in_order_without_becoming_vitals(self):
        reader = self.connect()
        self.assertTrue(self.service.ppg_timer.isActive())
        for index in range(5):
            reader.optical_sample_received.emit(sample(index, infrared=80000 + index))
        self.service.ppg.flush()
        batch, = self.events("sensor.ppg.batch")
        self.assertEqual(batch["seq"], [0, 1, 2, 3, 4])
        self.assertEqual(batch["ir"], [80000, 80001, 80002, 80003, 80004])
        self.assertEqual(batch["source"], "sensor")
        self.assertEqual(self.events("sensor.reading"), [], "Optical samples are never vital signs")

    def test_usable_report_is_assessed_by_the_python_rules_with_provenance(self):
        reader = self.connect()
        reader.reading_received.emit(reading(spo2=87))
        event, = self.events("sensor.reading")
        self.assertTrue(event["usable"])
        self.assertEqual((event["heart_rate"], event["spo2"]), (72, 87))
        self.assertEqual(event["assessment"]["level"], "urgent")
        self.assertEqual(event["checkin"]["input_source"], "sensor")
        self.assertEqual(event["checkin"]["sensor_port"], "COM7")
        self.assertEqual(event["firmware_version"], "astro-life-ppg-2")
        self.assertEqual(event["sample_rate_hz"], 25.0)
        self.assertIn(event["reading_state"], {"collecting", "steady", "changing", "settling"})

    def test_invalid_report_stays_unavailable(self):
        reader = self.connect()
        reader.reading_received.emit(reading(heart_rate=None, spo2=None))
        event, = self.events("sensor.reading")
        self.assertFalse(event["usable"])
        self.assertNotIn("heart_rate", event)
        self.assertNotIn("assessment_id", event)

    def test_contact_loss_withdraws_the_current_estimate_immediately(self):
        reader = self.connect()
        reader.reading_received.emit(reading())
        assessment_id = self.events("sensor.reading")[0]["assessment_id"]
        reader.optical_sample_received.emit(sample(1, infrared=1200))
        lost = self.events("sensor.reading")[-1]
        self.assertFalse(lost["usable"])
        self.assertEqual(lost["reason"], "no_contact")
        with self.assertRaises(ValueError):
            self.service.save_assessment({"assessment_id": assessment_id})

    def test_device_interruption_drops_the_pending_estimate(self):
        reader = self.connect()
        reader.reading_received.emit(reading())
        assessment_id = self.events("sensor.reading")[0]["assessment_id"]
        reader.status_changed.emit("ERROR: Sensor reading timeout!")
        self.assertEqual(self.events("sensor.status")[-1]["message"], "ERROR: Sensor reading timeout!")
        with self.assertRaises(ValueError):
            self.service.save_assessment({"assessment_id": assessment_id})

    def test_disconnect_flushes_stops_and_a_reconnect_starts_a_new_stream(self):
        reader = self.connect()
        first_stream = self.service.ppg.stream_id
        reader.optical_sample_received.emit(sample(0))
        reader.finished.emit()
        self.assertEqual(len(self.events("sensor.ppg.batch")), 1)
        self.assertEqual(self.events("sensor.connection")[-1]["state"], "disconnected")
        self.assertFalse(self.service.ppg_timer.isActive())
        self.assertIsNone(self.service.reader)
        self.connect()
        self.assertEqual(self.service.ppg.stream_id, first_stream + 1)

    def test_second_connection_is_refused_while_one_is_active(self):
        self.connect()
        with self.assertRaises(ValueError):
            self.service.connect_sensor({"port": "COM8"})
        with self.assertRaises(ValueError):
            self.service.simulate_sensor({})

    def test_simulated_stream_is_labelled_everywhere(self):
        self.service.simulate_sensor({})
        reader = self.service.reader
        self.assertEqual(self.events("sensor.connection")[-1]["source"], "simulated")
        reader.optical_sample_received.emit(sample(0))
        self.service.ppg.flush()
        reader.reading_received.emit(reading())
        self.assertEqual(self.events("sensor.ppg.batch")[0]["source"], "simulated")
        event = self.events("sensor.reading")[-1]
        self.assertEqual(event["source"], "simulated")
        self.assertEqual(event["checkin"]["input_source"], "simulated")
        self.assertEqual(event["checkin"]["sensor_port"], "simulated")


class SimulatedProtocolTests(unittest.TestCase):
    def test_synthetic_stream_passes_through_the_real_parser(self):
        parser = ReportParser()
        events = [event for sequence in range(SAMPLES_PER_REPORT + 1) for event in parser.feed(synthetic_chunk(sequence))]
        samples = [event for event in events if isinstance(event, OpticalSample)]
        readings = [event for event in events if isinstance(event, SensorReading)]
        self.assertEqual([item.sequence for item in samples], list(range(SAMPLES_PER_REPORT + 1)))
        self.assertTrue(all(contact_state(item) == "ok" for item in samples))
        report, = readings
        self.assertEqual((report.heart_rate, report.spo2), (DEMO_HEART_RATE, DEMO_SPO2))
        self.assertEqual(report.firmware_version, "simulated-ppg-1")
        self.assertFalse([event for event in events if isinstance(event, str)], "No parser warnings expected")


if __name__ == "__main__":
    unittest.main()
