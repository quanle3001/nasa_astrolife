"""NASA-informed assessment plan and evidence trace.

This module is where NASA's hazard and risk knowledge does work in the app:

    mission -> NASA hazards (ordered for the mission)
            -> NASA health risks linked to each hazard        (nasa_sources.json)
            -> health topics and questions for those risks     (question_registry.json)
            -> indicators to collect for those risks           (health_indicators.json)
            -> Human Research Roadmap evidence for those risks (hrr_evidence.json)

`build_plan` derives, for one mission profile, which topics are asked and in
what order and which indicators are collected, with the reason for each.
`build_trace` explains, for each finding of a finished check-in, the chain from
the mission's hazard through the NASA risk to the astronaut's own answer or
measurement, the rule-based prompt and the follow-up action.

Nothing here decides urgency or produces a finding. Findings come only from
`analysis/rules.py`. NASA research explains context; it is never used as a
clinical threshold.
"""

from __future__ import annotations

import json
from pathlib import Path

from astrotip.analysis.rules import OBSERVATION_RULES
from astrotip.models.health_indicator import SYMPTOMS
from astrotip.questionnaire.registry import (
    SAFETY_DOMAIN, SKIPPED, UNSURE, applicable_answers, condition_met, domain_order, visible_questions,
)

INDICATORS_PATH = Path(__file__).resolve().parents[2] / "resources" / "health_indicators.json"
#: Check-in fields that the rules use to flag a condition, besides reported symptoms.
FIELD_CONDITIONS = {"sleep_hours": ("sleep",), "exercise_completed": ("fitness", "bone")}


def load_indicators(catalog: dict, registry: dict, path: str | Path | None = None) -> dict:
    with Path(path or INDICATORS_PATH).open(encoding="utf-8") as handle:
        data = json.load(handle)
    conditions = {condition["id"] for condition in catalog["conditions"]}
    questions = {question["id"] for question in registry["questions"]}
    if data.get("schema_version") != 1:
        raise ValueError("Unsupported health indicator list.")
    seen = set()
    for indicator in data["indicators"]:
        if indicator["id"] in seen or indicator["source"] not in {"sensor", "question"}:
            raise ValueError("Health indicators need unique ids and a known source.")
        if not indicator["condition_ids"] or not set(indicator["condition_ids"]) <= conditions:
            raise ValueError(f"Indicator {indicator['id']} must relate to NASA catalog risks.")
        if not set(indicator.get("question_ids", [])) <= questions or not indicator.get("why", "").strip():
            raise ValueError(f"Indicator {indicator['id']} has an unknown question or no rationale.")
        seen.add(indicator["id"])
    return data


def _hazard_rank(hazard_order: list[str], hazard_ids: list[str]) -> int | None:
    ranks = [hazard_order.index(hazard) for hazard in hazard_ids if hazard in hazard_order]
    return min(ranks) + 1 if ranks else None


def build_plan(catalog: dict, mission_context: dict, registry: dict, indicators: dict, hrr: dict, profile: dict) -> dict:
    """What this mission's check-in asks and collects, and why, derived from the NASA catalog."""
    mission = mission_context["missions"][profile["environment"]]
    hazard_order = mission["hazard_order"]
    hazard_titles = {hazard["id"]: hazard["title"] for hazard in catalog["hazards"]}
    conditions = {condition["id"]: condition for condition in catalog["conditions"]}
    domains = {domain["id"]: domain for domain in registry["domains"]}
    eligible = [question for question in visible_questions(registry, profile, {}, hazard_order)]
    eligible_ids = {question["id"] for question in eligible}

    topics = []
    for position, domain_id in enumerate(domain_order(registry, profile, hazard_order)):
        domain = domains[domain_id]
        questions = [question for question in registry["questions"] if question["domain"] == domain_id]
        asked = [question["id"] for question in questions if question["id"] in eligible_ids]
        # Follow-ups are part of the plan but only appear after a specific answer.
        conditional = [question["id"] for question in questions if question["id"] not in eligible_ids and "answer" in json.dumps(question.get("show_if", {}))]
        if domain_id == SAFETY_DOMAIN:
            reason = "Universal safety screen: asked first on every mission."
        elif not asked and not conditional:
            continue  # Not applicable to this mission context (for example the EVA topic without a recent EVA).
        elif "promote_if" in domain and condition_met(domain["promote_if"], profile, {}):
            field = domain["promote_if"]["mission"]["field"].replace("_", " ")
            reason = f"Moved to the front because your mission context reports: {field}."
        else:
            rank = _hazard_rank(hazard_order, domain["hazard_ids"])
            lead = min(domain["hazard_ids"], key=hazard_order.index)
            reason = f"Linked to the NASA hazard \"{hazard_titles[lead]}\", presented {_ordinal(rank)} for a {mission['title']} mission."
        topics.append({
            "domain_id": domain_id, "title": domain["title"], "position": position + 1, "reason": reason,
            "hazard_ids": domain["hazard_ids"], "condition_ids": domain["condition_ids"],
            "question_ids": asked, "follow_up_ids": conditional,
        })

    plan_indicators = []
    for indicator in indicators["indicators"]:
        hazard_ids = sorted({hazard for condition_id in indicator["condition_ids"] for hazard in conditions[condition_id]["hazard_ids"]},
                            key=hazard_order.index)
        plan_indicators.append({
            "id": indicator["id"], "label": indicator["label"], "unit": indicator["unit"], "source": indicator["source"],
            "condition_ids": indicator["condition_ids"], "hazard_ids": hazard_ids, "why": indicator["why"],
            "hazard_rank": _hazard_rank(hazard_order, hazard_ids),
        })

    hazards = []
    for rank, hazard_id in enumerate(hazard_order, start=1):
        related = [condition for condition in catalog["conditions"] if hazard_id in condition["hazard_ids"]]
        related_ids = {condition["id"] for condition in related}
        hazard_topics = [topic for topic in topics if related_ids & set(topic["condition_ids"])]
        emphasis = mission["emphasis"].get(hazard_id)
        hazards.append({
            "id": hazard_id, "title": hazard_titles[hazard_id], "rank": rank, "emphasized": emphasis is not None,
            "rationale": emphasis["rationale"] if emphasis else None,
            "condition_ids": [condition["id"] for condition in related],
            "hrr_risk_ids": sorted({report["risk_id"] for condition in related for report in hrr["conditions"][condition["id"]]}),
            "topic_ids": [topic["domain_id"] for topic in hazard_topics],
            "question_ids": [question_id for topic in hazard_topics for question_id in topic["question_ids"]],
            "indicator_ids": [indicator["id"] for indicator in plan_indicators if related_ids & set(indicator["condition_ids"])],
        })

    return {
        "environment": profile["environment"], "mission_title": mission["title"],
        "hazards": hazards, "topics": topics, "indicators": plan_indicators,
        "question_count": len([question for question in eligible if question["domain"] != SAFETY_DOMAIN]),
        "safety_question_count": len([question for question in eligible if question["domain"] == SAFETY_DOMAIN]),
    }


