"""Evidence coverage and broken reference regressions for the offline catalog."""

from copy import deepcopy
from pathlib import Path
import sys
import unittest
from urllib.parse import urlparse

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from astrotip.analysis.nasa_guidance import CONDITION_IDS, load_catalog, validate_catalog


class CatalogTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.catalog = load_catalog()

    def test_complete_health_groups_and_all_five_hazards_are_represented(self):
        self.assertEqual({c["id"] for c in self.catalog["conditions"]}, CONDITION_IDS)
        self.assertEqual(len(self.catalog["conditions"]), 13)
        represented = {h for c in self.catalog["conditions"] for h in c["hazard_ids"]}
        self.assertEqual(represented, {"radiation", "isolation", "distance", "gravity", "environment"})

    def test_user_sources_and_oximetry_references_are_available_offline(self):
        urls = {s["url"].rstrip("/") for s in self.catalog["sources"]}
        for url in (
            "https://www.nasa.gov/hrp/hazards",
            "https://www.nasa.gov/hrp/risks",
            "https://www.nasa.gov/hrp/ongoing-hrp-research",
            "https://medlineplus.gov/lab-tests/pulse-oximetry",
            "https://www.fda.gov/medical-devices/products-and-medical-procedures/pulse-oximeters",
        ):
            self.assertIn(url, urls)

    def test_sources_are_primary_and_all_guidance_has_resolvable_citations(self):
        source_ids = {source["id"] for source in self.catalog["sources"]}
        for source in self.catalog["sources"]:
            host = urlparse(source["url"]).hostname
            self.assertTrue(any(host == domain or host.endswith("." + domain)
                                for domain in ("nasa.gov", "fda.gov", "medlineplus.gov")), host)
        for condition in self.catalog["conditions"]:
            self.assertTrue(condition["monitoring"])
            self.assertTrue(condition["limitations"])
            self.assertTrue(condition["countermeasures"])
            for item in (condition, *condition["countermeasures"], *condition["research"]):
                self.assertTrue(item["source_ids"])
                self.assertLessEqual(set(item["source_ids"]), source_ids)

    def test_broken_citations_duplicate_ids_and_missing_hazards_fail_validation(self):
        broken = deepcopy(self.catalog)
        broken["conditions"][0]["countermeasures"][0]["source_ids"] = ["nonexistent"]
        duplicate = deepcopy(self.catalog)
        duplicate["conditions"][1]["id"] = duplicate["conditions"][0]["id"]
        missing_hazard = deepcopy(self.catalog)
        missing_hazard["hazards"].pop()
        for catalog in (broken, duplicate, missing_hazard):
            with self.assertRaises(ValueError):
                validate_catalog(catalog)


if __name__ == "__main__":
    unittest.main()
