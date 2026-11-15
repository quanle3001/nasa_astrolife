"""NASA OSDR study records: retrieval, validation, verified cache and the curated mapping."""

import io
import json
import os
from pathlib import Path
import sys
from tempfile import TemporaryDirectory
import unittest
import urllib.error

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from astrotip.analysis.nasa_guidance import load_catalog
from astrotip.nasa import osdr


def raw(accession="OSD-104", **changes):
    metadata = {
        "accession": accession, "study title": "  Mouse soleus   muscle study ", "organism": "Mus musculus",
        "material type": "Soleus-both sides", "study factor name": "Spaceflight", "project title": "Rodent Research 1",
        "project identifier": "RR-1", "flight program": "International Space Station (ISS)",
        "mission": {"name": "SpaceX-4", "start date": "9/21/14", "end date": "10/25/14"},
        "study assay technology type": ["RNA Sequencing (RNA-Seq)", "Whole Genome Bisulfite Sequencing"],
        "study assay measurement type": "transcription profiling", "managing nasa center": "Ames Research Center (ARC)",
        "study public release date": 1488240000, "study description": "A study.", "unrelated field": {"ignored": True},
    }
    metadata.update(changes)
    return json.dumps({accession: {"REST_URL": "x", "metadata": metadata}})


class FakeResponse(io.BytesIO):
    def __init__(self, body: bytes, status=200):
        super().__init__(body)
        self.status = status

    def __enter__(self):
        return self

    def __exit__(self, *_):
        return False


class BuildStudyTests(unittest.TestCase):
    def test_keeps_nasa_values_and_records_where_they_came_from(self):
        record = osdr.build_study(raw(), "OSD-104", retrieved_at="2026-11-15T09:00:00+00:00")
        study = record["study"]
        self.assertEqual(study["title"], "Mouse soleus muscle study", "Only whitespace is cleaned")
        self.assertEqual((study["organism"], study["material"], study["factors"]), ("Mus musculus", "Soleus-both sides", ["Spaceflight"]))
        self.assertEqual((study["mission_name"], study["mission_start"], study["mission_end"]), ("SpaceX-4", "9/21/14", "10/25/14"))
        self.assertEqual(study["measurement_types"], ["transcription profiling"], "A single string becomes a one-item list")
        self.assertEqual(study["released"], "2017-02-28")
        self.assertEqual(study["study_url"], "https://osdr.nasa.gov/bio/repo/data/studies/OSD-104")
        self.assertEqual(record["request_url"], "https://visualization.osdr.nasa.gov/biodata/api/v2/dataset/OSD-104/")
        self.assertEqual(record["retrieved_at"], "2026-11-15T09:00:00+00:00")
        self.assertEqual(record["pipeline_version"], osdr.PIPELINE_VERSION)
        self.assertEqual(osdr.verify_record(record), record)

    def test_rejects_records_that_cannot_be_trusted(self):
        for text in ("not json", "{}", json.dumps({"OSD-104": {"metadata": []}}), raw(organism=""), raw(**{"study title": None})):
            with self.subTest(text=text[:30]), self.assertRaises(osdr.OsdrError):
                osdr.build_study(text, "OSD-104")
        with self.assertRaises(osdr.OsdrError, msg="A record for another study is not accepted"):
            osdr.build_study(json.dumps({"OSD-104": json.loads(raw("OSD-48"))["OSD-48"]}), "OSD-104")
        with self.assertRaises(osdr.OsdrError):
            osdr.request_url("OSD-104/../x")

    def test_a_changed_cache_fails_its_checksum(self):
        record = osdr.build_study(raw(), "OSD-104")
        tampered = json.loads(json.dumps(record))
        tampered["study"]["organism"] = "Homo sapiens"
        with self.assertRaises(osdr.OsdrError):
            osdr.verify_record(tampered)
        for broken in ({}, {**record, "schema": 99}, {**record, "request_url": "https://example.com/"}, {**record, "retrieved_at": "yesterday"}):
            with self.subTest(keys=sorted(broken)), self.assertRaises(osdr.OsdrError):
                osdr.verify_record(broken)


