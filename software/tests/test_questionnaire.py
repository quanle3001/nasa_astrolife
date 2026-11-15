"""Mission context, question registry, branching and the answers-to-CheckIn mapping."""

import copy
import json
from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from astrotip.analysis.mission_context import load_mission_context, validate_mission_context, validate_profile
from astrotip.analysis.nasa_guidance import load_catalog
from astrotip.analysis.rules import assess
from astrotip.questionnaire.registry import (
    applicable_answers, domain_order, load_registry, validate_answer, validate_registry, visible_questions,
)
from astrotip.questionnaire.session import checkin_from_answers, has_urgent_answer

VECTORS_PATH = Path(__file__).resolve().parents[1] / "resources" / "question_vectors.json"


class Base(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.catalog = load_catalog()
        cls.context = load_mission_context(cls.catalog)
        cls.registry = load_registry(cls.catalog)
        cls.safety_no = {q["id"]: "no" for q in cls.registry["questions"] if q["domain"] == "safety"}

    def profile(self, **fields):
        return validate_profile(fields, self.context)

    def order(self, mission):
        return self.context["missions"][mission["environment"]]["hazard_order"]

    def visible(self, mission, answers):
        return [q["id"] for q in visible_questions(self.registry, mission, answers, self.order(mission))]


class MissionContextTests(Base):
    def test_every_mission_shows_all_five_hazards_in_a_different_order(self):
        orders = {mission: tuple(data["hazard_order"]) for mission, data in self.context["missions"].items()}
        for order in orders.values():
            self.assertEqual(sorted(order), ["distance", "environment", "gravity", "isolation", "radiation"])
        self.assertEqual(len(set(orders.values())), 3, "Mission selection must change the emphasis")
        self.assertEqual(orders["leo"][0], "gravity")
        self.assertEqual(orders["mars"][:2], ("radiation", "distance"))

    def test_every_emphasis_has_a_rationale_and_a_resolvable_nasa_source(self):
        sources = {source["id"]: source["url"] for source in self.catalog["sources"]}
        for mission in self.context["missions"].values():
            self.assertTrue(mission["emphasis"])
            for emphasis in mission["emphasis"].values():
                self.assertTrue(emphasis["rationale"])
                for source_id in emphasis["source_ids"]:
                    self.assertIn("nasa.gov", sources[source_id])

    def test_a_mission_that_hides_a_hazard_is_rejected(self):
        broken = copy.deepcopy(self.context)
        broken["missions"]["leo"]["hazard_order"].remove("radiation")
        with self.assertRaises(ValueError):
            validate_mission_context(broken, self.catalog)

    def test_profile_validation(self):
        self.assertEqual(self.profile()["environment"], "leo")
        self.assertEqual(self.profile(environment="mars", phase="surface", mission_day=120)["mission_day"], 120)
        for bad in ({"environment": "venus"}, {"environment": "leo", "phase": "surface"}, {"mission_day": 0},
                    {"mission_day": 2.5}, {"mission_day": True}, {"eva_recent": "yes"}, {"risk_score": 3}):
            with self.subTest(bad=bad), self.assertRaises(ValueError):
                self.profile(**bad)


class RegistryTests(Base):
    def test_safety_screen_is_identical_for_every_mission_and_always_first(self):
        expected = list(self.safety_no)
        self.assertEqual(len(expected), 9)
        for fields in ({}, {"environment": "lunar", "phase": "surface"}, {"environment": "mars", "phase": "transit", "eva_recent": True}):
            with self.subTest(fields=fields):
                self.assertEqual(self.visible(self.profile(**fields), {})[:9], expected)

    def test_mission_changes_question_order_and_adds_the_eva_question(self):
        leo, mars = self.profile(), self.profile(environment="mars", phase="transit")
        self.assertNotEqual(domain_order(self.registry, leo, self.order(leo)), domain_order(self.registry, mars, self.order(mars)))
        self.assertNotIn("eva.new_symptoms", self.visible(leo, {}))
        after_eva = self.profile(eva_recent=True)
        self.assertEqual(self.visible(after_eva, {})[9], "eva.new_symptoms", "Recent EVA promotes the EVA topic right after safety")
        transition = self.profile(gravity_transition_recent=True)
        self.assertEqual(self.visible(transition, {})[9], "balance.dizziness")

    def test_follow_ups_appear_only_for_the_answer_that_needs_them(self):
        mission = self.profile(environment="mars", phase="transit")
        follow_ups = {"sleep.hours", "sleep.duration"}
        self.assertFalse(follow_ups & set(self.visible(mission, {})))
        self.assertFalse(follow_ups & set(self.visible(mission, {"sleep.quality": "well"})))
        self.assertFalse(follow_ups & set(self.visible(mission, {"sleep.quality": "unsure"})))
        self.assertTrue(follow_ups <= set(self.visible(mission, {"sleep.quality": "poorly"})))
        self.assertIn("sleep.fatigue", self.visible(mission, {"sleep.quality": "well"}), "Routine fatigue question stays")
        dizzy = self.visible(mission, {"balance.dizziness": "yes"})
        self.assertTrue({"balance.when", "balance.transition"} <= set(dizzy))
        self.assertNotIn("balance.when", self.visible(mission, {"balance.dizziness": "no"}))

    def test_changing_an_earlier_answer_drops_follow_ups_that_no_longer_apply(self):
        mission = self.profile()
        answers = {"sleep.quality": "poorly", "sleep.hours": 4, "sleep.duration": "over_a_week", "sleep.fatigue": "yes"}
        self.assertEqual(applicable_answers(self.registry, mission, answers), answers)
        changed = {**answers, "sleep.quality": "well"}
        self.assertEqual(applicable_answers(self.registry, mission, changed), {"sleep.quality": "well", "sleep.fatigue": "yes"})

    def test_answer_validation(self):
        by_id = {q["id"]: q for q in self.registry["questions"]}
        validate_answer(by_id["sleep.quality"], "unsure")
        validate_answer(by_id["sleep.hours"], 6.5)
        validate_answer(by_id["sleep.hours"], "skipped")
        for question_id, value in (("safety.chest_pain", "unsure"), ("safety.chest_pain", "skipped"), ("sleep.hours", 25),
                                   ("sleep.hours", True), ("sleep.quality", "terrible"), ("eva.new_symptoms", "skipped")):
            with self.subTest(question=question_id, value=value), self.assertRaises(ValueError):
                validate_answer(by_id[question_id], value)

    def test_registry_rejects_unsafe_definitions(self):
        def broken(change):
            registry = copy.deepcopy(self.registry)
            change(registry)
            with self.assertRaises(ValueError):
                validate_registry(registry, self.catalog)
        broken(lambda r: r["questions"][0].update(show_if={"mission": {"field": "environment", "equals": "mars"}}))
        broken(lambda r: r["questions"][0].update(allow_skip=True))
        broken(lambda r: r["questions"].pop(0))  # An urgent observation would lose its screening question.
        broken(lambda r: r["questions"][9]["maps_to"]["symptoms"].update(poorly=["invented_symptom"]))
        broken(lambda r: r["questions"][10].update(show_if={"answer": {"question": "sleep.fatigue", "in": ["yes"]}}))
        broken(lambda r: r["questions"][9].update(evidence_ids=["no_such_source"]))
        broken(lambda r: r["questions"].append(dict(r["questions"][9])))

    def test_python_and_desktop_engines_share_the_same_cases(self):
        vectors = json.loads(VECTORS_PATH.read_text(encoding="utf-8"))
        self.assertEqual(vectors["registry_version"], self.registry["version"])
        self.assertGreaterEqual(len(vectors["cases"]), 8)
        for case in vectors["cases"]:
            with self.subTest(case=case["name"]):
                mission = self.profile(**case["mission"])
                self.assertEqual(domain_order(self.registry, mission, self.order(mission)), case["domain_order"])
                self.assertEqual(self.visible(mission, case["answers"]), case["visible"])
                self.assertEqual(applicable_answers(self.registry, mission, case["answers"]), case["applicable_answers"])


class SessionMappingTests(Base):
    def build(self, mission, answers, measurement=None, **kwargs):
        return checkin_from_answers(self.registry, mission, answers, self.order(mission), measurement, **kwargs)

    def test_answers_and_sensor_values_reach_the_existing_rules(self):
        mission = self.profile(environment="mars", phase="transit")
        answers = {**self.safety_no, "sleep.quality": "poorly", "sleep.hours": 4.5, "sleep.duration": "several_nights",
                   "strength.exercise": "missed", "balance.dizziness": "yes", "balance.transition": "yes"}
        measurement = {"heart_rate": 72, "spo2": 91, "signal_quality": "unknown", "input_source": "sensor",
                       "sensor_port": "COM7", "sensor_received_at": "2026-11-15T08:00:00+00:00"}
        checkin, _notes = self.build(mission, answers, measurement)
        self.assertEqual(checkin.symptoms, frozenset({"poor_sleep", "dizziness"}))
        self.assertEqual((checkin.sleep_hours, checkin.exercise_completed), (4.5, False))
        self.assertEqual((checkin.heart_rate, checkin.spo2, checkin.input_source, checkin.sensor_port), (72, 91, "sensor", "COM7"))
        self.assertIn("Poor sleep for: several nights", checkin.notes)
        self.assertIn("Dizziness followed a gravity transition: yes", checkin.notes)
        self.assertFalse(hasattr(checkin, "mission"), "Mission context never enters the assessment input")
        assessment = assess(checkin, self.catalog)
        levels = {finding.condition_id: finding.level for finding in assessment.findings}
        self.assertEqual(assessment.level, "review")  # SpO2 91 uses the existing MedlinePlus reference rule.
        self.assertEqual((levels["sleep"], levels["vestibular"], levels["fitness"]), ("watch", "watch", "watch"))

    def test_same_answers_give_the_same_findings_for_every_mission(self):
        answers = {**self.safety_no, "sleep.quality": "poorly", "heart.palpitations": "yes"}
        results = []
        for fields in ({}, {"environment": "lunar", "phase": "surface"}, {"environment": "mars", "phase": "transit"}):
            mission = self.profile(**fields)
            assessment = assess(self.build(mission, answers)[0], self.catalog)
            results.append([(f.condition_id, f.level, f.reason) for f in assessment.findings])
        self.assertEqual(results[0], results[1])
        self.assertEqual(results[0], results[2])

    def test_unsure_skipped_and_unanswered_are_not_assessed_and_never_negative(self):
        mission = self.profile()
        answers = {**self.safety_no, "sleep.quality": "unsure", "heart.palpitations": "skipped"}
        checkin, notes = self.build(mission, answers)
        self.assertEqual(checkin.symptoms, frozenset())
        text = "\n".join(notes)
        self.assertIn("not treated as normal", text)
        self.assertIn("Unsure: How well have you been sleeping?", text)
        self.assertIn("Skipped: Have you felt a racing or irregular heartbeat?", text)
        self.assertIn("Not answered: Do you have bone or back pain?", text)
        self.assertIn("No heart-rate or SpO2 measurement", text)

    def test_missing_measurement_stays_missing(self):
        checkin, _notes = self.build(self.profile(), dict(self.safety_no))
        self.assertIsNone(checkin.heart_rate)
        self.assertIsNone(checkin.spo2)
        assessment = assess(checkin, self.catalog)
        self.assertEqual(assessment.level, "info")
        self.assertIn("SpO2 was not provided", " ".join(assessment.data_notes))

    def test_required_safety_and_eva_questions_block_submission_until_answered(self):
        with self.assertRaises(ValueError):
            self.build(self.profile(), {"sleep.quality": "well"})
        after_eva = self.profile(eva_recent=True)
        with self.assertRaises(ValueError):
            self.build(after_eva, dict(self.safety_no))
        self.build(after_eva, {**self.safety_no, "eva.new_symptoms": "no"})

    def test_urgent_answer_is_urgent_without_any_sensor(self):
        mission = self.profile(environment="lunar", phase="surface")
        answers = {"safety.chest_pain": "yes"}
        self.assertTrue(has_urgent_answer(self.registry, mission, answers))
        self.assertFalse(has_urgent_answer(self.registry, mission, {"safety.chest_pain": "no", "sleep.quality": "poorly"}))
        checkin, _notes = self.build(mission, answers, require_safety=False)
        assessment = assess(checkin, self.catalog)
        self.assertEqual(assessment.level, "urgent")
        self.assertIn("emergency", assessment.findings[0].actions[0].lower())

    def test_answers_to_hidden_questions_are_ignored(self):
        mission = self.profile()
        answers = {**self.safety_no, "sleep.quality": "well", "sleep.hours": 3, "eva.new_symptoms": "yes"}
        checkin, _notes = self.build(mission, answers)
        self.assertIsNone(checkin.sleep_hours)
        self.assertNotIn("eva_symptoms", checkin.symptoms)

    def test_simulated_measurement_is_called_out(self):
        checkin, notes = self.build(self.profile(), dict(self.safety_no),
                                    {"heart_rate": 72, "spo2": 98, "input_source": "simulated", "sensor_port": "simulated"})
        self.assertEqual(checkin.input_source, "simulated")
        self.assertIn("simulated demo data", " ".join(notes))


if __name__ == "__main__":
    unittest.main()
