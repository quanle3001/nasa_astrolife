"""Turn questionnaire answers and a measurement into the existing CheckIn.

This is the only place where answers become assessment inputs. It adds no
medical logic: it selects observation keys and fields that the existing rules
in `analysis/rules.py` already handle, and those rules produce every finding.
"""

from __future__ import annotations

from astrotip.models.health_indicator import CheckIn
from astrotip.questionnaire.registry import (
    SAFETY_DOMAIN, SKIPPED, UNSURE, applicable_answers, option_values, validate_answer, visible_questions,
)


def _label(question: dict, value) -> str:
    if question["input"] == "boolean":
        return {"yes": "yes", "no": "no"}.get(value, str(value))
    for option in question.get("options", []):
        if option["value"] == value:
            return option["label"].lower()
    return str(value)


def checkin_from_answers(registry: dict, mission: dict, answers: dict, hazard_order: list[str],
                         measurement: dict | None = None, require_safety: bool = True) -> tuple[CheckIn, list[str]]:
    """Build the CheckIn for the assessment rules plus plain-language session notes.

    Answers to questions that no longer apply are ignored. Unanswered, unsure
    and skipped items are listed as not assessed; they are never treated as "no".
    """
    kept = applicable_answers(registry, mission, answers)
    questions = visible_questions(registry, mission, kept, hazard_order)
    symptoms: set[str] = set()
    fields: dict = {}
    details: list[str] = []
    not_assessed: list[str] = []
    for question in questions:
        if question["id"] not in kept:
            if question.get("required") and (require_safety or question["domain"] != SAFETY_DOMAIN):
                raise ValueError(f"Answer the required question first: {question['text']}")
            not_assessed.append(f"Not answered: {question['text']}")
            continue
        value = kept[question["id"]]
        validate_answer(question, value)
        if value == UNSURE:
            not_assessed.append(f"Unsure: {question['text']}")
            continue
        if value == SKIPPED:
            not_assessed.append(f"Skipped: {question['text']}")
            continue
        mapping = question.get("maps_to", {})
        if "symptoms" in mapping:
            symptoms.update(mapping["symptoms"].get(value, ()))
        elif "field" in mapping:
            if question["input"] == "number":
                fields[mapping["field"]] = float(value)
            elif value in mapping.get("values", {}):
                fields[mapping["field"]] = mapping["values"][value]
        if question.get("note_label"):
            details.append(f"{question['note_label']}: {_label(question, value)}")
    measurement = measurement or {}
    checkin = CheckIn(
        heart_rate=measurement.get("heart_rate"),
        spo2=measurement.get("spo2"),
        signal_quality=measurement.get("signal_quality", "unknown"),
        sleep_hours=fields.get("sleep_hours"),
        symptoms=frozenset(symptoms),
        exercise_completed=fields.get("exercise_completed"),
        notes="\n".join(details),
        input_source=measurement.get("input_source", "manual"),
        sensor_port=measurement.get("sensor_port", ""),
        sensor_received_at=measurement.get("sensor_received_at", ""),
    )
    notes = []
    if not_assessed:
        notes.append("These items were not assessed and are not treated as normal:")
        notes.extend(not_assessed)
    if checkin.heart_rate is None and checkin.spo2 is None:
        notes.append("No heart-rate or SpO2 measurement was included in this check-in.")
    elif checkin.input_source == "simulated":
        notes.append("The measurement in this check-in is simulated demo data, not a real reading.")
    return checkin, notes


def has_urgent_answer(registry: dict, mission: dict, answers: dict) -> bool:
    """True when any urgent question was answered yes (used for the safety interrupt)."""
    kept = applicable_answers(registry, mission, answers)
    by_id = {question["id"]: question for question in registry["questions"]}
    return any(by_id[question_id].get("urgent") and value in option_values(by_id[question_id])
               and by_id[question_id].get("maps_to", {}).get("symptoms", {}).get(value)
               for question_id, value in kept.items())
