"""NASA RadLab retrieval, validation, verified cache and offline behaviour."""

import copy
import json
import os
from pathlib import Path
import sys
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch

os.environ.setdefault("QT_QPA_PLATFORM", "offscreen")
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from astrotip.nasa import radlab
from astrotip.nasa.radlab import RadLabError, RadLabService

HEADER = "timestamp,instrument_id,absorbed_dose_rate\n"
GOOD = HEADER + '"2023-01-01T00:01:18","DosTel1",2.651365\n"2023-01-01T00:04:31","MSL-RAD-Surface",6.37246\n"2023-01-01T00:02:58","DosTel1",3.700151\n'


def failing_fetch():
    raise RadLabError("NASA RadLab could not be reached: offline")


class FakeResponse:
    def __init__(self, body, status=200):
        self.body, self.status = body, status
    def read(self, _limit):
        return self.body
    def __enter__(self):
        return self
    def __exit__(self, *_args):
        return False


class RequestTests(unittest.TestCase):
    def test_request_is_bounded_to_one_day_of_one_measurement(self):
        url = radlab.request_url()
        self.assertTrue(url.startswith("https://visualization.osdr.nasa.gov/radlab/api/?query="))
        self.assertIn("timestamp%3E%3D2023-01-01%20AND%20timestamp%3C2023-01-02", url)
        self.assertTrue(url.endswith("&columns+=absorbed_dose_rate"), "The API needs the literal 'columns+=' parameter")

    def test_fetch_reports_http_and_network_failures_without_inventing_data(self):
        self.assertEqual(radlab.fetch(opener=lambda *_a, **_k: FakeResponse(GOOD.encode())), GOOD)
        with self.assertRaises(RadLabError):
            radlab.fetch(opener=lambda *_a, **_k: FakeResponse(b"error", status=500))
        def unreachable(*_a, **_k):
            raise OSError("network down")
        with self.assertRaisesRegex(RadLabError, "could not be reached"):
            radlab.fetch(opener=unreachable)
        with self.assertRaisesRegex(RadLabError, "more data"):
            radlab.fetch(opener=lambda *_a, **_k: FakeResponse(b"x" * (radlab.MAX_BYTES + 1)))


class ParseTests(unittest.TestCase):
    def test_original_timestamps_instruments_and_values_are_preserved(self):
        instruments = radlab.parse(GOOD)
        self.assertEqual(list(instruments), ["DosTel1", "MSL-RAD-Surface"])
        self.assertEqual(instruments["DosTel1"], {"timestamps": ["2023-01-01T00:01:18", "2023-01-01T00:02:58"], "values": [2.651365, 3.700151]})

    def test_any_untrustworthy_row_rejects_the_whole_response(self):
        bad = {
            "wrong columns": "timestamp,instrument_id,dose\n",
            "error page": "<h3>500: Something Went Wrong</h3>",
            "empty": "",
            "no rows": HEADER,
            "not a number": HEADER + '"2023-01-01T00:01:18","DosTel1",abc\n',
            "nan": HEADER + '"2023-01-01T00:01:18","DosTel1",nan\n',
            "negative": HEADER + '"2023-01-01T00:01:18","DosTel1",-1\n',
            "bad time": HEADER + '"yesterday","DosTel1",1\n',
            "outside window": HEADER + '"2023-01-02T00:00:00","DosTel1",1\n',
            "no instrument": HEADER + '"2023-01-01T00:01:18","",1\n',
            "extra column": HEADER + '"2023-01-01T00:01:18","DosTel1",1,2\n',
            "out of order": HEADER + '"2023-01-01T02:00:00","DosTel1",1\n"2023-01-01T01:00:00","DosTel1",1\n',
        }
        for name, text in bad.items():
            with self.subTest(case=name), self.assertRaises(RadLabError):
                radlab.parse(text)

    def test_cleaning_removes_only_exact_duplicates_and_changes_no_value(self):
        text = HEADER + '"2023-01-01T00:01:18","DosTel1",2.5\n' * 3 + '"2023-01-01T00:02:58","DosTel1",2.5\n"2023-01-01T00:04:00","DosTel1",0\n'
        instruments, steps = radlab.clean(radlab.read_rows(text))
        self.assertEqual(instruments["DosTel1"], {"timestamps": ["2023-01-01T00:01:18", "2023-01-01T00:02:58", "2023-01-01T00:04:00"], "values": [2.5, 2.5, 0.0]})
        self.assertIn("Removed 2 exact duplicate row(s).", steps)
        self.assertIn("Validated 5 rows", steps[0])

    def test_rows_are_validated_by_the_reading_model(self):
        from astrotip.nasa.models import RadLabReading
        from pydantic import ValidationError
        reading = RadLabReading(timestamp="2023-01-01T00:01:18", instrument_id="DosTel1", value="2.65")
        self.assertEqual(reading.value, 2.65)
        for bad in ({"timestamp": "soon", "instrument_id": "X", "value": 1}, {"timestamp": "2023-01-01T00:00:00", "instrument_id": "", "value": 1},
                    {"timestamp": "2023-01-01T00:00:00", "instrument_id": "X", "value": float("inf")}, {"timestamp": "2023-01-01T00:00:00", "instrument_id": "X", "value": -0.1},
                    {"timestamp": "2023-01-01T00:00:00", "instrument_id": "X", "value": 1, "unit": "guessed"}):
            with self.subTest(bad=bad), self.assertRaises(ValidationError):
                RadLabReading(**bad)

    def test_dataset_records_provenance_and_does_not_claim_a_unit(self):
        dataset = radlab.build_dataset(GOOD, retrieved_at="2026-11-15T08:00:00+00:00")
        self.assertEqual(dataset["request_url"], radlab.request_url())
        self.assertEqual((dataset["window_start"], dataset["window_end"], dataset["row_count"]), ("2023-01-01", "2023-01-02", 3))
        self.assertEqual(dataset["retrieved_at"], "2026-11-15T08:00:00+00:00")
        self.assertEqual(len(dataset["response_sha256"]), 64)
        self.assertEqual(dataset["pipeline_version"], radlab.PIPELINE_VERSION)
        self.assertEqual(dataset["transformation_steps"][0], "Validated 3 rows from the API response with the RadLabReading model.")
        self.assertIn("nothing was filled in, rounded or dropped as an outlier", dataset["transformation_steps"][-1])
        self.assertIsNone(dataset["unit"])
        self.assertIn("unit is not stated", dataset["unit_note"])
        self.assertIn("Not your radiation exposure", " ".join(dataset["limitations"]))
        summary = radlab.summarize(dataset)
        self.assertEqual(summary["DosTel1"], {"count": 2, "minimum": 2.651365, "maximum": 3.700151, "median": (2.651365 + 3.700151) / 2,
                                              "first_timestamp": "2023-01-01T00:01:18", "last_timestamp": "2023-01-01T00:02:58"})


