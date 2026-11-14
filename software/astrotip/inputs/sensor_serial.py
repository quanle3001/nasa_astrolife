"""Read the existing ESP32 text protocol without modifying or flashing firmware."""

from dataclasses import dataclass
from datetime import datetime, timezone
import math

import serial
from serial.tools import list_ports
from PySide6.QtCore import QThread, Signal


@dataclass(frozen=True)
class SensorReading:
    heart_rate: float | None
    spo2: float | None
    finger_detected: bool
    red: int
    infrared: int
    elapsed_seconds: float
    received_at: str

    @property
    def usable(self):
        return self.finger_detected and (self.heart_rate is not None or self.spo2 is not None)


class ReportParser:
    """Frame complete reports, including fragmented serial reads and validity flags.

    Values from different reports must never be combined. Startup chatter, partial
    reports, -1 sentinels and firmware-invalid estimates do not become vitals.
    """
    def __init__(self):
        self.buffer = b""
        self.fields = None
        self.channel = None
        self.discard_line = False

    def feed(self, data: bytes) -> list[SensorReading | str]:
        events = []
        self.buffer += data
        while b"\n" in self.buffer:
            line, self.buffer = self.buffer.split(b"\n", 1)
            if self.discard_line or len(line) > 1024:
                self.discard_line = False
                self.fields = None
                continue
            event = self._line(line.decode("ascii", errors="replace").strip())
            if event is not None:
                events.append(event)
        if len(self.buffer) > 1024:
            self.buffer = b""
            self.discard_line = True
            self.fields = None
        return events

    def _line(self, line):
        if line.startswith("ERROR:"):
            self.fields = None
            return line
        if line == "ASTROTIP HEALTH MONITOR":
            self.fields = {}
            self.channel = None
            return None
        if line.startswith("Initializing AstroTip"):
            self.fields = None
            return "Device restarting; waiting for a complete sensor report."
        if self.fields is None:
            return None
        fields = self.fields
        if line.startswith("=") and "elapsed" in fields:
            self.fields = None
            required = {"finger", "hr", "spo2", "hr_valid", "spo2_valid", "red", "ir", "elapsed"}
            if not required.issubset(fields):
                return "Incomplete sensor report; waiting for the next reading."
            def valid_value(key, low, high):
                value = fields[key]
                return value if fields["finger"] and fields[key + "_valid"] and value is not None and low <= value <= high else None
            return SensorReading(
                valid_value("hr", 35, 220), valid_value("spo2", 70, 100),
                fields["finger"], fields["red"], fields["ir"], fields["elapsed"],
                datetime.now(timezone.utc).isoformat(),
            )
        try:
            if line.startswith("Finger Detection:"):
                fields["finger"] = line == "Finger Detection: Likely detected"
            elif line.startswith("Heart Rate:") or line.startswith("Blood Oxygen (SpO2):"):
                self.channel = "hr" if line.startswith("Heart Rate:") else "spo2"
                value = line.split(":", 1)[1].strip().replace(" BPM", "").replace("%", "")
                number = None if value == "Unavailable" else float(value)
                if number is not None and not math.isfinite(number):
                    raise ValueError("Nonfinite reading")
                fields[self.channel] = number
            elif line.startswith("Measurement Valid:") and self.channel:
                fields[self.channel + "_valid"] = line == "Measurement Valid: Yes"
            elif line.startswith("Red Light:") or line.startswith("Infrared Light:"):
                key = "red" if line.startswith("Red Light:") else "ir"
                value = int(line.split(":", 1)[1])
                if not 0 <= value <= 262143:
                    raise ValueError("Invalid optical sample")
                fields[key] = value
            elif line.startswith("Elapsed Time:"):
                value = float(line.split(":", 1)[1].replace(" seconds", ""))
                if not math.isfinite(value) or value < 0:
                    raise ValueError("Invalid device time")
                fields["elapsed"] = value
        except ValueError:
            self.fields = None
            return "Malformed sensor report; waiting for the next reading."
        return None


def available_ports():
    return [(port.device, port.description) for port in list_ports.comports()]


class SerialReader(QThread):
    reading_received = Signal(object)
    status_changed = Signal(str)
    connected = Signal()

    def __init__(self, port, parent=None, serial_factory=serial.Serial):
        super().__init__(parent)
        self.port = port
        self.serial_factory = serial_factory

    def run(self):
        connection = None
        try:
            # Set control lines before opening to reduce unnecessary ESP32 resets.
            connection = self.serial_factory(port=None, baudrate=115200, timeout=0.2)
            connection.dtr = False
            connection.rts = False
            connection.port = self.port
            connection.open()
            parser = ReportParser()
            if not self.isInterruptionRequested():
                self.connected.emit()
            while not self.isInterruptionRequested():
                data = connection.read(1024)
                for event in parser.feed(data):
                    if self.isInterruptionRequested():
                        break
                    if isinstance(event, SensorReading):
                        self.reading_received.emit(event)
                    else:
                        self.status_changed.emit(event)
        except (serial.SerialException, OSError, ValueError) as exc:
            self.status_changed.emit(f"Connection unavailable: {exc}. Close other serial monitors and check the cable / COM port.")
        finally:
            if connection is not None:
                connection.close()
