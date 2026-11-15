"""Read ESP32 health reports and optional paired red/infrared sample packets."""

from dataclasses import dataclass
from datetime import datetime, timezone
import math

import serial
from serial.tools import list_ports
from PySide6.QtCore import QThread, Signal


@dataclass(frozen=True)
class OpticalSample:
    sequence: int
    elapsed_seconds: float
    red: int
    infrared: int


@dataclass(frozen=True)
class SensorReading:
    heart_rate: float | None
    spo2: float | None
    finger_detected: bool
    red: int
    infrared: int
    elapsed_seconds: float
    received_at: str
    signal_status: str | None = None
    sample_rate_hz: float | None = None
    firmware_version: str = ""

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

    def feed(self, data: bytes) -> list[SensorReading | OpticalSample | str]:
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
        if line.startswith("PPG,"):
            # PPG,<sequence>,<device milliseconds>,<red counts>,<IR counts>.
            # Optical samples are never interpreted as valid vital signs.
            try:
                parts = line.split(",")
                if len(parts) != 5 or not all(part.isascii() and part.isdecimal() for part in parts[1:]):
                    raise ValueError("Invalid sample packet")
                sequence, elapsed_ms, red, infrared = map(int, parts[1:])
                if not (0 <= sequence <= 0xFFFFFFFF and 0 <= elapsed_ms <= 0xFFFFFFFF
                        and 0 <= red <= 262143 and 0 <= infrared <= 262143):
                    raise ValueError("Sample out of range")
                return OpticalSample(sequence, elapsed_ms / 1000, red, infrared)
            except ValueError:
                self.fields = None
                return "Malformed optical sample; waiting for fresh sensor data."
        if line.startswith("ERROR:"):
            self.fields = None
            return line
        if line in {"ASTROTIP HEALTH MONITOR", "ASTRO LIFE HEALTH MONITOR"}:
            self.fields = {}
            self.channel = None
            return None
        if line.startswith(("Initializing AstroTip", "Initializing Astro Life")):
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
            if fields.get("signal_status") == "ready" and fields.get("sample_rate_hz") is not None:
                if not 20 <= fields["sample_rate_hz"] <= 30:
                    fields["signal_status"] = "timing"
            def valid_value(key, low, high):
                value = fields[key]
                window_ok = fields.get("signal_status") in {None, "ready"}
                return value if window_ok and fields["finger"] and fields[key + "_valid"] and value is not None and low <= value <= high else None
            return SensorReading(
                valid_value("hr", 35, 220), valid_value("spo2", 70, 100),
                fields["finger"], fields["red"], fields["ir"], fields["elapsed"],
                datetime.now(timezone.utc).isoformat(),
                fields.get("signal_status"), fields.get("sample_rate_hz"), fields.get("firmware_version", ""),
            )
        try:
            if line.startswith("Finger Detection:"):
                fields["finger"] = line == "Finger Detection: Likely detected"
            elif line.startswith("Signal Status:"):
                value = line.split(":", 1)[1].strip()
                if value not in {"ready", "collecting", "no_contact", "clipped", "timing"}:
                    raise ValueError("Unknown signal status")
                fields["signal_status"] = value
            elif line.startswith("Sample Rate:"):
                value = float(line.split(":", 1)[1].replace(" Hz", ""))
                if not math.isfinite(value) or not 0 <= value <= 3200:
                    raise ValueError("Invalid sample rate")
                fields["sample_rate_hz"] = value
            elif line.startswith("Firmware:"):
                fields["firmware_version"] = line.split(":", 1)[1].strip()[:64]
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
    optical_sample_received = Signal(object)
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
                # Deliver available samples promptly instead of waiting for a
                # full 1 KiB read or its timeout before updating the waveform.
                data = connection.read(min(connection.in_waiting or 1, 1024))
                for event in parser.feed(data):
                    if self.isInterruptionRequested():
                        break
                    if isinstance(event, SensorReading):
                        self.reading_received.emit(event)
                    elif isinstance(event, OpticalSample):
                        self.optical_sample_received.emit(event)
                    else:
                        self.status_changed.emit(event)
        except (serial.SerialException, OSError, ValueError) as exc:
            self.status_changed.emit(f"Connection unavailable: {exc}. Close other serial monitors and check the cable / COM port.")
        finally:
            if connection is not None:
                connection.close()