class FetchTests(unittest.TestCase):
    def test_asks_nasa_for_exactly_one_study(self):
        seen = {}

        def opener(request, timeout):
            seen.update(url=request.full_url, timeout=timeout, agent=request.get_header("User-agent"))
            return FakeResponse(raw().encode())

        self.assertEqual(json.loads(osdr.fetch("OSD-104", opener))["OSD-104"]["metadata"]["organism"], "Mus musculus")
        self.assertEqual(seen["url"], "https://visualization.osdr.nasa.gov/biodata/api/v2/dataset/OSD-104/")
        self.assertEqual(seen["timeout"], osdr.TIMEOUT_SECONDS)
        self.assertIn("AstroLife", seen["agent"])

    def test_network_and_server_failures_are_explained(self):
        def unreachable(_request, timeout):
            raise urllib.error.URLError("no route")

        failures = {
            "could not be reached": unreachable,
            "HTTP 500": lambda _request, timeout: FakeResponse(b"", status=500),
            "more data than expected": lambda _request, timeout: FakeResponse(b"x" * (osdr.MAX_BYTES + 1)),
            "not UTF-8": lambda _request, timeout: FakeResponse(b"\xff\xfe"),
        }
        for message, opener in failures.items():
            with self.subTest(message=message), self.assertRaisesRegex(osdr.OsdrError, message):
                osdr.fetch("OSD-104", opener)


class StudyListTests(unittest.TestCase):
    def setUp(self):
        self.catalog = load_catalog()
        self.temp = TemporaryDirectory()
        self.dir = Path(self.temp.name)
        self.mapping = self.dir / "studies.json"

    def tearDown(self):
        self.temp.cleanup()

    def write_mapping(self, **changes):
        entry = {"accession": "OSD-104", "condition_ids": ["fitness"], "relevance": "Why it is shown."}
        entry.update(changes)
        self.mapping.write_text(json.dumps({"version": "t", "note": "n", "limitations": "l", "studies": [entry]}))

    def test_bundled_study_is_verified_and_tied_to_a_real_health_topic(self):
        result = osdr.load_studies(self.catalog)
        self.assertEqual(result["unavailable"], [])
        study, = result["studies"]
        self.assertEqual((study["accession"], study["organism"], study["condition_ids"]), ("OSD-104", "Mus musculus", ["fitness"]))
        self.assertIn("soleus", study["title"].lower())
        self.assertTrue(study["provenance"]["request_url"].endswith("/v2/dataset/OSD-104/"))
        self.assertTrue(study["provenance"]["retrieved_at"])
        self.assertIn("not human medical data", result["limitations"])

    def test_refresh_stores_a_record_that_loads_back(self):
        self.write_mapping()
        record = osdr.refresh("OSD-104", self.dir, fetcher=lambda accession: raw(accession))
        result = osdr.load_studies(self.catalog, self.mapping, self.dir)
        self.assertEqual(result["studies"][0]["provenance"]["sha256"], record["sha256"])
        self.assertEqual(result["studies"][0]["relevance"], "Why it is shown.")

    def test_a_study_without_a_verified_cache_is_unavailable_not_invented(self):
        self.write_mapping()
        result = osdr.load_studies(self.catalog, self.mapping, self.dir)
        self.assertEqual(result["studies"], [])
        self.assertEqual(result["unavailable"][0]["accession"], "OSD-104")
        osdr.cache_path("OSD-104", self.dir).write_text("{damaged")
        self.assertEqual(osdr.load_studies(self.catalog, self.mapping, self.dir)["studies"], [])

    def test_the_curated_list_must_name_real_topics_and_say_why(self):
        for changes in ({"condition_ids": ["not_a_topic"]}, {"condition_ids": []}, {"relevance": " "}, {"accession": "GLDS-104"}):
            self.write_mapping(**changes)
            with self.subTest(changes=changes), self.assertRaises(ValueError):
                osdr.load_mapping(self.catalog, self.mapping)


@unittest.skipUnless(os.environ.get("ASTROLIFE_LIVE_TESTS"), "set ASTROLIFE_LIVE_TESTS=1 to call NASA")
class LiveOsdrTests(unittest.TestCase):
    def test_live_record_matches_the_bundled_one(self):
        live = osdr.build_study(osdr.fetch("OSD-104"), "OSD-104")
        self.assertEqual(live["study"], osdr.load_cache("OSD-104")["study"])


if __name__ == "__main__":
    unittest.main()
