"""Historical space-radiation measurements from the NASA OSDR RadLab data API.

API: https://visualization.osdr.nasa.gov/radlab/api/
Documentation (GUI): https://visualization.osdr.nasa.gov/radlab/gui/data-api/

Pipeline: Retrieve -> Validate -> Clean -> Analyze -> Store -> Explain.

  Retrieve  one bounded window of one measurement (`fetch`)
  Validate  every row with the Pydantic model `RadLabReading` (`parse`)
  Clean     with pandas: drop exact duplicate rows, order by instrument and
            time; values are never altered (`clean`)
  Analyze   descriptive statistics with pandas and NumPy (`radlab_analysis`)
  Store     verified cache with provenance and checksums (`write_cache`)
  Explain   plain statements of what was found, plus limits (`radlab_analysis.describe`)

Original timestamps and instrument ids are preserved throughout.

What this data is: dose-rate readings from instruments on past and current
missions (space station, lunar orbit, Mars orbit, Mars surface).
What it is not: the astronaut's own exposure, live telemetry, or a dose total.

Units: the API response has three columns (timestamp, instrument_id, value)
and no unit field, and the RadLab documentation pages returned HTTP 500 when
this was written. The unit is therefore recorded as unknown (`UNIT = None`)
and shown that way; set it only from RadLab's own documentation.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
import csv
import hashlib
import io
import json
import math
import os
from pathlib import Path
import tempfile
import urllib.error
import urllib.parse
import urllib.request

import pandas as pd
from pydantic import TypeAdapter, ValidationError

from astrotip.nasa.models import RadLabDataset, RadLabReading

API_URL = "https://visualization.osdr.nasa.gov/radlab/api/"
DOCS_URL = "https://visualization.osdr.nasa.gov/radlab/gui/data-api/"
MEASUREMENT = "absorbed_dose_rate"
#: Unit of the measurement as documented by RadLab; None while unverified.
UNIT: str | None = None
#: One UTC day keeps the request small and the same for every user.
WINDOW_START = "2023-01-01"
WINDOW_DAYS = 1
EXPECTED_HEADER = ["timestamp", "instrument_id", MEASUREMENT]
#: A full day currently holds about 5,400 rows; far more means something is wrong.
MAX_ROWS = 50_000
MAX_BYTES = 8_000_000
TIMEOUT_SECONDS = 15
CACHE_SCHEMA = 2
#: Version of the retrieve-validate-clean steps; bump when they change.
PIPELINE_VERSION = "radlab-pipeline-1.1"
_READINGS = TypeAdapter(list[RadLabReading])
USER_AGENT = "AstroLife-educational-prototype/0.2 (NASA Space Apps 2026)"

RESOURCES = Path(__file__).resolve().parents[2] / "resources"
BUNDLED_CACHE = RESOURCES / "nasa_cache" / f"radlab_{MEASUREMENT}_{WINDOW_START}.json"
INSTRUMENTS_PATH = RESOURCES / "radlab_instruments.json"


class RadLabError(ValueError):
    """The response or cache could not be trusted; the message says why."""


def window() -> tuple[str, str]:
    start = datetime.strptime(WINDOW_START, "%Y-%m-%d")
    return WINDOW_START, (start + timedelta(days=WINDOW_DAYS)).strftime("%Y-%m-%d")


def request_url() -> str:
    """The exact bounded request. Hyphenated instrument ids cannot be used in
    the API's query expression, so the window is filtered by time only."""
    start, end = window()
    query = f"timestamp>={start} AND timestamp<{end}"
    # The API's column parameter is written literally as "columns+="; percent-encoding
    # the plus sign makes the server answer HTTP 500, so only the query value is encoded.
    return f"{API_URL}?query={urllib.parse.quote(query, safe='')}&columns+={MEASUREMENT}"


def fetch(opener=urllib.request.urlopen) -> str:
    """Download the dataset as CSV text. Raises RadLabError on any failure."""
    request = urllib.request.Request(request_url(), headers={"User-Agent": USER_AGENT, "Accept": "text/csv"})
    try:
        with opener(request, timeout=TIMEOUT_SECONDS) as response:
            status = getattr(response, "status", 200)
            body = response.read(MAX_BYTES + 1)
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        raise RadLabError(f"NASA RadLab could not be reached: {getattr(exc, 'reason', exc)}") from exc
    if status != 200:
        raise RadLabError(f"NASA RadLab answered with HTTP {status}.")
    if len(body) > MAX_BYTES:
        raise RadLabError("NASA RadLab returned more data than the bounded request allows.")
    try:
        return body.decode("utf-8")
    except UnicodeDecodeError as exc:
        raise RadLabError("NASA RadLab returned text that is not UTF-8.") from exc


