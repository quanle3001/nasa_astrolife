"""NASA hazard and risk knowledge, and NASA API data, doing work in the app.

These tests show that the NASA catalog changes real outputs: the plan of a
check-in, the questions asked, the evidence trace of a finding and the
radiation analysis shown for a mission.
"""

import copy
from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from astrotip.analysis.assessment_plan import build_plan, build_trace, load_indicators
from astrotip.analysis.hrr_evidence import load_hrr_evidence
from astrotip.analysis.mission_context import load_mission_context, validate_profile
from astrotip.analysis.nasa_guidance import load_catalog
from astrotip.analysis.rules import assess
from astrotip.nasa import radlab
from astrotip.nasa.radlab_analysis import analyze, analyze_series, describe, relevant_instruments
from astrotip.questionnaire.registry import load_registry, visible_questions
from astrotip.questionnaire.session import checkin_from_answers


class Base(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.catalog = load_catalog()
        cls.context = load_mission_context(cls.catalog)
        cls.registry = load_registry(cls.catalog)
        cls.hrr = load_hrr_evidence(cls.catalog)
        cls.indicators = load_indicators(cls.catalog, cls.registry)
        cls.safety_no = {q["id"]: "no" for q in cls.registry["questions"] if q["domain"] == "safety"}

    def profile(self, **fields):
        return validate_profile(fields, self.context)

    def plan(self, **fields):
        return build_plan(self.catalog, self.context, self.registry, self.indicators, self.hrr, self.profile(**fields))

    def trace(self, profile, answers, measurement=None):
        order = self.context["missions"][profile["environment"]]["hazard_order"]
        checkin, _notes = checkin_from_answers(self.registry, profile, answers, order, measurement)
        return build_trace(self.catalog, self.context, self.registry, self.indicators, self.hrr, profile, answers, checkin, assess(checkin, self.catalog))


class AssessmentPlanTests(Base):
    def test_plan_is_derived_from_the_nasa_catalog_not_written_by_hand(self):
        plan = self.plan(environment="mars", phase="transit")
        self.assertEqual([h["id"] for h in plan["hazards"]], self.context["missions"]["mars"]["hazard_order"])
        for hazard in plan["hazards"]:
            expected = [c["id"] for c in self.catalog["conditions"] if hazard["id"] in c["hazard_ids"]]
            self.assertEqual(hazard["condition_ids"], expected)
            reports = sorted({r["risk_id"] for cid in expected for r in self.hrr["conditions"][cid]})
            self.assertEqual(hazard["hrr_risk_ids"], reports)
        isolation = next(h for h in plan["hazards"] if h["id"] == "isolation")
        self.assertIn("sleep.quality", isolation["question_ids"])
        self.assertIn("wellbeing.mood", isolation["question_ids"])
        self.assertIn(100, isolation["hrr_risk_ids"], "Sleep loss risk (HRR 100) belongs to the isolation hazard")

    def test_the_plan_matches_the_questions_actually_asked(self):
        for fields in ({}, {"environment": "lunar", "phase": "surface"}, {"environment": "mars", "phase": "transit", "eva_recent": True}):
            profile = self.profile(**fields)
            plan = self.plan(**fields)
            order = self.context["missions"][profile["environment"]]["hazard_order"]
            asked = [q["id"] for q in visible_questions(self.registry, profile, {}, order)]
            self.assertEqual([qid for topic in plan["topics"] for qid in topic["question_ids"]], asked)
            self.assertEqual(plan["question_count"] + plan["safety_question_count"], len(asked))

    def test_changing_the_mission_changes_topic_order_and_reasons(self):
        leo, mars = self.plan(), self.plan(environment="mars", phase="transit")
        self.assertEqual(leo["topics"][0]["domain_id"], "safety")
        self.assertEqual(mars["topics"][0]["domain_id"], "safety")
        self.assertNotEqual([t["domain_id"] for t in leo["topics"]], [t["domain_id"] for t in mars["topics"]])
        self.assertEqual(leo["topics"][1]["domain_id"], "balance")
        self.assertIn('"Gravity fields", presented first for a Low Earth Orbit mission', leo["topics"][1]["reason"])
        sleep = next(t for t in mars["topics"] if t["domain_id"] == "sleep")
        self.assertIn('"Isolation and confinement", presented third for a Mars / Deep Space mission', sleep["reason"])
        self.assertEqual(sleep["follow_up_ids"], ["sleep.hours", "sleep.duration"])

    def test_mission_context_adds_and_promotes_topics(self):
        self.assertNotIn("eva", [t["domain_id"] for t in self.plan()["topics"]])
        after_eva = self.plan(eva_recent=True)
        self.assertEqual(after_eva["topics"][1]["domain_id"], "eva")
        self.assertIn("eva recent", after_eva["topics"][1]["reason"])
        self.assertEqual(after_eva["question_count"], self.plan()["question_count"] + 1)
        self.assertEqual(self.plan(gravity_transition_recent=True, phase="return")["topics"][1]["domain_id"], "balance")

    def test_indicators_are_selected_through_documented_hazard_and_risk_links(self):
        plan = self.plan(environment="mars", phase="transit")
        by_id = {indicator["id"]: indicator for indicator in plan["indicators"]}
        self.assertEqual(by_id["heart_rate"]["condition_ids"], ["cardiovascular"])
        self.assertEqual(by_id["heart_rate"]["hazard_ids"], ["gravity"])
        self.assertEqual(by_id["spo2"]["hazard_ids"], ["environment"])
        self.assertEqual(by_id["sleep_hours"]["hazard_ids"], ["isolation", "environment"], "Ordered by this mission's hazard order")
        gravity = next(h for h in plan["hazards"] if h["id"] == "gravity")
        self.assertEqual(gravity["indicator_ids"], ["heart_rate", "exercise_completed"])
        self.assertEqual(next(h for h in plan["hazards"] if h["id"] == "radiation")["indicator_ids"], [],
                         "No collectable indicator is claimed for radiation")
        self.assertEqual(by_id["heart_rate"]["hazard_rank"], 4)
        self.assertEqual({i["id"]: i["hazard_rank"] for i in self.plan()["indicators"]}["heart_rate"], 1)

    def test_indicator_list_must_resolve_to_catalog_risks_and_questions(self):
        import json, tempfile
        data = copy.deepcopy(self.indicators)
        for change in (lambda d: d["indicators"][0].update(condition_ids=["invented"]),
                       lambda d: d["indicators"][2].update(question_ids=["no.such.question"]),
                       lambda d: d["indicators"][0].update(why=""),
                       lambda d: d["indicators"].append(dict(d["indicators"][0]))):
            broken = copy.deepcopy(data)
            change(broken)
            with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False) as handle:
                json.dump(broken, handle)
            with self.assertRaises(ValueError):
                load_indicators(self.catalog, self.registry, handle.name)
            Path(handle.name).unlink()


