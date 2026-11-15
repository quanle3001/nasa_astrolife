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

from PySide6.QtCore import QCoreApplication, QObject, QTimer, Signal, Slot

from astrotip.analysis.assessment_plan import build_plan, build_trace, load_indicators
from astrotip.analysis.history_trends import summarize_history
from astrotip.analysis.hrr_evidence import load_hrr_evidence
from astrotip.analysis.mission_context import load_mission_context, validate_profile
from astrotip.analysis.nasa_guidance import load_catalog
from astrotip.analysis.optical_quality import OpticalSignalQuality
from astrotip.analysis.reading_stability import ReadingStability
from astrotip.analysis.rules import assess
from astrotip.bridge.ppg_batcher import PpgBatcher, contact_state
from astrotip.inputs.sensor_serial import SerialReader, available_ports
from astrotip.inputs.simulated_reader import SIMULATED_PORT, SimulatedReader
from astrotip.models.health_indicator import CheckIn, SYMPTOMS
from astrotip.nasa.osdr import load_studies as load_osdr_studies
from astrotip.nasa.radlab import BUNDLED_CACHE, RadLabService, fetch as fetch_radlab
from astrotip.questionnaire.registry import applicable_answers, load_registry, validate_answer
from astrotip.questionnaire.session import checkin_from_answers
from astrotip.storage.app_state import AppStateStore
from astrotip.storage.database import HistoryStore