def read_rows(text: str) -> list[RadLabReading]:
    """Validate the CSV response into typed readings.

    Every row must have a readable timestamp inside the requested window, a
    non-empty instrument id and a finite, non-negative value. One bad row
    rejects the whole response: a partly trusted dataset is not shown as NASA data.
    """
    reader = csv.reader(io.StringIO(text))
    try:
        header = next(reader)
    except StopIteration as exc:
        raise RadLabError("NASA RadLab returned an empty response.") from exc
    if [name.strip() for name in header] != EXPECTED_HEADER:
        raise RadLabError("NASA RadLab returned unexpected columns; the response was not used.")
    raw = []
    for row in reader:
        if not row:
            continue
        if len(raw) >= MAX_ROWS:
            raise RadLabError("NASA RadLab returned more rows than the bounded request allows.")
        if len(row) != 3:
            raise RadLabError(f"Row {len(raw) + 1} does not have three values.")
        raw.append({"timestamp": row[0].strip(), "instrument_id": row[1].strip(), "value": row[2].strip()})
    try:
        readings = _READINGS.validate_python(raw)
    except ValidationError as exc:
        first = exc.errors()[0]
        raise RadLabError(f"Row {first['loc'][0] + 1} failed validation ({first['loc'][-1]}): {first['msg']}.") from exc
    if not readings:
        raise RadLabError("NASA RadLab returned no measurements for the requested window.")
    start, end = (datetime.strptime(day, "%Y-%m-%d") for day in window())
    for number, reading in enumerate(readings, start=1):
        if not start <= reading.moment < end:
            raise RadLabError(f"Row {number} is outside the requested time window.")
    return readings


def clean(readings: list[RadLabReading]) -> tuple[dict[str, dict[str, list]], list[str]]:
    """Order the readings and remove exact duplicates with pandas.

    Returns the per-instrument series and the list of steps taken. No value,
    timestamp or instrument id is changed, rounded, filled in or removed for
    being unusual; irregular readings are reported by the analysis instead.
    """
    frame = pd.DataFrame({
        "timestamp": [reading.timestamp for reading in readings],
        "instrument_id": [reading.instrument_id for reading in readings],
        "value": [reading.value for reading in readings],
        "moment": pd.to_datetime([reading.moment for reading in readings]),
    })
    steps = [f"Validated {len(frame)} rows from the API response with the RadLabReading model."]
    deduplicated = frame.drop_duplicates(subset=["timestamp", "instrument_id", "value"])
    removed = len(frame) - len(deduplicated)
    steps.append(f"Removed {removed} exact duplicate row(s)." if removed else "No exact duplicate rows found.")
    for instrument, group in deduplicated.groupby("instrument_id", sort=False):
        if not group["moment"].is_monotonic_increasing:
            raise RadLabError(f"Measurements for {instrument} are not in time order.")
    ordered = deduplicated.sort_values(["instrument_id", "moment"], kind="stable")
    steps.append("Grouped by instrument id and kept the published time order.")
    steps.append("Kept every value, timestamp and instrument id exactly as published; nothing was filled in, rounded or dropped as an outlier.")
    instruments = {
        str(instrument): {"timestamps": group["timestamp"].tolist(), "values": [float(value) for value in group["value"]]}
        for instrument, group in ordered.groupby("instrument_id", sort=True)
    }
    return instruments, steps


def parse(text: str) -> dict[str, dict[str, list]]:
    """Validated and cleaned readings grouped by instrument."""
    return clean(read_rows(text))[0]


def _fingerprint(instruments: dict) -> str:
    """SHA-256 of the canonical measurement data, used to detect a damaged cache."""
    canonical = json.dumps(instruments, sort_keys=True, separators=(",", ":"), allow_nan=False)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def build_dataset(text: str, retrieved_at: str | None = None) -> dict:
    """Parse a response and attach the provenance stored with it."""
    instruments, steps = clean(read_rows(text))
    start, end = window()
    return {
        "schema_version": CACHE_SCHEMA,
        "provider": "NASA Open Science Data Repository (OSDR) · RadLab",
        "api_url": API_URL,
        "documentation_url": DOCS_URL,
        "request_url": request_url(),
        "measurement": MEASUREMENT,
        "unit": UNIT,
        "unit_note": ("RadLab's API response carries no unit field and its documentation was unavailable "
                      "when this dataset was retrieved, so the unit is not stated here."
                      if UNIT is None else "Unit as documented by RadLab."),
        "window_start": start,
        "window_end": end,
        "timestamp_note": "Timestamps are shown exactly as published by RadLab, which does not state a time zone.",
        "retrieved_at": retrieved_at or datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "response_sha256": hashlib.sha256(text.encode("utf-8")).hexdigest(),
        "data_sha256": _fingerprint(instruments),
        "row_count": sum(len(series["values"]) for series in instruments.values()),
        "pipeline_version": PIPELINE_VERSION,
        "transformation_steps": steps,
        "limitations": [
            "Historical readings from instruments on past and current missions.",
            "Not your radiation exposure, not live telemetry and not a cumulative dose.",
            "Instruments differ in location, shielding and method, so their values are not directly comparable.",
        ],
        "instruments": instruments,
    }


