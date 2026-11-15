"""Versioned question registry and the deterministic eligibility rules.

The same rules are implemented in the desktop app (`desktop/src/questions/engine.ts`)
so questions appear instantly. Both implementations are checked against the
shared cases in `resources/question_vectors.json`, and this module is the one
that decides which answers count when a session is submitted.

Conditions are a small declarative language, never code:
    {"answer":  {"question": "<id>", "in": [values]}}
    {"mission": {"field": "<profile field>", "equals": value}}
    {"mission": {"field": "<profile field>", "in": [values]}}
    {"all": [conditions]}   {"any": [conditions]}
"""

from __future__ import annotations

import json
from pathlib import Path

from astrotip.models.health_indicator import SYMPTOMS

REGISTRY_PATH = Path(__file__).resolve().parents[2] / "resources" / "question_registry.json"
INPUT_TYPES = {"boolean", "scale", "choice", "number"}
CHECKIN_FIELDS = {"sleep_hours", "exercise_completed"}
UNSURE = "unsure"
SKIPPED = "skipped"
SAFETY_DOMAIN = "safety"


def load_registry(catalog: dict, path: str | Path | None = None) -> dict:
    with Path(path or REGISTRY_PATH).open(encoding="utf-8") as handle:
        registry = json.load(handle)
    validate_registry(registry, catalog)
    return registry


def option_values(question: dict) -> list:
    """Regular answer values for a question, without 'unsure' / 'skipped'."""
    if question["input"] == "boolean":
        return ["yes", "no"]
    return [option["value"] for option in question.get("options", [])]


def _condition_question_ids(condition) -> set[str]:
    if not condition:
        return set()
    if "answer" in condition:
        return {condition["answer"]["question"]}
    return {found for child in condition.get("all", []) + condition.get("any", [])
            for found in _condition_question_ids(child)}


def _validate_condition(condition, earlier: set[str], where: str) -> None:
    if not isinstance(condition, dict) or len(condition) != 1:
        raise ValueError(f"{where}: a condition must have exactly one operator.")
    operator, body = next(iter(condition.items()))
    if operator in {"all", "any"}:
        if not body:
            raise ValueError(f"{where}: '{operator}' needs at least one condition.")
        for child in body:
            _validate_condition(child, earlier, where)
    elif operator == "answer":
        # Referring only to earlier questions makes cycles impossible.
        if body.get("question") not in earlier or not body.get("in"):
            raise ValueError(f"{where}: answer conditions must refer to an earlier question.")
    elif operator == "mission":
        if body.get("field") not in {"environment", "phase", "eva_recent", "gravity_transition_recent"}:
            raise ValueError(f"{where}: unknown mission field.")
        if ("equals" in body) == ("in" in body):
            raise ValueError(f"{where}: use exactly one of 'equals' or 'in'.")
    else:
        raise ValueError(f"{where}: unsupported condition operator '{operator}'.")


