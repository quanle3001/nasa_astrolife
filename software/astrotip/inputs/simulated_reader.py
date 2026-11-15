"""Clearly labelled synthetic sensor stream for demos without hardware.

The simulator writes the same text protocol as the ESP32 firmware and feeds it
through the real `ReportParser`, so the parser, bridge, batching and chart are
exercised end to end. Everything it produces is tagged `simulated` by the
bridge and is never stored as a real sensor measurement.

The waveform is a plain sinusoid on a constant level. It is not a model of a
human pulse and its heart-rate and SpO2 values are fixed demo constants.
"""

from __future__ import annotations

import math

from PySide6.QtCore import QThread, Signal

from astrotip.inputs.sensor_serial import OpticalSample, ReportParser, SensorReading

SIMULATED_PORT = "simulated"
SAMPLE_INTERVAL_MS = 40          # 25 samples per second, like the firmware FIFO.
SAMPLES_PER_REPORT = 25          # One health report per second.
DEMO_HEART_RATE = 72
DEMO_SPO2 = 98
FIRMWARE_LABEL = "simulated-ppg-1"


def synthetic_sample_line(sequence: int) -> str:
    """One `PPG,<seq>,<ms>,<red>,<ir>` line; the wave matches DEMO_HEART_RATE."""
    seconds = sequence * SAMPLE_INTERVAL_MS / 1000
    phase = 2 * math.pi * (DEMO_HEART_RATE / 60) * seconds
    red = round(70000 - 180 * math.sin(phase))
    infrared = round(90000 - 420 * math.sin(phase))
    return f"PPG,{sequence},{sequence * SAMPLE_INTERVAL_MS},{red},{infrared}"


def synthetic_report(sequence: int) -> str:
    """A complete health report in the firmware's text format."""
    seconds = sequence * SAMPLE_INTERVAL_MS / 1000
    return "\n".join((
        "======================================",
        "       ASTRO LIFE HEALTH MONITOR",
        "======================================",
        "Sensor Status: Connected",
        f"Firmware: {FIRMWARE_LABEL}",
        "Signal Status: ready",
        "Sample Rate: 25.0 Hz",
        "Finger Detection: Likely detected",
        "--- HEALTH MEASUREMENTS ---",
        f"Heart Rate: {DEMO_HEART_RATE} BPM",
        "Measurement Valid: Yes",
        f"Blood Oxygen (SpO2): {DEMO_SPO2}%",
        "Measurement Valid: Yes",
        "--- RAW SENSOR DATA ---",
        "Red Light: 70000",
        "Infrared Light: 90000",
        f"Elapsed Time: {seconds:.1f} seconds",
        "======================================",
    ))


def synthetic_chunk(sequence: int) -> bytes:
    """Protocol bytes for one sample, plus a report once per second."""
    lines = [synthetic_sample_line(sequence)]
    if sequence and sequence % SAMPLES_PER_REPORT == 0:
        lines.append(synthetic_report(sequence))
    return ("\r\n".join(lines) + "\r\n").encode("ascii")


class SimulatedReader(QThread):
    """Drop-in replacement for `SerialReader` with the same signals."""

    reading_received = Signal(object)
    optical_sample_received = Signal(object)
    status_changed = Signal(str)
    connected = Signal()

    def __init__(self, port=SIMULATED_PORT, parent=None):
        super().__init__(parent)
        self.port = port

    def run(self):
        parser = ReportParser()
        sequence = 0
        self.connected.emit()
        while not self.isInterruptionRequested():
            for event in parser.feed(synthetic_chunk(sequence)):
                if isinstance(event, SensorReading):
                    self.reading_received.emit(event)
                elif isinstance(event, OpticalSample):
                    self.optical_sample_received.emit(event)
                else:
                    self.status_changed.emit(event)
            sequence += 1
            self.msleep(SAMPLE_INTERVAL_MS)
