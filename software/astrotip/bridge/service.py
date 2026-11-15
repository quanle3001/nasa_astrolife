"""Private JSON-lines bridge to AstroLife's existing Python backend.

The process accepts a small allowlist of structured methods over stdin and
writes responses/events to stdout. It does not open a network port and never
executes caller-supplied commands.
"""

from __future__ import annotations

from dataclasses import asdict
import json
import os
from pathlib import Path
import sys
from threading import Lock, Thread
from uuid import uuid4

from PySide6.QtCore import QCoreApplication, QObject, Signal, Slot

from astrotip.analysis.nasa_guidance import load_catalog
from astrotip.analysis.rules import assess
from astrotip.inputs.sensor_serial import SerialReader, available_ports
from astrotip.models.health_indicator import CheckIn, SYMPTOMS
from astrotip.storage.database import HistoryStore


MAX_LINE_BYTES = 1_000_000
# Mission labels are presentation context for the desktop shell. They are not
# part of a CheckIn and never influence the assessment rules.
MISSION_LABELS = {"leo": "Low Earth orbit", "lunar": "Lunar mission", "mars": "Mars / deep space"}


def _json_default(value):
    if isinstance(value, (set, frozenset, tuple)):
        return list(value)
    raise TypeError(f"Unsupported bridge value: {type(value).__name__}")


class InputRelay(QObject):
    request_received = Signal(object)
    input_closed = Signal()