class EvidenceTraceTests(Base):
    def test_a_finding_is_traced_from_mission_hazard_to_answer_rule_and_action(self):
        profile = self.profile(environment="mars", phase="transit")
        answers = {**self.safety_no, "sleep.quality": "poorly", "sleep.hours": 4.5}
        entry, = self.trace(profile, answers)
        self.assertEqual((entry["condition_id"], entry["level"], entry["mission_title"]), ("sleep", "watch", "Mars / Deep Space"))
        self.assertEqual([(h["id"], h["rank"], h["emphasized"]) for h in entry["hazards"]], [("isolation", 3, True), ("environment", 5, False)])
        self.assertEqual(entry["nasa_risks"][0]["risk_id"], 100)
        self.assertTrue(entry["nasa_risks"][0]["report_url"].endswith("Sleep.pdf"))
        self.assertEqual(entry["observations"], [
            {"kind": "answer", "observation_id": "answer:sleep.quality", "question_id": "sleep.quality", "question": "How well have you been sleeping?",
             "answer_id": "poorly", "answer": "Poorly", "rule_ids": ["observation:poor_sleep"]},
            {"kind": "answer", "observation_id": "answer:sleep.hours", "question_id": "sleep.hours", "question": "About how many hours did you sleep in the last 24 hours?",
             "answer_id": 4.5, "answer": "4.5 hours", "rule_ids": ["field:sleep_hours"]},
        ])
        self.assertIn("4.5 hours", entry["rule_reason"])
        self.assertTrue(entry["actions"], "The prompt created at least one follow-up action")

    def test_changing_an_answer_changes_the_trace(self):
        profile = self.profile()
        self.assertEqual(self.trace(profile, {**self.safety_no, "sleep.quality": "well"}), [])
        self.assertEqual([e["condition_id"] for e in self.trace(profile, {**self.safety_no, "heart.palpitations": "yes"})], ["cardiovascular"])
        both = self.trace(profile, {**self.safety_no, "heart.palpitations": "yes", "balance.dizziness": "yes"})
        self.assertEqual({e["condition_id"] for e in both}, {"cardiovascular", "vestibular"})

    def test_changing_the_mission_changes_the_hazard_context_but_not_the_finding(self):
        answers = {**self.safety_no, "heart.palpitations": "yes"}
        leo, = self.trace(self.profile(), answers)
        mars, = self.trace(self.profile(environment="mars", phase="transit"), answers)
        self.assertEqual((leo["level"], leo["rule_reason"], leo["actions"]), (mars["level"], mars["rule_reason"], mars["actions"]))
        self.assertEqual((leo["hazards"][0]["rank"], mars["hazards"][0]["rank"]), (1, 4))
        self.assertNotEqual(leo["mission_title"], mars["mission_title"])

    def test_sensor_measurements_are_traced_to_their_nasa_risk_with_their_source(self):
        measurement = {"heart_rate": 72, "spo2": 91, "input_source": "sensor", "sensor_port": "COM7", "sensor_received_at": "2026-11-15T08:00:00+00:00"}
        entries = {e["condition_id"]: e for e in self.trace(self.profile(), dict(self.safety_no), measurement)}
        self.assertEqual(entries["hypoxia"]["observations"], [{
            "kind": "measurement", "observation_id": "measurement:spo2@2026-11-15T08:00:00+00:00", "indicator_id": "spo2",
            "label": "Estimated blood oxygen (SpO2)", "value": 91.0, "unit": "%", "source": "sensor", "sensor_port": "COM7",
            "measured_at": "2026-11-15T08:00:00+00:00", "signal_quality": "unknown", "rule_ids": ["measurement:spo2"]}])
        self.assertEqual(entries["hypoxia"]["nasa_risks"][0]["risk_id"], 173)
        self.assertEqual(entries["cardiovascular"]["observations"][0]["indicator_id"], "heart_rate")
        simulated = self.trace(self.profile(), dict(self.safety_no), {**measurement, "input_source": "simulated"})
        self.assertTrue(all(o["source"] == "simulated" for e in simulated for o in e["observations"]))

    def test_every_finding_carries_the_identifiers_needed_to_audit_it(self):
        from astrotip.analysis.rules import RULES_VERSION
        profile = self.profile(environment="mars", phase="transit")
        answers = {**self.safety_no, "sleep.quality": "poorly", "sleep.hours": 4.5}
        entries = {e["condition_id"]: e for e in self.trace(profile, answers, {"heart_rate": 72, "spo2": 98, "input_source": "sensor", "sensor_port": "COM7", "sensor_received_at": "2026-11-15T08:00:00+00:00"})}
        sleep = entries["sleep"]["traceability"]
        self.assertEqual(sleep["nasa_risk_ids"], [100])
        self.assertIn("sleep", sleep["nasa_source_ids"])
        self.assertEqual(sleep["question_ids"], ["sleep.quality", "sleep.hours"])
        self.assertEqual(sleep["observation_ids"], ["answer:sleep.quality", "answer:sleep.hours"])
        self.assertEqual(sleep["rule_ids"], ["field:sleep_hours", "observation:poor_sleep"])
        self.assertEqual((sleep["rules_engine"], sleep["rules_version"]), ("astrotip.analysis.rules.assess", RULES_VERSION))
        self.assertEqual(sleep["question_registry_version"], self.registry["version"])
        self.assertEqual(sleep["catalog_reviewed_on"], self.catalog["reviewed_on"])
        heart = entries["cardiovascular"]["traceability"]
        self.assertEqual(heart["observation_ids"], ["measurement:heart_rate@2026-11-15T08:00:00+00:00"])
        self.assertEqual(heart["rule_ids"], ["measurement:heart_rate"])
        self.assertEqual(heart["question_ids"], [])

    def test_unsure_and_skipped_answers_never_appear_as_observations(self):
        entries = self.trace(self.profile(), {**self.safety_no, "sleep.quality": "unsure", "heart.palpitations": "skipped", "strength.exercise": "not_scheduled"})
        self.assertEqual(entries, [])

    def test_an_urgent_report_is_traced_without_any_measurement(self):
        entry, = [e for e in self.trace(self.profile(environment="lunar", phase="surface"), {**self.safety_no, "safety.chest_pain": "yes"}) if e["level"] == "urgent"]
        self.assertEqual([(o["question_id"], o["answer"], o["rule_ids"]) for o in entry["observations"]], [("safety.chest_pain", "Yes", ["observation:chest_pain"])])
        self.assertIn("emergency", entry["actions"][0].lower())