def validate_registry(registry: dict, catalog: dict) -> None:
    """Fail at startup if the registry could mislead: every reference must resolve."""
    if registry.get("schema_version") != 1 or not registry.get("version"):
        raise ValueError("Unsupported question registry version.")
    hazards = {hazard["id"] for hazard in catalog["hazards"]}
    conditions = {condition["id"] for condition in catalog["conditions"]}
    sources = {source["id"] for source in catalog["sources"]}
    domains = {}
    for domain in registry["domains"]:
        if domain["id"] in domains:
            raise ValueError("Duplicate question domain.")
        if not set(domain["hazard_ids"]) <= hazards or not set(domain["condition_ids"]) <= conditions:
            raise ValueError(f"Domain {domain['id']} has an unresolved NASA reference.")
        if "promote_if" in domain:
            _validate_condition(domain["promote_if"], set(), f"Domain {domain['id']}")
        domains[domain["id"]] = domain
    if registry["domains"][0]["id"] != SAFETY_DOMAIN:
        raise ValueError("The safety screen must be the first domain.")
    seen: set[str] = set()
    for question in registry["questions"]:
        where = f"Question {question.get('id')}"
        if not question.get("id") or question["id"] in seen:
            raise ValueError(f"{where}: identifiers must be unique.")
        if question["domain"] not in domains or question["input"] not in INPUT_TYPES or not question.get("text"):
            raise ValueError(f"{where}: unknown domain, input type or empty text.")
        if question["input"] in {"scale", "choice"} and len(question.get("options", [])) < 2:
            raise ValueError(f"{where}: choice questions need at least two options.")
        if question["input"] == "number":
            limits = question.get("validation", {})
            if not isinstance(limits.get("min"), (int, float)) or not isinstance(limits.get("max"), (int, float)):
                raise ValueError(f"{where}: number questions need min and max.")
        if not question.get("evidence_ids") or not set(question["evidence_ids"]) <= sources:
            raise ValueError(f"{where}: every question needs a resolvable source.")
        if "show_if" in question:
            _validate_condition(question["show_if"], seen, where)
        if question.get("parent") and question["parent"] not in seen:
            raise ValueError(f"{where}: the parent must be an earlier question.")
        mapping = question.get("maps_to", {})
        if "symptoms" in mapping:
            for value, keys in mapping["symptoms"].items():
                if value not in option_values(question) or not set(keys) <= set(SYMPTOMS):
                    raise ValueError(f"{where}: answers must map to known observations.")
        elif "field" in mapping:
            if mapping["field"] not in CHECKIN_FIELDS:
                raise ValueError(f"{where}: unknown check-in field.")
        elif not question.get("note_label"):
            raise ValueError(f"{where}: an answer must map to an observation, a field or a note.")
        is_safety = question["domain"] == SAFETY_DOMAIN
        if is_safety and (not question.get("required") or not question.get("urgent") or "show_if" in question
                          or question["input"] != "boolean" or question.get("allow_unsure") or question.get("allow_skip")):
            # The universal safety screen is never conditional and never skippable.
            raise ValueError(f"{where}: safety questions must be unconditional, required yes/no items.")
        if question.get("required") and question.get("allow_skip"):
            raise ValueError(f"{where}: a required question cannot be skipped.")
        seen.add(question["id"])
    urgent_keys = {key for question in registry["questions"] if question["domain"] == SAFETY_DOMAIN
                   for keys in question["maps_to"]["symptoms"].values() for key in keys}
    from astrotip.analysis.rules import OBSERVATION_RULES
    if urgent_keys != {key for key, (_condition, level) in OBSERVATION_RULES.items() if level == "urgent"}:
        raise ValueError("The safety screen must cover every urgent observation in the assessment rules.")


def condition_met(condition, mission: dict, answers: dict) -> bool:
    if not condition:
        return True
    operator, body = next(iter(condition.items()))
    if operator == "all":
        return all(condition_met(child, mission, answers) for child in body)
    if operator == "any":
        return any(condition_met(child, mission, answers) for child in body)
    if operator == "answer":
        return answers.get(body["question"]) in body["in"]
    value = mission.get(body["field"])
    return value == body["equals"] if "equals" in body else value in body["in"]


def domain_order(registry: dict, mission: dict, hazard_order: list[str]) -> list[str]:
    """Safety first, then domains promoted by mission context, then by hazard emphasis."""
    def rank(item):
        index, domain = item
        if domain["id"] == SAFETY_DOMAIN:
            return (0, 0, index)
        if "promote_if" in domain and condition_met(domain["promote_if"], mission, {}):
            return (1, 0, index)
        positions = [hazard_order.index(hazard) for hazard in domain["hazard_ids"] if hazard in hazard_order]
        return (2, min(positions, default=len(hazard_order)), index)
    return [domain["id"] for _index, domain in sorted(enumerate(registry["domains"]), key=rank)]


def applicable_answers(registry: dict, mission: dict, answers: dict) -> dict:
    """Keep only answers whose question is still shown.

    Questions are evaluated in registry order against the answers kept so far,
    so changing an earlier answer removes follow-ups that no longer apply.
    """
    kept: dict = {}
    for question in registry["questions"]:
        if question["id"] in answers and condition_met(question.get("show_if"), mission, kept):
            kept[question["id"]] = answers[question["id"]]
    return kept


def visible_questions(registry: dict, mission: dict, answers: dict, hazard_order: list[str]) -> list[dict]:
    """Questions to ask for this mission and these answers, in presentation order."""
    kept = applicable_answers(registry, mission, answers)
    order = {domain_id: index for index, domain_id in enumerate(domain_order(registry, mission, hazard_order))}
    shown = [question for question in registry["questions"] if condition_met(question.get("show_if"), mission, kept)]
    return sorted(shown, key=lambda question: order[question["domain"]])  # Stable: registry order within a domain.


def validate_answer(question: dict, value) -> None:
    """Raise ValueError unless `value` is an allowed answer for `question`."""
    if value == UNSURE and question.get("allow_unsure"):
        return
    if value == SKIPPED and question.get("allow_skip"):
        return
    if question["input"] == "number":
        limits = question["validation"]
        if isinstance(value, bool) or not isinstance(value, (int, float)) or not limits["min"] <= value <= limits["max"]:
            raise ValueError(f"Enter a number from {limits['min']} to {limits['max']} for: {question['text']}")
        return
    if value not in option_values(question):
        raise ValueError(f"Unsupported answer for: {question['text']}")
