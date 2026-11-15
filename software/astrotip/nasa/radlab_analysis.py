"""Descriptive analysis of a verified RadLab dataset.

Everything here is computed from the retrieved readings: central values and
spread, how regularly each instrument reported, where readings are missing,
which readings stand far above the instrument's own typical level, and how the
level changed through the day. The analysis describes the dataset. It makes no
statement about cause, about health effects or about any person's exposure, and
instruments are never ranked against each other, because their location,
shielding and method differ.
"""

from __future__ import annotations

from datetime import datetime, timedelta
import math
from statistics import fmean, median, pstdev

#: A pause this many times longer than the instrument's usual interval counts as a gap.
GAP_FACTOR = 3.0
#: A reading this many times above the instrument's own median counts as an excursion.
EXCURSION_FACTOR = 3.0
MAX_LISTED = 5


def _percentile(ordered: list[float], fraction: float) -> float:
    """Linear-interpolated percentile of an already sorted list."""
    if len(ordered) == 1:
        return ordered[0]
    position = (len(ordered) - 1) * fraction
    lower = math.floor(position)
    upper = min(lower + 1, len(ordered) - 1)
    return ordered[lower] + (ordered[upper] - ordered[lower]) * (position - lower)


def _minutes(seconds: float) -> float:
    return round(seconds / 60, 1)