def _ordinal(number: int | None) -> str:
    return {1: "first", 2: "second", 3: "third", 4: "fourth", 5: "fifth"}.get(number, "later")


def _answer_label(question: dict, value) -> str:
    if value == UNSURE:
        return "Not sure"
    if value == SKIPPED:
        return "Skipped"
    if question["input"] == "boolean":
        return "Yes" if value == "yes" else "No"
    if question["input"] == "number":
        return f"{value:g} {question.get('validation', {}).get('unit', '')}".strip()
    return next((option["label"] for option in question.get("options", []) if option["value"] == value), str(value))


def build_trace(catalog: dict, mission_context: dict, registry: dict, indicators: dict, hrr: dict,
                profile: dict, answers: dict, checkin, assessment) -> list[dict]:
    """For each finding that is not 'info': why it relates to the mission and what produced it.

    Each entry links the mission's NASA hazard, the NASA risk and its evidence
    report to the astronaut's own answers and measurements that led the rules
    to the prompt, and to the follow-up actions the prompt created.
    """
    mission = mission_context["missions"][profile["environment"]]
    hazard_order = mission["hazard_order"]
    hazard_titles = {hazard["id"]: hazard["title"] for hazard in catalog["hazards"]}
    conditions = {condition["id"]: condition for condition in catalog["conditions"]}
    kept = applicable_answers(registry, profile, answers)

    # Which answers and fields can lead the rules to which condition.
    by_condition: dict[str, list[dict]] = {}
    for question in registry["questions"]:
        if question["id"] not in kept:
            continue
        value = kept[question["id"]]
        mapping = question.get("maps_to", {})
        targets: set[str] = set()
        for symptom in mapping.get("symptoms", {}).get(value, ()):
            if symptom in SYMPTOMS:
                targets.add(OBSERVATION_RULES[symptom][0])
        if mapping.get("field") in FIELD_CONDITIONS and value not in {UNSURE, SKIPPED}:
            targets.update(FIELD_CONDITIONS[mapping["field"]])
        for condition_id in targets:
            by_condition.setdefault(condition_id, []).append({
                "kind": "answer", "question_id": question["id"], "question": question["text"], "answer": _answer_label(question, value),
            })
    for indicator in indicators["indicators"]:
        if indicator["source"] != "sensor":
            continue
        value = getattr(checkin, indicator["checkin_field"])
        if value is None:
            continue
        for condition_id in indicator["condition_ids"]:
            by_condition.setdefault(condition_id, []).append({
                "kind": "measurement", "indicator_id": indicator["id"], "label": indicator["label"],
                "value": value, "unit": indicator["unit"], "source": checkin.input_source,
            })

    trace = []
    for finding in assessment.findings:
        if finding.level == "info":
            continue
        condition = conditions[finding.condition_id]
        hazards = sorted(condition["hazard_ids"], key=hazard_order.index)
        trace.append({
            "condition_id": finding.condition_id, "condition_title": condition["title"], "level": finding.level,
            "mission_title": mission["title"],
            "hazards": [{"id": hazard, "title": hazard_titles[hazard], "rank": hazard_order.index(hazard) + 1,
                         "emphasized": hazard in mission["emphasis"]} for hazard in hazards],
            "nasa_risks": [{"risk_id": report["risk_id"], "risk_title": report["risk_title"], "risk_url": report["risk_url"],
                            "report_title": report["report_title"], "report_url": report["report_url"]}
                           for report in hrr["conditions"][finding.condition_id]],
            "observations": by_condition.get(finding.condition_id, []),
            "rule_reason": finding.reason,
            "actions": list(finding.actions),
        })
    return trace
