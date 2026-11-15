"""End-to-end checks for the private desktop JSON-lines bridge."""

import json
import os
from pathlib import Path
import subprocess
import sys
from tempfile import TemporaryDirectory
import unittest


SOFTWARE_ROOT = Path(__file__).resolve().parents[1]


class BridgeTests(unittest.TestCase):
    def setUp(self):
        self.temp = TemporaryDirectory()
        self.start_backend()

    def start_backend(self):
        env = os.environ.copy()
        env["ASTROTIP_HISTORY_PATH"] = str(Path(self.temp.name) / "history.sqlite3")
        self.process = subprocess.Popen(
            [sys.executable, "-m", "astrotip.bridge.service"],
            cwd=SOFTWARE_ROOT,
            env=env,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            bufsize=1,
        )
        ready = json.loads(self.process.stdout.readline())
        self.assertEqual(ready["event"], "backend.ready")

    def stop_backend(self):
        if self.process.poll() is None:
            self.call("system.shutdown")
            self.process.stdin.close()
            self.process.wait(timeout=3)
        for stream in (self.process.stdout, self.process.stderr):
            stream.close()

    def tearDown(self):
        self.stop_backend()
        self.temp.cleanup()

    def ok(self, method, params=None):
        response = self.call(method, params)
        self.assertTrue(response["ok"], response)
        return response["result"]

    def call(self, method, params=None, request_id="test"):
        request = {"id": request_id, "method": method, "params": params or {}}
        self.process.stdin.write(json.dumps(request) + "\n")
        self.process.stdin.flush()
        while True:
            response = json.loads(self.process.stdout.readline())
            if response.get("id") == request_id:
                return response

    def test_ping_assessment_save_and_history_use_existing_python_logic(self):
        self.assertTrue(self.call("system.ping")["result"]["offline"])
        result = self.call("health.assess", {
            "heart_rate": 72,
            "spo2": 87.5,
            "signal_quality": "poor",
            "sleep_hours": None,
            "symptoms": ["vision_changes"],
            "exercise_completed": False,
            "notes": "Bridge integration check",
        })["result"]
        self.assertEqual(result["assessment"]["level"], "urgent")
        self.assertNotIn("mission", result["checkin"])
        saved = self.call("health.save", {"assessment_id": result["assessment_id"]})
        self.assertTrue(saved["result"]["saved"])
        history = self.call("history.list")["result"]["entries"]
        self.assertEqual(len(history), 1)
        self.assertEqual(history[0]["assessment"]["level"], "urgent")

    def test_bridge_rejects_unknown_methods_and_invalid_health_fields(self):
        unknown = self.call("shell.execute", {"command": "anything"})
        self.assertFalse(unknown["ok"])
        invalid = self.call("health.assess", {"heart_rate": 70, "invented": True})
        self.assertFalse(invalid["ok"])
        self.assertIn("unsupported fields", invalid["error"]["message"])
        # Mission context is presentation only and is rejected as a health field.
        mission = self.call("health.assess", {"mission": "mars", "heart_rate": 70})
        self.assertFalse(mission["ok"])

    def test_guided_check_in_reaches_the_rules_and_survives_a_restart(self):
        knowledge = self.ok("knowledge.get")
        self.assertEqual(len(knowledge["catalog"]["hazards"]), 5)
        self.assertEqual(set(knowledge["mission_context"]["missions"]), {"leo", "lunar", "mars"})
        safety = {q["id"]: "no" for q in knowledge["registry"]["questions"] if q["domain"] == "safety"}
        self.assertFalse(self.call("session.start")["ok"], "A mission must be chosen first")
        profile = {"environment": "mars", "phase": "transit", "mission_day": 120, "eva_recent": False, "gravity_transition_recent": False}
        self.assertEqual(self.ok("mission.save", {"profile": profile})["profile"], profile)
        self.assertFalse(self.call("mission.save", {"profile": {"environment": "venus"}})["ok"])
        session = self.ok("session.start")
        answers = {**safety, "sleep.quality": "poorly", "sleep.hours": 4.5, "sleep.duration": "several_nights"}
        self.ok("session.save", {"session_id": session["session_id"], "answers": answers, "position": "sleep.fatigue"})

        # Interrupted: the backend restarts and the session is still there.
        self.stop_backend()
        self.start_backend()
        current = self.ok("session.current")
        self.assertEqual(current["mission"], profile)
        self.assertEqual(current["open"]["session_id"], session["session_id"])
        self.assertEqual(current["open"]["answers"], answers)
        self.assertEqual(current["open"]["position"], "sleep.fatigue")

        # A sensor measurement cannot be claimed when no reading exists.
        no_sensor = self.call("session.submit", {"session_id": session["session_id"], "answers": answers, "measurement": {"use": "sensor"}})
        self.assertFalse(no_sensor["ok"])
        self.assertIn("No current sensor reading", no_sensor["error"]["message"])

        result = self.ok("session.submit", {"session_id": session["session_id"], "answers": answers,
                                           "measurement": {"use": "manual", "heart_rate": 72, "spo2": 91, "signal_quality": "good"}})
        self.assertEqual(result["assessment"]["level"], "review")
        self.assertEqual(result["checkin"]["sleep_hours"], 4.5)
        self.assertEqual(result["checkin"]["symptoms"], ["poor_sleep"])
        self.assertNotIn("mission", result["checkin"])
        self.assertTrue(any(action["condition_id"] == "sleep" for action in result["actions"]))
        self.assertIn("not treated as normal", " ".join(result["session_notes"]))
        self.assertFalse(self.call("session.submit", {"session_id": session["session_id"], "answers": answers})["ok"])
        done = self.ok("actions.update", {"id": result["actions"][0]["id"], "status": "done"})["action"]
        self.assertEqual(done["status"], "done")

        # Restart again: result, action state and health history all persist.
        self.stop_backend()
        self.start_backend()
        current = self.ok("session.current")
        self.assertIsNone(current["open"])
        self.assertEqual(current["latest"]["result"]["assessment"]["level"], "review")
        self.assertEqual({a["id"]: a["status"] for a in current["actions"]}[done["id"]], "done")
        history = self.ok("history.list")["entries"]
        self.assertEqual(len(history), 1)
        self.assertEqual(history[0]["id"], result["entry_id"])
        self.assertEqual(history[0]["checkin"]["spo2"], 91)

    def test_urgent_safety_answer_returns_emergency_guidance_without_a_sensor(self):
        self.ok("mission.save", {"profile": {"environment": "lunar", "phase": "surface"}})
        session = self.ok("session.start")
        preview = self.ok("session.preview", {"session_id": session["session_id"], "answers": {"safety.chest_pain": "yes"}})
        self.assertTrue(preview["urgent"])
        self.assertEqual(preview["assessment"]["level"], "urgent")
        urgent = [f for f in preview["assessment"]["findings"] if f["level"] == "urgent"]
        self.assertIn("emergency", urgent[0]["actions"][0].lower())
        self.assertEqual(self.ok("history.list")["entries"], [], "A preview stores no health record")
        calm = self.ok("session.preview", {"session_id": session["session_id"], "answers": {"safety.chest_pain": "no"}})
        self.assertFalse(calm["urgent"])

    def test_session_methods_reject_invalid_answers_and_measurements(self):
        self.ok("mission.save", {"profile": {"environment": "leo", "phase": "orbit"}})
        session = self.ok("session.start")
        sid = session["session_id"]
        for answers in ({"no.such.question": "yes"}, {"safety.chest_pain": "unsure"}, {"sleep.hours": 99}):
            with self.subTest(answers=answers):
                self.assertFalse(self.call("session.save", {"session_id": sid, "answers": answers})["ok"])
        incomplete = self.call("session.submit", {"session_id": sid, "answers": {"sleep.quality": "well"}})
        self.assertFalse(incomplete["ok"])
        self.assertIn("required question", incomplete["error"]["message"])
        safety = {q["id"]: "no" for q in self.ok("knowledge.get")["registry"]["questions"] if q["domain"] == "safety"}
        bad = self.call("session.submit", {"session_id": sid, "answers": safety, "measurement": {"use": "manual", "spo2": 140}})
        self.assertFalse(bad["ok"])
        self.assertFalse(self.call("session.submit", {"session_id": sid, "answers": safety, "measurement": {"use": "guess"}})["ok"])
        none = self.ok("session.submit", {"session_id": sid, "answers": safety, "measurement": {"use": "none"}})
        self.assertIsNone(none["checkin"]["spo2"])
        self.assertIsNone(none["checkin"]["heart_rate"])
        self.assertEqual(none["assessment"]["level"], "info")
        self.assertFalse(self.call("actions.update", {"id": "1", "status": "done"})["ok"])


if __name__ == "__main__":
    unittest.main()