class BridgeService(QObject):
    def __init__(self, app: QCoreApplication):
        super().__init__()
        self.app = app
        self.catalog = load_catalog()
        history_path = os.getenv("ASTROTIP_HISTORY_PATH")
        self.history = HistoryStore(Path(history_path)) if history_path else HistoryStore()
        self.reader = None
        self.active_port = ""
        self.pending: dict[str, tuple[CheckIn, object]] = {}
        self.sensor_pending_id = None
        self._output_lock = Lock()
        self.handlers = {
            "system.ping": self.ping,
            "system.config": self.config,
            "ports.list": self.list_ports,
            "sensor.connect": self.connect_sensor,
            "sensor.disconnect": self.disconnect_sensor,
            "health.assess": self.create_assessment,
            "health.save": self.save_assessment,
            "history.list": self.list_history,
            "system.shutdown": self.shutdown,
        }

    def emit_message(self, message):
        encoded = json.dumps(message, default=_json_default, allow_nan=False, separators=(",", ":"))
        with self._output_lock:
            sys.stdout.write(encoded + "\n")
            sys.stdout.flush()

    def emit_event(self, name, payload):
        self.emit_message({"event": name, "payload": payload})

    @Slot(object)
    def handle_request(self, request):
        request_id = request.get("id") if isinstance(request, dict) else None
        try:
            if not isinstance(request, dict):
                raise ValueError("Request must be a JSON object.")
            method = request.get("method")
            if method not in self.handlers:
                raise ValueError("Unsupported bridge method.")
            params = request.get("params", {})
            if not isinstance(params, dict):
                raise ValueError("Request parameters must be an object.")
            result = self.handlers[method](params)
            self.emit_message({"id": request_id, "ok": True, "result": result})
        except (ValueError, TypeError, KeyError, OSError) as exc:
            self.emit_message({
                "id": request_id,
                "ok": False,
                "error": {"type": type(exc).__name__, "message": str(exc)},
            })
        except Exception as exc:  # Keep backend internals out of the renderer.
            print(f"Bridge internal error: {type(exc).__name__}: {exc}", file=sys.stderr, flush=True)
            self.emit_message({
                "id": request_id,
                "ok": False,
                "error": {"type": "BackendError", "message": "The local AstroLife backend could not complete the request."},
            })

    def ping(self, _params):
        return {"service": "astrotip-python", "protocol": 1, "offline": True}

    def config(self, _params):
        return {
            "missions": MISSION_LABELS,
            "symptoms": SYMPTOMS,
            "condition_titles": {item["id"]: item["title"] for item in self.catalog["conditions"]},
            "history_path": str(self.history.path),
            "disclaimer": (
                "Educational prototype · Not a diagnosis or flight-certified medical device. "
                "Follow mission medical procedures and contact the medical team for concerning symptoms."
            ),
        }

    def list_ports(self, _params):
        return [{"device": device, "description": description} for device, description in available_ports()]

    def connect_sensor(self, params):
        if self.reader is not None:
            raise ValueError("A sensor connection is already active.")
        port = str(params.get("port", "")).strip()
        if not port or len(port) > 512 or "\x00" in port:
            raise ValueError("Select a valid ESP32 serial port.")
        self.active_port = port
        worker = SerialReader(port, self)
        self.reader = worker
        worker.connected.connect(lambda: self.emit_event("sensor.connection", {"state": "connected", "port": port}))
        worker.status_changed.connect(lambda message: self.emit_event("sensor.status", {"message": message}))
        worker.reading_received.connect(self._sensor_reading)
        worker.finished.connect(lambda: self._sensor_finished(worker))
        worker.start()
        return {"state": "connecting", "port": port, "baudrate": 115200}

    def disconnect_sensor(self, _params):
        if self.reader is None:
            return {"state": "disconnected"}
        self.reader.requestInterruption()
        return {"state": "disconnecting"}

    @Slot(object)
    def _sensor_reading(self, reading):
        if not reading.usable:
            self.emit_event("sensor.reading", {
                "usable": False,
                "finger_detected": reading.finger_detected,
                "received_at": reading.received_at,
            })
            return
        checkin = CheckIn(
            heart_rate=reading.heart_rate,
            spo2=reading.spo2,
            signal_quality="unknown",
            input_source="sensor",
            sensor_port=self.active_port,
            sensor_received_at=reading.received_at,
        )
        payload = self._assess(checkin)
        if self.sensor_pending_id:
            self.pending.pop(self.sensor_pending_id, None)
        self.sensor_pending_id = payload["assessment_id"]
        self.emit_event("sensor.reading", {
            "usable": True,
            "heart_rate": reading.heart_rate,
            "spo2": reading.spo2,
            "finger_detected": reading.finger_detected,
            "received_at": reading.received_at,
            **payload,
        })

    def _sensor_finished(self, worker):
        if self.reader is worker:
            self.reader = None
            self.active_port = ""
            worker.deleteLater()
            self.emit_event("sensor.connection", {"state": "disconnected"})

    def _checkin_from_params(self, params):
        allowed = {field.name for field in CheckIn.__dataclass_fields__.values()}
        unknown = set(params) - allowed
        if unknown:
            raise ValueError("The check-in contains unsupported fields.")
        return CheckIn(**params)

    def _assess(self, checkin):
        assessment = assess(checkin, self.catalog)
        assessment_id = uuid4().hex
        self.pending[assessment_id] = (checkin, assessment)
        return {
            "assessment_id": assessment_id,
            "checkin": asdict(checkin),
            "assessment": asdict(assessment),
        }

    def create_assessment(self, params):
        return self._assess(self._checkin_from_params(params))

    def save_assessment(self, params):
        assessment_id = str(params.get("assessment_id", ""))
        saved = self.pending.pop(assessment_id, None)
        if saved is None:
            raise ValueError("This assessment is unavailable or has already been saved.")
        checkin, assessment = saved
        entry_id = self.history.save(checkin, assessment)
        return {"saved": True, "entry_id": entry_id}

    def list_history(self, _params):
        return {"entries": self.history.list_entries()}

    def shutdown(self, _params):
        if self.reader is not None:
            self.reader.requestInterruption()
            self.reader.wait(1500)
        return {"shutting_down": True}

    @Slot()
    def input_closed(self):
        if self.reader is not None:
            self.reader.requestInterruption()
            self.reader.wait(1500)
        QCoreApplication.instance().quit()


def _read_stdin(relay: InputRelay):
    for raw_line in sys.stdin.buffer:
        if len(raw_line) > MAX_LINE_BYTES:
            relay.request_received.emit({"id": None, "method": "invalid", "params": {}})
            continue
        try:
            relay.request_received.emit(json.loads(raw_line))
        except (UnicodeDecodeError, json.JSONDecodeError):
            relay.request_received.emit({"id": None, "method": "invalid", "params": {}})
    relay.input_closed.emit()


def main():
    app = QCoreApplication(sys.argv)
    service = BridgeService(app)
    relay = InputRelay()
    relay.request_received.connect(service.handle_request)
    relay.input_closed.connect(service.input_closed)
    thread = Thread(target=_read_stdin, args=(relay,))
    thread.start()
    service.emit_event("backend.ready", service.ping({}))
    return app.exec()


if __name__ == "__main__":
    raise SystemExit(main())