def stamps(minutes):
    return [f"2023-01-01T{m // 60:02d}:{m % 60:02d}:00" for m in minutes]


class RadiationAnalysisTests(unittest.TestCase):
    def test_statistics_are_computed_from_the_published_values(self):
        stats = analyze_series(stamps([0, 60, 120, 180]), [2.0, 4.0, 4.0, 10.0], "2023-01-01", "2023-01-02")
        self.assertEqual((stats["count"], stats["mean"], stats["median"], stats["minimum"], stats["maximum"]), (4, 5.0, 4.0, 2.0, 10.0))
        self.assertAlmostEqual(stats["standard_deviation"], 3.0)
        self.assertAlmostEqual(stats["percentile_95"], 9.1)
        self.assertEqual((stats["maximum_at"], stats["cadence_minutes"], stats["expected_count"]), ("2023-01-01T03:00:00", 60.0, 24))
        self.assertEqual(stats["hourly_mean"][:4], [2.0, 4.0, 4.0, 10.0])
        self.assertEqual(stats["hours_without_data"], list(range(4, 24)))
        self.assertEqual((stats["highest_hour"], stats["lowest_hour"]), (3, 0))
        self.assertEqual((stats["first_half_mean"], stats["second_half_mean"]), (5.0, None))

    def test_missing_stretches_are_found_including_at_the_ends_of_the_day(self):
        minutes = list(range(60, 600, 10)) + list(range(700, 1380, 10))
        stats = analyze_series(stamps(minutes), [1.0] * len(minutes), "2023-01-01", "2023-01-02")
        self.assertEqual(stats["cadence_minutes"], 10.0)
        self.assertEqual(stats["gap_count"], 3)
        self.assertEqual([gap["minutes"] for gap in stats["gaps"]], [110.0, 70.0, 60.0])
        self.assertEqual(stats["gaps"][0], {"start": "2023-01-01T09:50:00", "end": "2023-01-01T11:40:00", "minutes": 110.0})
        self.assertEqual(stats["longest_gap_minutes"], 110.0)
        self.assertLess(stats["coverage_percent"], 90)

    def test_irregular_readings_are_identified_as_zeros_and_excursions(self):
        values = [5.0] * 20
        values[3] = 0.0
        values[8:11] = [40.0, 90.0, 30.0]
        values[15] = 16.0
        stats = analyze_series(stamps(range(0, 200, 10)), values, "2023-01-01", "2023-01-02")
        self.assertEqual(stats["zero_count"], 1)
        self.assertEqual((stats["excursion_threshold"], stats["excursion_count"], stats["excursion_episodes"]), (15.0, 4, 2))
        top = stats["excursions"][0]
        self.assertEqual((top["start"], top["end"], top["readings"], top["peak"], top["peak_at"]),
                         ("2023-01-01T01:20:00", "2023-01-01T01:40:00", 3, 90.0, "2023-01-01T01:30:00"))
        text = " ".join(describe("X", stats, None))
        self.assertIn("exactly zero", text)
        self.assertIn("4 reading(s) in 2 episode(s)", text)
        self.assertIn("does not state the cause", text)
        self.assertNotIn("None", text)

    def test_a_steady_complete_series_reports_no_irregularity(self):
        stats = analyze_series(stamps(range(0, 1440, 60)), [8.0 + (i % 3) * 0.1 for i in range(24)], "2023-01-01", "2023-01-02")
        self.assertEqual((stats["gap_count"], stats["zero_count"], stats["excursion_count"], stats["coverage_percent"]), (0, 0, 0, 100.0))
        text = " ".join(describe("X", stats, "unit"))
        self.assertIn("No pause longer", text)
        self.assertIn("No reading is more than", text)
        self.assertIn("8.10 unit", text)

    def test_real_dataset_analysis_is_grouped_by_mission_environment(self):
        dataset = radlab.load_cache(radlab.BUNDLED_CACHE)
        analysis = analyze(dataset, radlab.load_instruments())
        self.assertEqual(set(analysis["instruments"]), set(dataset["instruments"]))
        self.assertEqual(analysis["by_environment"]["lunar"], ["CRaTER-D1D2"])
        self.assertIn("MSL-RAD-Surface", analysis["by_environment"]["mars"])
        self.assertEqual(analysis["undescribed"], ["BPD", "REM-Lid"])
        for name, stats in analysis["instruments"].items():
            values = dataset["instruments"][name]["values"]
            self.assertEqual((stats["count"], stats["minimum"], stats["maximum"]), (len(values), min(values), max(values)))
            self.assertAlmostEqual(stats["mean"], sum(values) / len(values))
            self.assertEqual(len(stats["hourly_mean"]), 24)
            self.assertTrue(stats["observations"])
        self.assertIn("Descriptive only", analysis["method"]["limits"])

    def test_only_instruments_of_the_selected_mission_are_called_relevant(self):
        dataset = radlab.load_cache(radlab.BUNDLED_CACHE)
        analysis = analyze(dataset, radlab.load_instruments())
        self.assertEqual(relevant_instruments(analysis, "leo")["instruments"], ["DosTel1", "Lidal"])
        self.assertIsNone(relevant_instruments(analysis, "mars")["explanation"])
        without_lunar = copy.deepcopy(dataset)
        del without_lunar["instruments"]["CRaTER-D1D2"]
        missing = relevant_instruments(analyze(without_lunar, radlab.load_instruments()), "lunar")
        self.assertEqual(missing["instruments"], [])
        self.assertIn("no mission-specific radiation data is shown", missing["explanation"])

    def test_analysis_records_what_is_needed_to_reproduce_it(self):
        import numpy, pandas
        from astrotip.nasa.radlab_analysis import ALGORITHM_VERSION
        dataset = radlab.load_cache(radlab.BUNDLED_CACHE)
        provenance = analyze(dataset, radlab.load_instruments())["provenance"]
        self.assertEqual(provenance["algorithm_version"], ALGORITHM_VERSION)
        self.assertEqual(provenance["libraries"], {"pandas": pandas.__version__, "numpy": numpy.__version__})
        self.assertEqual(provenance["dataset_request_url"], dataset["request_url"])
        self.assertEqual(provenance["dataset_retrieved_at"], dataset["retrieved_at"])
        self.assertEqual(provenance["dataset_sha256"], dataset["data_sha256"])
        self.assertEqual(provenance["instruments"], list(dataset["instruments"]))
        self.assertIsNone(provenance["unit"])
        self.assertEqual(provenance["pipeline_version"], radlab.PIPELINE_VERSION)
        self.assertTrue(provenance["transformation_steps"])

    def test_service_output_carries_the_analysis(self):
        from tempfile import TemporaryDirectory
        with TemporaryDirectory() as folder:
            result = radlab.RadLabService(Path(folder) / "user.json").cached()
        self.assertIn("DosTel1", result["analysis"]["instruments"])
        self.assertEqual(result["analysis"]["instruments"]["DosTel1"]["count"], result["summary"]["DosTel1"]["count"])


