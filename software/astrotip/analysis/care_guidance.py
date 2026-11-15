"""Plain-language self-care steps and measurement instructions.

The steps live in `resources/care_guidance.json`. Each one restates guidance
from a cited source: a NASA Human Research Program risk page, MedlinePlus or
the FDA. The rules attach them to a non-urgent prompt so the astronaut sees
what they can do themselves before, or while, involving the crew medical
officer. Nothing here is a prescription, and urgent prompts never carry
self-care steps: the emergency action stands alone.
"""

from __future__ import annotations

import json
from pathlib import Path

from astrotip.models.health_indicator import SYMPTOMS

GUIDANCE_PATH = Path(__file__).resolve().parents[2] / "resources" / "care_guidance.json"
#: Triggers that are not a reported symptom.
RULE_TRIGGERS = {"low_sleep", "missed_exercise", "heart_rate_outside_reference", "poor_signal"}
INDICATORS = {"heart_rate", "spo2"}


def validate_care_guidance(guidance: dict, catalog: dict) -> None:
    """Every step needs text and a source that exists in the catalog."""
    if guidance.get("schema_version") != 1 or not guidance.get("reviewed_on"):
        raise ValueError("Unsupported care guidance file.")
    sources = {source["id"] for source in catalog["sources"]}

    def check(step: dict, where: str) -> None:
        if not isinstance(step.get("text"), str) or not step["text"].strip():
            raise ValueError(f"Care guidance {where}: a step has no text.")
        if not step.get("source_ids") or not set(step["source_ids"]).issubset(sources):
            raise ValueError(f"Care guidance {where}: every step needs a source from the catalog.")

    measurement = guidance["measurement"]
    if not measurement["steps"]:
        raise ValueError("Care guidance: measurement instructions are missing.")
    for step in measurement["steps"]:
        check(step, "measurement")
    if {item["indicator"] for item in measurement["meaning"]} != INDICATORS:
        raise ValueError("Care guidance: explain exactly the indicators the sensor measures.")
    for item in measurement["meaning"]:
        check(item, f"meaning of {item['indicator']}")
    for trigger, entry in guidance["triggers"].items():
        if trigger not in SYMPTOMS and trigger not in RULE_TRIGGERS:
            raise ValueError(f"Care guidance: unknown trigger {trigger!r}.")
        if not entry.get("self_care"):
            raise ValueError(f"Care guidance {trigger}: no steps.")
        for step in entry["self_care"]:
            check(step, trigger)


def load_care_guidance(catalog: dict, path: str | Path | None = None) -> dict:
    with Path(path or GUIDANCE_PATH).open(encoding="utf-8") as handle:
        guidance = json.load(handle)
    validate_care_guidance(guidance, catalog)
    return guidance


def steps_for(guidance: dict, trigger: str) -> list[dict]:
    """Self-care steps for one trigger; an unknown trigger has none."""
    return guidance["triggers"].get(trigger, {}).get("self_care", [])
