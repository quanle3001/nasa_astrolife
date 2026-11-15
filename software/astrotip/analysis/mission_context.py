"""Mission context: which NASA hazards to present first, and the mission profile.

The mission changes what AstroLife explains first and which routine questions
come first. It is presentation context only: it is never an input to the
assessment rules and never changes a finding.
"""

from __future__ import annotations

import json
from pathlib import Path

CONTEXT_PATH = Path(__file__).resolve().parents[2] / "resources" / "mission_context.json"
HAZARD_IDS = ("radiation", "isolation", "distance", "gravity", "environment")
MAX_MISSION_DAY = 2000


def load_mission_context(catalog: dict, path: str | Path | None = None) -> dict:
    """Read the mission context and check it against the NASA catalog."""
    with Path(path or CONTEXT_PATH).open(encoding="utf-8") as handle:
        context = json.load(handle)
    validate_mission_context(context, catalog)
    return context


def validate_mission_context(context: dict, catalog: dict) -> None:
    if context.get("schema_version") != 1:
        raise ValueError("Unsupported mission context version.")
    source_ids = {source["id"] for source in catalog["sources"]}
    phase_ids = {phase["id"] for phase in context["phases"]}
    if set(context["hazards"]) != set(HAZARD_IDS):
        raise ValueError("Mission context must describe all five NASA hazards.")
    for hazard_id, hazard in context["hazards"].items():
        for key in ("summary", "why_it_matters", "limits"):
            if not isinstance(hazard.get(key), str) or not hazard[key].strip():
                raise ValueError(f"Hazard {hazard_id} is missing {key}.")
        if not hazard["source_ids"] or not set(hazard["source_ids"]) <= source_ids:
            raise ValueError(f"Hazard {hazard_id} has an unresolved source.")
    if set(context["missions"]) != {"leo", "lunar", "mars"}:
        raise ValueError("Mission context must cover LEO, lunar and Mars missions.")
    for mission_id, mission in context["missions"].items():
        # Every hazard stays visible for every mission; only the order differs.
        if sorted(mission["hazard_order"]) != sorted(HAZARD_IDS):
            raise ValueError(f"Mission {mission_id} must list each hazard exactly once.")
        if not mission["phases"] or not set(mission["phases"]) <= phase_ids:
            raise ValueError(f"Mission {mission_id} has an unknown phase.")
        for hazard_id, emphasis in mission["emphasis"].items():
            if hazard_id not in HAZARD_IDS or not emphasis.get("rationale", "").strip():
                raise ValueError(f"Mission {mission_id} has an invalid emphasis entry.")
            if not emphasis["source_ids"] or not set(emphasis["source_ids"]) <= source_ids:
                raise ValueError(f"Mission {mission_id} emphasis needs a NASA source.")


def default_profile() -> dict:
    return {"environment": "leo", "phase": "orbit", "mission_day": None,
            "eva_recent": False, "gravity_transition_recent": False}


def validate_profile(profile: dict, context: dict) -> dict:
    """Return a clean mission profile or raise ValueError with a readable reason."""
    if not isinstance(profile, dict):
        raise ValueError("Mission profile must be an object.")
    unknown = set(profile) - set(default_profile())
    if unknown:
        raise ValueError("The mission profile contains unsupported fields.")
    clean = {**default_profile(), **profile}
    mission = context["missions"].get(clean["environment"])
    if mission is None:
        raise ValueError("Choose a supported mission.")
    if clean["phase"] not in mission["phases"]:
        raise ValueError("Choose a mission phase that applies to this mission.")
    day = clean["mission_day"]
    if day is not None and (isinstance(day, bool) or not isinstance(day, int) or not 1 <= day <= MAX_MISSION_DAY):
        raise ValueError(f"Mission day must be a whole number from 1 to {MAX_MISSION_DAY}, or left blank.")
    for key in ("eva_recent", "gravity_transition_recent"):
        if type(clean[key]) is not bool:
            raise ValueError("Mission context answers must be yes or no.")
    return clean