if __name__ == "__main__":
    unittest.main()


class HistoryTrendTests(unittest.TestCase):
    @staticmethod
    def entry(entry_id, heart_rate=None, spo2=None, source="sensor"):
        return {"id": entry_id, "created_at": f"2026-11-{10 + entry_id:02d}T08:00:00+00:00",
                "checkin": {"heart_rate": heart_rate, "spo2": spo2, "input_source": source}, "assessment": {}}

    def test_saved_measurements_are_summarised_and_simulated_entries_excluded(self):
        from astrotip.analysis.history_trends import ALGORITHM_VERSION, summarize_history
        entries = [self.entry(4, 80, 97), self.entry(3, 999, 50, source="simulated"), self.entry(2, 70, None, source="manual"), self.entry(1, 60, 99)]
        summary = summarize_history(entries)
        self.assertEqual((summary["algorithm_version"], summary["entries_considered"], summary["simulated_excluded"]), (ALGORITHM_VERSION, 3, 1))
        heart = summary["indicators"]["heart_rate"]
        self.assertEqual((heart["count"], heart["mean"], heart["minimum"], heart["maximum"]), (3, 70.0, 60.0, 80.0))
        self.assertEqual((heart["latest"], heart["previous"], heart["change_from_previous"]), (80.0, 70.0, 10.0))
        self.assertEqual([point["entry_id"] for point in heart["points"]], [1, 2, 4])
        self.assertEqual(heart["points"][1]["source"], "manual")
        oxygen = summary["indicators"]["spo2"]
        self.assertEqual((oxygen["count"], oxygen["latest"], oxygen["change_from_previous"]), (2, 97.0, -2.0))
        self.assertIn("does not interpret a change", summary["limits"])

    def test_no_saved_measurement_gives_counts_of_zero_and_no_statistics(self):
        from astrotip.analysis.history_trends import summarize_history
        for entries in ([], [self.entry(1)], [self.entry(1, 72, 98, source="simulated")]):
            summary = summarize_history(entries)
            self.assertEqual(summary["indicators"]["heart_rate"]["count"], 0)
            self.assertNotIn("mean", summary["indicators"]["heart_rate"])
            self.assertEqual(summary["indicators"]["spo2"]["points"], [])
