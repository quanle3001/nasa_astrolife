"""Study records from the NASA OSDR Biological Data API.

API: https://visualization.osdr.nasa.gov/biodata/api/ (OpenAPI 3.1, version 2.0.0)
Endpoint used: GET /v2/dataset/{accession}/

Pipeline: Retrieve -> Validate -> Clean -> Store -> Explain.

  Retrieve  one study record by its accession (`fetch`)
  Validate  the fields AstroLife shows with the Pydantic model `OsdrStudy` (`build_study`)
  Clean     whitespace only; names, dates and text are kept as NASA reports them
  Store     verified cache with the request URL, retrieval time and a checksum (`write_cache`)
  Explain   why the study is shown, from `resources/osdr_studies.json` (`load_studies`)

There is no "Analyze" step: this is study metadata, not measurements. AstroLife
does not download or interpret the study's omics data.

What this is: a pointer to a real, open NASA space-biology study that relates
to a health topic. What it is not: human medical data, a measurement of the
astronaut, or an input to any rule.

Refreshing the bundled cache is a developer step:

    python -m astrotip.nasa.osdr --refresh
"""

from __future__ import annotations

from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import re
import sys
import urllib.error
import urllib.request

from pydantic import BaseModel, ConfigDict, ValidationError, field_validator

from astrotip.nasa.radlab import USER_AGENT, write_cache

API_URL = "https://visualization.osdr.nasa.gov/biodata/api/v2/"
DOCS_URL = "https://visualization.osdr.nasa.gov/biodata/api/"
STUDY_PAGE = "https://osdr.nasa.gov/bio/repo/data/studies/{accession}"
PIPELINE_VERSION = "osdr-study-1.0"
CACHE_SCHEMA = 1
MAX_BYTES = 2_000_000
TIMEOUT_SECONDS = 15
ACCESSION = re.compile(r"^OSD-\d{1,5}$")

RESOURCES = Path(__file__).resolve().parents[2] / "resources"
STUDIES_PATH = RESOURCES / "osdr_studies.json"
CACHE_DIR = RESOURCES / "nasa_cache"


class OsdrError(ValueError):
    """The response or cache could not be trusted; the message says why."""