MAX_LINE_BYTES = 1_000_000
PROTOCOL_VERSION = 2
# Accepted reasons for submitting a check-in without a pulse / oxygen measurement.
NO_MEASUREMENT_REASONS = {
    "sensor_unavailable": "the sensor was not available or not working",
    "no_stable_reading": "a stable reading could not be obtained",
}
# Raw optical samples are flushed to the renderer at this interval.
PPG_FLUSH_MS = 80
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
    def __init__(self, app: QCoreApplication, reader_factory=SerialReader, simulated_factory=SimulatedReader,
                 radlab_fetcher=fetch_radlab):
        super().__init__()
        self.app = app
        self.reader_factory = reader_factory
        self.simulated_factory = simulated_factory
        self.source = "sensor"
        # The teammate's monitor checks, used here exactly as in the PySide6 page.
        self.optical_quality = OpticalSignalQuality()
        self.stability = ReadingStability()
        self.ppg = PpgBatcher(lambda payload: self.emit_event("sensor.ppg.batch", payload))
        self.ppg_timer = QTimer(self)
        self.ppg_timer.setInterval(PPG_FLUSH_MS)
        self.ppg_timer.timeout.connect(self.ppg.flush)
        self.catalog = load_catalog()
        history_path = os.getenv("ASTROTIP_HISTORY_PATH")
        self.history = HistoryStore(Path(history_path)) if history_path else HistoryStore()
        self.mission_context = load_mission_context(self.catalog)
        self.registry = load_registry(self.catalog)
        self.hrr_evidence = load_hrr_evidence(self.catalog)
        self.indicators = load_indicators(self.catalog, self.registry)
        self.osdr_studies = load_osdr_studies(self.catalog)
        self.state = AppStateStore(self.history.path)
        # A dataset retrieved on this computer is kept next to the health history.
        self.radlab = RadLabService(self.history.path.parent / "nasa_cache" / BUNDLED_CACHE.name, fetcher=radlab_fetcher)
        self._radlab_refresh: Thread | None = None
        self.latest_sensor_checkin: CheckIn | None = None
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
            "sensor.simulate": self.simulate_sensor,
            "sensor.disconnect": self.disconnect_sensor,
            "health.assess": self.create_assessment,
            "health.save": self.save_assessment,
            "history.list": self.list_history,
            "history.trends": self.history_trends,
            "knowledge.get": self.get_knowledge,
            "mission.get": self.get_mission,
            "mission.save": self.save_mission,
            "mission.plan": self.plan_mission,
            "session.current": self.current_session,
            "session.start": self.start_session,
            "session.save": self.save_session,
            "session.preview": self.preview_session,
            "session.submit": self.submit_session,
            "actions.list": self.list_actions,
            "actions.update": self.update_action,
            "nasa.radlab.get": self.get_radlab,
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
        return {"service": "astrotip-python", "protocol": PROTOCOL_VERSION, "offline": True}

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
        self._start_reader(self.reader_factory(port, self), port, "sensor")
        return {"state": "connecting", "port": port, "baudrate": 115200, "source": "sensor"}

    def simulate_sensor(self, _params):
        """Start the clearly labelled synthetic stream (demo without hardware)."""
        if self.reader is not None:
            raise ValueError("A sensor connection is already active.")
        self._start_reader(self.simulated_factory(SIMULATED_PORT, self), SIMULATED_PORT, "simulated")
        return {"state": "connecting", "port": SIMULATED_PORT, "source": "simulated"}

    def _start_reader(self, worker, port, source):
        self.active_port = port
        self.source = source
        self.reader = worker
        self.optical_quality.reset()
        self.stability.reset()
        self.ppg.start_stream(source)
        worker.connected.connect(lambda: self.emit_event(
            "sensor.connection", {"state": "connected", "port": port, "source": source}))
        worker.status_changed.connect(self._sensor_status)
        worker.reading_received.connect(self._sensor_reading)
        worker.optical_sample_received.connect(self._optical_sample)
        worker.finished.connect(lambda: self._sensor_finished(worker))
        self.ppg_timer.start()
        worker.start()

    def _drop_sensor_assessment(self):
        """A stale sensor estimate must not stay reviewable or saveable."""
        self.latest_sensor_checkin = None
        if self.sensor_pending_id:
            self.pending.pop(self.sensor_pending_id, None)
            self.sensor_pending_id = None

    @Slot(str)
    def _sensor_status(self, message):
        # Same reaction as the PySide6 monitor: an interruption restarts the checks.
        self.optical_quality.reset(keep_stream=True)
        self.stability.reset()
        self._drop_sensor_assessment()
        self.emit_event("sensor.status", {"message": message})

    @Slot(object)
    def _optical_sample(self, sample):
        """Forward one raw sample; optical samples never become vital signs."""
        self.optical_quality.add_sample(sample)
        self.ppg.add(sample)
        contact = contact_state(sample)
        if contact != "ok" and self.sensor_pending_id:
            # Contact was lost between reports: withdraw the current estimate now
            # instead of waiting up to a second for the next report.
            self.stability.reset()
            self._drop_sensor_assessment()
            self.emit_event("sensor.reading", {
                "usable": False, "finger_detected": contact == "clipped", "reason": contact,
                "source": self.source, "received_at": "",
            })

    def disconnect_sensor(self, _params):
        if self.reader is None:
            return {"state": "disconnected"}
        self.reader.requestInterruption()
        return {"state": "disconnecting"}

    @Slot(object)
    def _sensor_reading(self, reading):
        optical_state = self.optical_quality.evaluate(reading.elapsed_seconds)
        details = {
            "finger_detected": reading.finger_detected,
            "received_at": reading.received_at,
            "source": self.source,
            "signal_status": reading.signal_status,
            "sample_rate_hz": reading.sample_rate_hz,
            "firmware_version": reading.firmware_version,
            "optical_state": optical_state,
        }
        if not reading.usable:
            self.stability.reset()
            self._drop_sensor_assessment()
            self.emit_event("sensor.reading", {"usable": False, "reading_state": "waiting", **details})
            return
        reading_state = self.stability.update(reading, signal_ready=optical_state in {"ready", "unavailable"})
        checkin = CheckIn(
            heart_rate=reading.heart_rate,
            spo2=reading.spo2,
            # Firmware validity is not a clinically validated signal-quality score.
            signal_quality="poor" if reading_state in {"changing", "settling"} else "unknown",
            input_source=self.source,
            sensor_port=self.active_port,
            sensor_received_at=reading.received_at,
        )
        payload = self._assess(checkin)
        self._drop_sensor_assessment()
        self.sensor_pending_id = payload["assessment_id"]
        self.latest_sensor_checkin = checkin
        self.emit_event("sensor.reading", {
            "usable": True,
            "heart_rate": reading.heart_rate,
            "spo2": reading.spo2,
            "reading_state": reading_state,
            **details,
            **payload,
        })

    def _sensor_finished(self, worker):
        if self.reader is worker:
            self.ppg_timer.stop()
            self.ppg.flush()
            self.reader = None
            self.active_port = ""
            self.optical_quality.reset()
            self.stability.reset()
            self._drop_sensor_assessment()
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

    def history_trends(self, _params):
        """Descriptive summary of the saved measurements (pandas); simulated entries excluded."""
        return summarize_history(self.history.list_entries())

    # --- Guided flow: knowledge, mission, sessions, actions ----------------
    def get_knowledge(self, _params):
        """Everything the guided flow shows that comes from curated data files."""
        return {"catalog": self.catalog, "mission_context": self.mission_context, "registry": self.registry,
                "hrr_evidence": self.hrr_evidence, "indicators": self.indicators, "osdr_studies": self.osdr_studies}

    def get_mission(self, _params):
        return {"profile": self.state.get_mission()}

    def save_mission(self, params):
        return {"profile": self.state.save_mission(validate_profile(params.get("profile"), self.mission_context))}

    def plan_mission(self, params):
        """NASA-informed check-in plan for a mission profile (the saved one by default)."""
        profile = params.get("profile") or self.state.get_mission()
        if profile is None:
            raise ValueError("Choose a mission to see its assessment plan.")
        return build_plan(self.catalog, self.mission_context, self.registry, self.indicators, self.hrr_evidence,
                          validate_profile(profile, self.mission_context))

    def current_session(self, _params):
        """State needed at launch: resume point, last result and open actions."""
        return {
            "mission": self.state.get_mission(),
            "open": self.state.open_session(),
            "latest": self.state.latest_submitted(),
            "actions": self.state.list_actions(),
        }

    def start_session(self, _params):
        mission = self.state.get_mission()
        if mission is None:
            raise ValueError("Choose and save a mission before starting a check-in.")
        return self.state.start_session(mission, self.registry["version"])

    def _open_session(self, params):
        session = self.state.get_session(str(params.get("session_id", "")))
        if session is None or session["status"] != "in_progress":
            raise ValueError("This check-in session is no longer open.")
        return session

    def _clean_answers(self, session, answers):
        """Validate answer values and drop answers to questions that no longer apply."""
        if not isinstance(answers, dict):
            raise ValueError("Answers must be an object.")
        questions = {question["id"]: question for question in self.registry["questions"]}
        if not set(answers) <= set(questions):
            raise ValueError("The answers refer to an unknown question.")
        for question_id, value in answers.items():
            validate_answer(questions[question_id], value)
        return applicable_answers(self.registry, session["mission"], answers)

    def _hazard_order(self, session):
        return self.mission_context["missions"][session["mission"]["environment"]]["hazard_order"]

    def save_session(self, params):
        session = self._open_session(params)
        answers = self._clean_answers(session, params.get("answers", {}))
        return self.state.save_progress(session["session_id"], answers, str(params.get("position", ""))[:120])

    def preview_session(self, params):
        """Assess the answers so far without saving a result.

        Used by the safety screen: an urgent answer must show the existing
        emergency guidance immediately, before the rest of the check-in.
        """
        session = self._open_session(params)
        answers = self._clean_answers(session, params.get("answers", {}))
        self.state.save_progress(session["session_id"], answers, str(params.get("position", ""))[:120])
        checkin, notes = checkin_from_answers(self.registry, session["mission"], answers,
                                              self._hazard_order(session), require_complete=False)
        assessment = assess(checkin, self.catalog)
        return {"checkin": asdict(checkin), "assessment": asdict(assessment), "session_notes": notes,
                "urgent": assessment.level == "urgent"}

    def _measurement(self, params):
        """Resolve the measurement for a submission; sensor values never come from the renderer."""
        measurement = params.get("measurement") or {"use": "none"}
        use = measurement.get("use")
        if use == "sensor":
            latest = self.latest_sensor_checkin
            if latest is None:
                raise ValueError("No current sensor reading is available. Hold still for a fresh reading, enter values manually, or continue without a measurement.")
            return {"heart_rate": latest.heart_rate, "spo2": latest.spo2, "signal_quality": latest.signal_quality,
                    "input_source": latest.input_source, "sensor_port": latest.sensor_port,
                    "sensor_received_at": latest.sensor_received_at}
        if use == "manual":
            return {"heart_rate": measurement.get("heart_rate"), "spo2": measurement.get("spo2"),
                    "signal_quality": measurement.get("signal_quality", "unknown"), "input_source": "manual"}
        if use == "none":
            # The sensor reading is the expected input; leaving it out needs a stated reason.
            if measurement.get("reason") not in NO_MEASUREMENT_REASONS:
                raise ValueError("Take a sensor reading, or say why no measurement could be taken.")
            return {}
        raise ValueError("Choose a sensor reading, a manual entry, or no measurement.")

    def submit_session(self, params):
        """Assess a finished check-in with the existing rules and store the result."""
        session = self._open_session(params)
        answers = self._clean_answers(session, params.get("answers", session["answers"]))
        # Check the answers first, so a missing required answer is reported before a missing reading.
        checkin_from_answers(self.registry, session["mission"], answers, self._hazard_order(session))
        checkin, notes = checkin_from_answers(self.registry, session["mission"], answers,
                                              self._hazard_order(session), self._measurement(params))
        reason = (params.get("measurement") or {}).get("reason")
        if checkin.heart_rate is None and checkin.spo2 is None and reason in NO_MEASUREMENT_REASONS:
            notes.append(f"Reason given: {NO_MEASUREMENT_REASONS[reason]}.")
        assessment = assess(checkin, self.catalog)
        entry_id = self.history.save(checkin, assessment)
        actions = [
            {"condition_id": finding.condition_id, "level": finding.level, "text": action, "observation": finding.reason}
            for finding in assessment.findings if finding.level != "info" for action in finding.actions
        ]
        trace = build_trace(self.catalog, self.mission_context, self.registry, self.indicators, self.hrr_evidence,
                            session["mission"], answers, checkin, assessment)
        result = {"checkin": json.loads(json.dumps(asdict(checkin), default=_json_default)),
                  "assessment": asdict(assessment), "session_notes": notes, "evidence_trace": trace}
        saved_actions = self.state.complete_session(session["session_id"], answers, entry_id, result, actions)
        # Now that the actions exist, record their identifiers in the trace of the finding that created them.
        for entry in trace:
            entry["traceability"]["action_ids"] = sorted(action["id"] for action in saved_actions if action["condition_id"] == entry["condition_id"])
            entry["traceability"]["history_entry_id"] = entry_id
            entry["traceability"]["session_id"] = session["session_id"]
        self.state.update_result(session["session_id"], result)
        return {"session_id": session["session_id"], "entry_id": entry_id, **result, "actions": saved_actions}

    def get_radlab(self, params):
        """Verified NASA radiation dataset; `refresh` retrieves it from NASA again.

        The download runs on its own thread so a slow network never delays
        sensor events; its result arrives as a `nasa.radlab.updated` event.
        """
        if not params.get("refresh"):
            return self.radlab.cached()
        if self._radlab_refresh is None or not self._radlab_refresh.is_alive():
            self._radlab_refresh = Thread(target=lambda: self.emit_event("nasa.radlab.updated", self.radlab.refresh()), daemon=True)
            self._radlab_refresh.start()
        return {"refreshing": True}

    def list_actions(self, _params):
        return {"actions": self.state.list_actions()}

    def update_action(self, params):
        action_id = params.get("id")
        if isinstance(action_id, bool) or not isinstance(action_id, int):
            raise ValueError("Choose a follow-up action.")
        return {"action": self.state.set_action_status(action_id, str(params.get("status", "")))}

    def shutdown(self, _params):
        self.ppg_timer.stop()
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
