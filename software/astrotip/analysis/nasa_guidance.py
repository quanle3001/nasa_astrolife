"""Load the versioned, offline NASA evidence catalog independently of the UI."""

import json
from pathlib import Path
from urllib.parse import urlparse


CATALOG_PATH = Path(__file__).resolve().parents[2] / "resources" / "nasa_sources.json"
CONDITION_IDS = frozenset({
    "hypoxia", "cardiovascular", "fitness", "bone", "sans", "vestibular", "sleep",
    "behavioral", "immune", "nutrition", "eva", "radiation", "medical_support",
})


def load_catalog(path: str | Path | None = None) -> dict:
    """Read and validate references so missing evidence fails visibly at startup."""
    with Path(path or CATALOG_PATH).open(encoding="utf-8") as handle:
        catalog = json.load(handle)
    validate_catalog(catalog)
    return catalog


def validate_catalog(catalog: dict) -> None:
    if catalog.get("schema_version") != 1:
        raise ValueError("Unsupported NASA catalog version.")
    for key in ("reviewed_on", "scope", "priority_note"):
        if not isinstance(catalog.get(key), str) or not catalog[key].strip():
            raise ValueError(f"NASA catalog is missing {key}.")
    sources = catalog["sources"]
    source_ids = {s["id"] for s in sources}
    if len(source_ids) != len(sources):
        raise ValueError("Duplicate source identifiers.")
    for source in sources:
        parsed = urlparse(source["url"])
        if parsed.scheme != "https" or not parsed.hostname or not source["title"]:
            raise ValueError("Sources must have a title and an HTTPS URL.")
    hazards = {h["id"] for h in catalog["hazards"]}
    if hazards != {"radiation", "isolation", "distance", "gravity", "environment"}:
        raise ValueError("NASA catalog must cover all five hazards.")
    conditions = catalog["conditions"]
    if {c["id"] for c in conditions} != CONDITION_IDS or len(conditions) != len(CONDITION_IDS):
        raise ValueError("NASA catalog has incomplete or duplicate health risk coverage.")
    for condition in conditions:
        for key in ("title", "why_it_matters", "priority_rationale", "monitoring", "limitations"):
            if not isinstance(condition.get(key), str) or not condition[key].strip():
                raise ValueError(f"Missing {key} for {condition['id']}.")
        if not condition["hazard_ids"] or not set(condition["hazard_ids"]).issubset(hazards):
            raise ValueError("Unresolved hazard reference.")
        if not condition["countermeasures"]:
            raise ValueError("Each condition requires actionable guidance.")
        for entry in [condition, *condition["countermeasures"], *condition["research"]]:
            if not entry["source_ids"] or not set(entry["source_ids"]).issubset(source_ids):
                raise ValueError(f"Unresolved source for {condition['id']}.")
        for entry in condition["countermeasures"]:
            if not entry["text"] or not entry["evidence"]:
                raise ValueError("Countermeasures must state their evidence status.")
        if any(not entry["text"] for entry in condition["research"]):
            raise ValueError("Research summaries must not be empty.")