class OsdrStudy(BaseModel):
    """The fields of one OSDR study that AstroLife displays."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    accession: str
    title: str
    organism: str
    #: Tissue or material sampled, as NASA reports it.
    material: str
    factors: list[str]
    project_title: str = ""
    project_identifier: str = ""
    flight_program: str = ""
    mission_name: str = ""
    #: Mission dates exactly as reported by the API (month/day/two-digit year).
    mission_start: str = ""
    mission_end: str = ""
    assay_types: list[str] = []
    measurement_types: list[str] = []
    managing_center: str = ""
    #: Public release date (UTC, ISO 8601 date); empty if the API gives none.
    released: str = ""
    description: str = ""
    study_url: str

    @field_validator("accession")
    @classmethod
    def _known_shape(cls, accession: str) -> str:
        if not ACCESSION.fullmatch(accession):
            raise ValueError("not an OSDR accession")
        return accession

    @field_validator("title", "organism", "material")
    @classmethod
    def _present(cls, text: str) -> str:
        if not text.strip():
            raise ValueError("a required field is empty")
        return text


def request_url(accession: str) -> str:
    if not ACCESSION.fullmatch(accession):
        raise OsdrError(f"{accession!r} is not an OSDR accession.")
    return f"{API_URL}dataset/{accession}/"


def fetch(accession: str, opener=urllib.request.urlopen) -> str:
    """Download one study record as JSON text. Raises OsdrError on any failure."""
    request = urllib.request.Request(request_url(accession), headers={"User-Agent": USER_AGENT, "Accept": "application/json"})
    try:
        with opener(request, timeout=TIMEOUT_SECONDS) as response:
            status = getattr(response, "status", 200)
            body = response.read(MAX_BYTES + 1)
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        raise OsdrError(f"NASA OSDR could not be reached: {getattr(exc, 'reason', exc)}") from exc
    if status != 200:
        raise OsdrError(f"NASA OSDR answered with HTTP {status}.")
    if len(body) > MAX_BYTES:
        raise OsdrError("NASA OSDR returned more data than expected for one study.")
    try:
        return body.decode("utf-8")
    except UnicodeDecodeError as exc:
        raise OsdrError("NASA OSDR returned text that is not UTF-8.") from exc


def _text(value) -> str:
    return " ".join(value.split()) if isinstance(value, str) else ""


def _texts(value) -> list[str]:
    """The API gives one string or a list of strings for the same field."""
    items = value if isinstance(value, list) else [value]
    return [text for text in (_text(item) for item in items) if text]


def _release_date(value) -> str:
    if isinstance(value, bool) or not isinstance(value, (int, float)) or value <= 0:
        return ""
    return datetime.fromtimestamp(value, timezone.utc).date().isoformat()


def _fingerprint(study: dict) -> str:
    return hashlib.sha256(json.dumps(study, sort_keys=True, separators=(",", ":")).encode("utf-8")).hexdigest()


def build_study(text: str, accession: str, retrieved_at: str | None = None) -> dict:
    """Validate a raw API response and wrap the displayed fields with provenance."""
    try:
        metadata = json.loads(text)[accession]["metadata"]
    except (json.JSONDecodeError, KeyError, TypeError) as exc:
        raise OsdrError("NASA OSDR returned a record in an unexpected format.") from exc
    if not isinstance(metadata, dict):
        raise OsdrError("NASA OSDR returned a record in an unexpected format.")
    mission = metadata.get("mission") if isinstance(metadata.get("mission"), dict) else {}
    try:
        study = OsdrStudy(
            accession=_text(metadata.get("accession")),
            title=_text(metadata.get("study title")),
            organism=_text(metadata.get("organism")),
            material=_text(metadata.get("material type")),
            factors=_texts(metadata.get("study factor name")),
            project_title=_text(metadata.get("project title")),
            project_identifier=_text(metadata.get("project identifier")),
            flight_program=_text(metadata.get("flight program")),
            mission_name=_text(mission.get("name")),
            mission_start=_text(mission.get("start date")),
            mission_end=_text(mission.get("end date")),
            assay_types=_texts(metadata.get("study assay technology type")),
            measurement_types=_texts(metadata.get("study assay measurement type")),
            managing_center=_text(metadata.get("managing nasa center")),
            released=_release_date(metadata.get("study public release date")),
            description=_text(metadata.get("study description")),
            study_url=STUDY_PAGE.format(accession=accession),
        ).model_dump()
    except ValidationError as exc:
        raise OsdrError(f"The NASA OSDR record for {accession} is missing fields AstroLife needs.") from exc
    if study["accession"] != accession:
        raise OsdrError("NASA OSDR returned a different study than the one requested.")
    return {
        "schema": CACHE_SCHEMA, "pipeline_version": PIPELINE_VERSION,
        "source": "NASA Open Science Data Repository (OSDR) Biological Data API",
        "api_docs": DOCS_URL, "request_url": request_url(accession),
        "retrieved_at": retrieved_at or datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "sha256": _fingerprint(study), "study": study,
    }


def verify_record(record: dict) -> dict:
    """Check a cached record still says what was retrieved. Raises OsdrError otherwise."""
    try:
        if record["schema"] != CACHE_SCHEMA:
            raise OsdrError("The cached NASA study uses a different format.")
        study = OsdrStudy(**record["study"]).model_dump()
        datetime.fromisoformat(record["retrieved_at"])
        if not isinstance(record["request_url"], str) or not record["request_url"].startswith(API_URL):
            raise OsdrError("The cached NASA study does not say where it came from.")
        if _fingerprint(study) != record["sha256"]:
            raise OsdrError("The cached NASA study does not match its checksum.")
    except (KeyError, TypeError, ValueError, ValidationError) as exc:
        if isinstance(exc, OsdrError):
            raise
        raise OsdrError("The cached NASA study is incomplete or damaged.") from exc
    return record


def cache_path(accession: str, cache_dir: Path = CACHE_DIR) -> Path:
    return Path(cache_dir) / f"osdr_{accession}.json"


def load_cache(accession: str, cache_dir: Path = CACHE_DIR) -> dict:
    try:
        with cache_path(accession, cache_dir).open(encoding="utf-8") as handle:
            return verify_record(json.load(handle))
    except (OSError, json.JSONDecodeError) as exc:
        raise OsdrError(f"No cached NASA study record for {accession}.") from exc


def load_mapping(catalog: dict, path: Path = STUDIES_PATH) -> dict:
    """The curated list of studies and the health topic each one relates to."""
    with Path(path).open(encoding="utf-8") as handle:
        mapping = json.load(handle)
    known = {condition["id"] for condition in catalog["conditions"]}
    seen = set()
    for entry in mapping["studies"]:
        if not ACCESSION.fullmatch(entry["accession"]) or entry["accession"] in seen:
            raise ValueError(f"OSDR study list: bad or repeated accession {entry['accession']!r}")
        seen.add(entry["accession"])
        if not entry["condition_ids"] or set(entry["condition_ids"]) - known:
            raise ValueError(f"OSDR study {entry['accession']}: unknown health topic")
        if not entry["relevance"].strip():
            raise ValueError(f"OSDR study {entry['accession']}: say why it is shown")
    return mapping


def load_studies(catalog: dict, path: Path = STUDIES_PATH, cache_dir: Path = CACHE_DIR) -> dict:
    """Verified study records for the app. A study without a verified cache is
    listed as unavailable with the reason; it is never filled in by hand."""
    mapping = load_mapping(catalog, path)
    studies, unavailable = [], []
    for entry in mapping["studies"]:
        try:
            record = load_cache(entry["accession"], cache_dir)
        except OsdrError as exc:
            unavailable.append({"accession": entry["accession"], "reason": str(exc)})
            continue
        studies.append({**record["study"], "condition_ids": entry["condition_ids"], "relevance": entry["relevance"],
                        "provenance": {key: record[key] for key in ("source", "api_docs", "request_url", "retrieved_at", "sha256", "pipeline_version")}})
    return {"version": mapping["version"], "note": mapping["note"], "limitations": mapping["limitations"],
            "api_docs": DOCS_URL, "studies": studies, "unavailable": unavailable}


def refresh(accession: str, cache_dir: Path = CACHE_DIR, fetcher=fetch) -> dict:
    """Retrieve one study from NASA now and replace its cache."""
    record = build_study(fetcher(accession), accession)
    write_cache(record, cache_path(accession, cache_dir))
    return record


def main(argv: list[str]) -> int:
    if argv != ["--refresh"]:
        print(__doc__)
        return 2
    with STUDIES_PATH.open(encoding="utf-8") as handle:
        accessions = [entry["accession"] for entry in json.load(handle)["studies"]]
    for accession in accessions:
        try:
            record = refresh(accession)
        except OsdrError as exc:
            print(f"{accession}: not updated. {exc}")
            return 1
        print(f"{accession}: {record['study']['title']} (retrieved {record['retrieved_at']})")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
