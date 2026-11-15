"""NASA Human Research Roadmap evidence reports matched to AstroLife's health topics.

Source: https://humanresearchroadmap.nasa.gov/evidence/

The reports are the Human Research Program's review of what is known about
each risk. They strengthen the explanation of why a topic is asked about; they
never set an individual diagnosis, threshold or treatment.
"""

from __future__ import annotations

import json
from pathlib import Path
from urllib.parse import urlparse

EVIDENCE_PATH = Path(__file__).resolve().parents[2] / "resources" / "hrr_evidence.json"
HRR_HOST = "humanresearchroadmap.nasa.gov"


def load_hrr_evidence(catalog: dict, path: str | Path | None = None) -> dict:
    with Path(path or EVIDENCE_PATH).open(encoding="utf-8") as handle:
        evidence = json.load(handle)
    validate_hrr_evidence(evidence, catalog)
    return evidence


def validate_hrr_evidence(evidence: dict, catalog: dict) -> None:
    """Every health topic needs at least one report, and every link must be the Roadmap's own."""
    if evidence.get("schema_version") != 1 or not evidence.get("reviewed_on"):
        raise ValueError("Unsupported evidence report list.")
    if set(evidence["conditions"]) != {condition["id"] for condition in catalog["conditions"]}:
        raise ValueError("Evidence reports must cover exactly the catalog's health topics.")
    for condition_id, reports in evidence["conditions"].items():
        if not reports:
            raise ValueError(f"No evidence report listed for {condition_id}.")
        for report in reports:
            if isinstance(report.get("risk_id"), bool) or not isinstance(report.get("risk_id"), int):
                raise ValueError(f"Evidence report for {condition_id} has no Roadmap risk id.")
            if not report.get("risk_title", "").strip() or not report.get("report_title", "").strip():
                raise ValueError(f"Evidence report for {condition_id} is missing a title.")
            for key in ("risk_url", "report_url"):
                parsed = urlparse(report.get(key, ""))
                if parsed.scheme != "https" or parsed.hostname != HRR_HOST:
                    raise ValueError(f"Evidence links for {condition_id} must point to the Human Research Roadmap.")
            if not report["risk_url"].endswith(f"?i={report['risk_id']}"):
                raise ValueError(f"Evidence report for {condition_id} has a risk link that does not match its id.")