class CacheTests(unittest.TestCase):
    def setUp(self):
        self.temp = TemporaryDirectory()
        self.path = Path(self.temp.name) / "cache" / "radlab.json"
        self.dataset = radlab.build_dataset(GOOD, retrieved_at="2026-11-15T08:00:00+00:00")

    def tearDown(self):
        self.temp.cleanup()

    def test_cache_round_trip_is_verified(self):
        radlab.write_cache(self.dataset, self.path)
        self.assertEqual(radlab.load_cache(self.path), self.dataset)
        self.assertEqual([p.name for p in self.path.parent.iterdir()], ["radlab.json"], "No temporary file is left behind")

    def test_a_changed_or_damaged_cache_is_refused(self):
        def damaged(change):
            dataset = copy.deepcopy(self.dataset)
            change(dataset)
            self.path.parent.mkdir(parents=True, exist_ok=True)
            self.path.write_text(json.dumps(dataset), encoding="utf-8")
            with self.assertRaises(RadLabError):
                radlab.load_cache(self.path)
        damaged(lambda d: d["instruments"]["DosTel1"]["values"].__setitem__(0, 99.0))
        damaged(lambda d: d["instruments"]["DosTel1"]["timestamps"].pop())
        damaged(lambda d: d.update(row_count=7))
        damaged(lambda d: d.pop("retrieved_at"))
        damaged(lambda d: d.update(schema_version=1))
        damaged(lambda d: d.update(unexpected_field=True))
        damaged(lambda d: d["instruments"]["DosTel1"]["values"].__setitem__(0, -1.0))
        self.path.write_text("{not json", encoding="utf-8")
        with self.assertRaises(RadLabError):
            radlab.load_cache(self.path)
        with self.assertRaises(RadLabError):
            radlab.load_cache(self.path.with_name("missing.json"))

    def test_the_bundled_snapshot_is_real_verified_nasa_data(self):
        dataset = radlab.load_cache(radlab.BUNDLED_CACHE)
        self.assertEqual(dataset["request_url"], radlab.request_url())
        self.assertGreater(dataset["row_count"], 1000)
        self.assertTrue({"DosTel1", "CRaTER-D1D2", "MSL-RAD-Surface"} <= set(dataset["instruments"]))
        notes = radlab.load_instruments()
        for environment, instrument in notes["preferred"].items():
            self.assertIn(instrument, dataset["instruments"], environment)
            self.assertEqual(notes["instruments"][instrument]["environment"], environment)