def verify_dataset(dataset: dict) -> dict:
    """Return the dataset if it is intact; raise RadLabError otherwise.

    The structure is checked with the `RadLabDataset` model and the readings
    against the stored checksum, so an edited or damaged cache is refused.
    """
    try:
        model = RadLabDataset.model_validate(dataset)
    except ValidationError as exc:
        raise RadLabError("The cached NASA dataset is incomplete or has an unsupported format.") from exc
    if model.schema_version != CACHE_SCHEMA or model.measurement != MEASUREMENT:
        raise RadLabError("The cached NASA dataset has an unsupported format.")
    if _fingerprint(dataset["instruments"]) != model.data_sha256:
        raise RadLabError("The cached NASA dataset failed its integrity check.")
    return dataset


def load_cache(path: Path) -> dict:
    try:
        with Path(path).open(encoding="utf-8") as handle:
            return verify_dataset(json.load(handle))
    except (OSError, json.JSONDecodeError) as exc:
        raise RadLabError("The cached NASA dataset could not be read.") from exc


def write_cache(dataset: dict, path: Path) -> None:
    """Write atomically so an interrupted save never leaves a half-written cache."""
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    handle, temporary = tempfile.mkstemp(dir=path.parent, suffix=".tmp")
    try:
        with os.fdopen(handle, "w", encoding="utf-8") as stream:
            json.dump(dataset, stream, separators=(",", ":"), allow_nan=False)
        os.replace(temporary, path)
    except BaseException:
        Path(temporary).unlink(missing_ok=True)
        raise


def load_instruments(path: Path = INSTRUMENTS_PATH) -> dict:
    with Path(path).open(encoding="utf-8") as handle:
        info = json.load(handle)
    if info.get("schema_version") != 1 or set(info["preferred"]) != {"leo", "lunar", "mars"}:
        raise ValueError("Unsupported RadLab instrument notes.")
    return info


def summarize(dataset: dict) -> dict:
    """Per-instrument count, range and median, computed from the stored values."""
    summary = {}
    for instrument, series in dataset["instruments"].items():
        values = sorted(series["values"])
        middle = len(values) // 2
        median = values[middle] if len(values) % 2 else (values[middle - 1] + values[middle]) / 2
        summary[instrument] = {
            "count": len(values), "minimum": values[0], "maximum": values[-1], "median": median,
            "first_timestamp": series["timestamps"][0], "last_timestamp": series["timestamps"][-1],
        }
    return summary


class RadLabService:
    """Serves the newest verified dataset and refreshes it from NASA on request.

    `user_cache` holds a dataset retrieved on this computer; `bundled_cache`
    is the verified snapshot shipped with the app for offline use.
    """

    def __init__(self, user_cache: Path, bundled_cache: Path = BUNDLED_CACHE, fetcher=fetch):
        self.user_cache = Path(user_cache)
        self.bundled_cache = Path(bundled_cache)
        self.fetcher = fetcher
        self.instrument_notes = load_instruments()

    def _package(self, dataset: dict, origin: str, error: str | None = None) -> dict:
        from astrotip.nasa.radlab_analysis import analyze  # Local import: the analysis builds on this module.
        return {
            "available": True, "origin": origin, "error": error,
            "dataset": dataset, "summary": summarize(dataset), "instrument_notes": self.instrument_notes,
            "analysis": analyze(dataset, self.instrument_notes),
        }

    def cached(self, error: str | None = None) -> dict:
        """Newest intact cache, or an explicit 'unavailable' answer. Never invented data."""
        candidates = []
        for origin, path in (("retrieved_on_this_computer", self.user_cache), ("bundled_snapshot", self.bundled_cache)):
            try:
                candidates.append((origin, load_cache(path)))
            except RadLabError:
                continue
        if not candidates:
            return {"available": False, "origin": "none", "dataset": None, "summary": {}, "analysis": None, "instrument_notes": self.instrument_notes,
                    "error": error or "No verified NASA radiation dataset is available offline."}
        origin, dataset = max(candidates, key=lambda item: item[1]["retrieved_at"])
        return self._package(dataset, origin, error)

    def refresh(self) -> dict:
        """Retrieve from NASA now. On any failure the verified cache is returned with the reason."""
        try:
            dataset = build_dataset(self.fetcher())
        except RadLabError as exc:
            return self.cached(error=str(exc))
        try:
            write_cache(dataset, self.user_cache)
        except OSError:
            pass  # Showing fresh data matters more than caching it.
        return self._package(dataset, "live")