def analyze_series(timestamps: list[str], values: list[float], window_start: str, window_end: str) -> dict:
    """Statistics, cadence, gaps, irregular readings and hourly change for one instrument."""
    moments = [datetime.fromisoformat(timestamp).replace(tzinfo=None) for timestamp in timestamps]
    start = datetime.strptime(window_start, "%Y-%m-%d")
    end = datetime.strptime(window_end, "%Y-%m-%d")
    ordered = sorted(values)
    typical = median(ordered)
    intervals = [(later - earlier).total_seconds() for earlier, later in zip(moments, moments[1:])]
    cadence = median(intervals) if intervals else None

    gaps = []
    if cadence:
        threshold = cadence * GAP_FACTOR
        # The stretch before the first and after the last reading is checked like any other pause.
        edges = [start, *moments, end]
        for earlier, later in zip(edges, edges[1:]):
            seconds = (later - earlier).total_seconds()
            if seconds > threshold:
                gaps.append({"start": earlier.isoformat(), "end": later.isoformat(), "minutes": _minutes(seconds)})
    expected = round((end - start).total_seconds() / cadence) if cadence else None

    excursion_limit = typical * EXCURSION_FACTOR
    episodes, current = [], None
    for moment, value in zip(moments, values):
        if typical > 0 and value > excursion_limit:
            if current is None:
                current = {"start": moment.isoformat(), "end": moment.isoformat(), "readings": 0, "peak": value, "peak_at": moment.isoformat()}
                episodes.append(current)
            current["end"] = moment.isoformat()
            current["readings"] += 1
            if value > current["peak"]:
                current["peak"], current["peak_at"] = value, moment.isoformat()
        else:
            current = None

    buckets: list[list[float]] = [[] for _ in range(24)]
    for moment, value in zip(moments, values):
        buckets[min(23, int((moment - start).total_seconds() // 3600))].append(value)
    hourly_mean = [fmean(bucket) if bucket else None for bucket in buckets]
    filled = [(hour, value) for hour, value in enumerate(hourly_mean) if value is not None]
    half = (end - start) / 2
    first = [value for moment, value in zip(moments, values) if moment - start < half]
    second = [value for moment, value in zip(moments, values) if moment - start >= half]

    peak_index = max(range(len(values)), key=values.__getitem__)
    return {
        "count": len(values),
        "mean": fmean(values), "median": typical, "minimum": ordered[0], "maximum": ordered[-1],
        "standard_deviation": pstdev(values) if len(values) > 1 else 0.0,
        "percentile_95": _percentile(ordered, 0.95),
        "maximum_at": timestamps[peak_index],
        "first_timestamp": timestamps[0], "last_timestamp": timestamps[-1],
        "cadence_minutes": _minutes(cadence) if cadence else None,
        "expected_count": expected,
        "coverage_percent": round(min(100.0, 100 * len(values) / expected), 1) if expected else None,
        "gap_count": len(gaps), "gaps": sorted(gaps, key=lambda gap: -gap["minutes"])[:MAX_LISTED],
        "longest_gap_minutes": max((gap["minutes"] for gap in gaps), default=0.0),
        "zero_count": sum(1 for value in values if value == 0),
        "excursion_threshold": excursion_limit,
        "excursion_count": sum(episode["readings"] for episode in episodes),
        "excursion_episodes": len(episodes),
        "excursions": sorted(episodes, key=lambda episode: -episode["peak"])[:MAX_LISTED],
        "hourly_mean": hourly_mean,
        "hours_without_data": [hour for hour, value in enumerate(hourly_mean) if value is None],
        "highest_hour": max(filled, key=lambda item: item[1])[0] if filled else None,
        "lowest_hour": min(filled, key=lambda item: item[1])[0] if filled else None,
        "first_half_mean": fmean(first) if first else None,
        "second_half_mean": fmean(second) if second else None,
    }


def _number(value: float) -> str:
    return f"{value:.0f}" if abs(value) >= 100 else f"{value:.2f}"


def describe(instrument: str, stats: dict, unit: str | None) -> list[str]:
    """Plain statements of what the analysis found. No causes, no health claims."""
    suffix = f" {unit}" if unit else ""
    lines = [
        f"{stats['count']} readings, typically one every {stats['cadence_minutes']} minutes."
        if stats["cadence_minutes"] else f"{stats['count']} reading(s).",
        f"Mean {_number(stats['mean'])}{suffix}, median {_number(stats['median'])}{suffix}, "
        f"range {_number(stats['minimum'])} to {_number(stats['maximum'])}{suffix}.",
    ]
    if stats["coverage_percent"] is not None:
        lines.append(f"About {stats['coverage_percent']:g}% of the readings expected for the day at that interval are present.")
    if stats["gap_count"]:
        lines.append(f"{stats['gap_count']} pause(s) longer than {GAP_FACTOR:g} times the usual interval; the longest lasted {stats['longest_gap_minutes']:g} minutes.")
    else:
        lines.append("No pause longer than three times the usual interval.")
    if stats["zero_count"]:
        lines.append(f"{stats['zero_count']} reading(s) are exactly zero; the API does not say whether these are measurements or placeholders.")
    if stats["excursion_count"]:
        lines.append(
            f"{stats['excursion_count']} reading(s) in {stats['excursion_episodes']} episode(s) are more than {EXCURSION_FACTOR:g} times "
            f"this instrument's median; the highest, {_number(stats['maximum'])}{suffix}, is at {stats['maximum_at']}. The dataset does not state the cause.")
    else:
        lines.append(f"No reading is more than {EXCURSION_FACTOR:g} times this instrument's median.")
    if stats["first_half_mean"] is not None and stats["second_half_mean"] is not None and stats["first_half_mean"] > 0:
        change = 100 * (stats["second_half_mean"] - stats["first_half_mean"]) / stats["first_half_mean"]
        lines.append(f"Second half of the day compared with the first: mean {'up' if change >= 0 else 'down'} {abs(change):.0f}%.")
    return lines


def analyze(dataset: dict, instrument_notes: dict) -> dict:
    """Analysis of every instrument, grouped by the mission environment it belongs to."""
    notes = instrument_notes["instruments"]
    instruments = {}
    for instrument, series in dataset["instruments"].items():
        stats = analyze_series(series["timestamps"], series["values"], dataset["window_start"], dataset["window_end"])
        stats["environment"] = notes[instrument]["environment"] if instrument in notes else None
        stats["observations"] = describe(instrument, stats, dataset.get("unit"))
        instruments[instrument] = stats
    by_environment = {environment: [name for name, stats in instruments.items() if stats["environment"] == environment]
                      for environment in ("leo", "lunar", "mars")}
    return {
        "method": {
            "gap_rule": f"A pause longer than {GAP_FACTOR:g} times the instrument's median interval.",
            "excursion_rule": f"A reading more than {EXCURSION_FACTOR:g} times the instrument's own median.",
            "statistics": "Mean, median, minimum, maximum, population standard deviation and 95th percentile of the published values; hourly means by hour of the window.",
            "limits": "Descriptive only. Instruments are not compared with each other, no cause is inferred, and nothing here estimates a person's exposure.",
        },
        "instruments": instruments,
        "by_environment": by_environment,
        "undescribed": [name for name, stats in instruments.items() if stats["environment"] is None],
    }


def relevant_instruments(analysis: dict, environment: str) -> dict:
    """Instruments that belong to the astronaut's mission environment, or an explanation that none do."""
    names = analysis["by_environment"].get(environment, [])
    return {
        "environment": environment, "instruments": names,
        "explanation": None if names else "RadLab has no instrument in this dataset for your mission environment, so no mission-specific radiation data is shown.",
    }