class ServiceTests(unittest.TestCase):
    def setUp(self):
        self.temp = TemporaryDirectory()
        self.user = Path(self.temp.name) / "nasa_cache" / "radlab.json"
        self.bundled = Path(self.temp.name) / "bundled.json"
        radlab.write_cache(radlab.build_dataset(GOOD, retrieved_at="2026-11-01T00:00:00+00:00"), self.bundled)

    def tearDown(self):
        self.temp.cleanup()

    def test_offline_use_shows_the_bundled_snapshot_with_its_origin(self):
        result = RadLabService(self.user, self.bundled, fetcher=failing_fetch).cached()
        self.assertTrue(result["available"])
        self.assertEqual((result["origin"], result["error"]), ("bundled_snapshot", None))
        self.assertEqual(result["dataset"]["retrieved_at"], "2026-11-01T00:00:00+00:00")
        self.assertIn("DosTel1", result["summary"])

    def test_successful_refresh_is_labelled_live_and_becomes_the_newest_cache(self):
        # The bundled snapshot in this test is dated 2026-11-01; a retrieval made now is newer.
        result = RadLabService(self.user, self.bundled, fetcher=lambda: GOOD).refresh()
        self.assertEqual((result["origin"], result["error"]), ("live", None))
        again = RadLabService(self.user, self.bundled, fetcher=failing_fetch).cached()
        self.assertEqual(again["origin"], "retrieved_on_this_computer")
        self.assertEqual(again["dataset"]["retrieved_at"], result["dataset"]["retrieved_at"])

    def test_failed_refresh_keeps_the_verified_cache_and_says_why(self):
        result = RadLabService(self.user, self.bundled, fetcher=failing_fetch).refresh()
        self.assertTrue(result["available"])
        self.assertEqual(result["origin"], "bundled_snapshot")
        self.assertIn("could not be reached", result["error"])
        invalid = RadLabService(self.user, self.bundled, fetcher=lambda: "<h3>500</h3>").refresh()
        self.assertEqual(invalid["origin"], "bundled_snapshot")
        self.assertIn("unexpected columns", invalid["error"])
        self.assertFalse(self.user.exists(), "A rejected response is never cached")

    def test_no_cache_and_no_network_is_reported_as_unavailable(self):
        self.bundled.unlink()
        result = RadLabService(self.user, self.bundled, fetcher=failing_fetch).refresh()
        self.assertFalse(result["available"])
        self.assertIsNone(result["dataset"])
        self.assertIn("could not be reached", result["error"])
        self.assertFalse(RadLabService(self.user, self.bundled).cached()["available"])

    def test_a_damaged_user_cache_falls_back_to_the_bundled_snapshot(self):
        self.user.parent.mkdir(parents=True)
        self.user.write_text('{"schema_version": 1}', encoding="utf-8")
        self.assertEqual(RadLabService(self.user, self.bundled).cached()["origin"], "bundled_snapshot")


class BridgeRadLabTests(unittest.TestCase):
    def test_bridge_serves_the_cache_and_refreshes_off_the_main_thread(self):
        from PySide6.QtCore import QCoreApplication
        from astrotip.bridge.service import BridgeService
        app = QCoreApplication.instance() or QCoreApplication([])
        with TemporaryDirectory() as folder, patch.dict(os.environ, {"ASTROTIP_HISTORY_PATH": str(Path(folder) / "history.sqlite3")}):
            service = BridgeService(app, radlab_fetcher=lambda: GOOD)
            messages = []
            service.emit_message = messages.append
            cached = service.get_radlab({})
            self.assertEqual(cached["origin"], "bundled_snapshot", "Without a refresh nothing is downloaded")
            self.assertEqual(service.get_radlab({"refresh": True}), {"refreshing": True})
            service._radlab_refresh.join(timeout=5)
            event, = [m for m in messages if m.get("event") == "nasa.radlab.updated"]
            self.assertEqual(event["payload"]["origin"], "live")
            self.assertEqual(event["payload"]["dataset"]["row_count"], 3)
            self.assertTrue((Path(folder) / "nasa_cache").is_dir())
            service.ppg_timer.stop()
            service.deleteLater()

    @unittest.skipUnless(os.environ.get("ASTROLIFE_LIVE_TESTS"), "Set ASTROLIFE_LIVE_TESTS=1 to query NASA RadLab over the network")
    def test_live_retrieval_from_nasa(self):
        dataset = radlab.build_dataset(radlab.fetch())
        self.assertGreater(dataset["row_count"], 1000)


if __name__ == "__main__":
    unittest.main()
