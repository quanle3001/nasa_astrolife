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

    def tearDown(self):
        if self.process.poll() is None:
            self.call("system.shutdown")
            self.process.stdin.close()
            self.process.wait(timeout=3)
        for stream in (self.process.stdout, self.process.stderr):
            stream.close()
        self.temp.cleanup()

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
            "mission": "mars",
            "heart_rate": 72,
            "spo2": 87.5,
            "signal_quality": "poor",
            "sleep_hours": None,
            "symptoms": ["vision_changes"],
            "exercise_completed": False,
            "notes": "Bridge integration check",
        })["result"]
        self.assertEqual(result["assessment"]["level"], "urgent")
        self.assertEqual(result["checkin"]["mission"], "mars")
        saved = self.call("health.save", {"assessment_id": result["assessment_id"]})
        self.assertTrue(saved["result"]["saved"])
        history = self.call("history.list")["result"]["entries"]
        self.assertEqual(len(history), 1)
        self.assertEqual(history[0]["assessment"]["level"], "urgent")

    def test_bridge_rejects_unknown_methods_and_invalid_health_fields(self):
        unknown = self.call("shell.execute", {"command": "anything"})
        self.assertFalse(unknown["ok"])
        invalid = self.call("health.assess", {"mission": "leo", "invented": True})
        self.assertFalse(invalid["ok"])
        self.assertIn("unsupported fields", invalid["error"]["message"])


if __name__ == "__main__":
    unittest.main()
