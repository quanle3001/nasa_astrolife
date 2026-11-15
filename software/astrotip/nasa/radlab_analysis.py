"""Descriptive analysis of a verified RadLab dataset, with pandas and NumPy.

Everything here is computed from the retrieved readings: central values and
spread, how regularly each instrument reported, where readings are missing,
which readings stand far above the instrument's own typical level, and how the
level changed through the day. The analysis describes the dataset. It makes no
statement about cause, about health effects or about any person's exposure, and
instruments are never ranked against each other, because their location,
shielding and method differ.
"""

from __future__ import annotations

from datetime import datetime

import numpy as np
import pandas as pd

#: Version of the analysis below; recorded with every result so it can be reproduced.
ALGORITHM_VERSION = "radlab-descriptive-1.1"
#: A pause this many times longer than the instrument's usual interval counts as a gap.
GAP_FACTOR = 3.0
#: A reading this many times above the instrument's own median counts as an excursion.
EXCURSION_FACTOR = 3.0
MAX_LISTED = 5


def _minutes(seconds: float) -> float:
    return round(float(seconds) / 60, 1)


def _iso(moment) -> str:
    return pd.Timestamp(moment).isoformat()


def analyze_series(timestamps: list[str], values: list[float], window_start: str, window_end: str) -> dict:
    """Statistics, cadence, gaps, irregular readings and hourly change for one instrument.

    Computed with pandas and NumPy on the published values. The standard
    deviation is the population value (ddof=0) and the 95th percentile uses
    linear interpolation, NumPy's default.
    """
    start = pd.Timestamp(datetime.strptime(window_start, "%Y-%m-%d"))
    end = pd.Timestamp(datetime.strptime(window_end, "%Y-%m-%d"))
    moments = pd.to_datetime(pd.Series(timestamps)).dt.tz_localize(None)
    series = pd.Series(np.asarray(values, dtype=float), index=pd.DatetimeIndex(moments))
    typical = float(series.median())
    intervals = series.index.to_series().diff().dt.total_seconds().dropna()
    cadence = float(intervals.median()) if len(intervals) else None

    gaps = []
    if cadence:
        # The stretch before the first and after the last reading is checked like any other pause.
        edges = pd.DatetimeIndex([start, *series.index, end])
        pauses = pd.Series(edges[1:] - edges[:-1]).dt.total_seconds()
        for position in np.flatnonzero(pauses.to_numpy() > cadence * GAP_FACTOR):
            gaps.append({"start": _iso(edges[position]), "end": _iso(edges[position + 1]), "minutes": _minutes(pauses.iloc[position])})
    expected = round((end - start).total_seconds() / cadence) if cadence else None

    excursion_limit = typical * EXCURSION_FACTOR
    above = (series > excursion_limit) & (typical > 0)
    # Consecutive readings above the limit form one episode.
    episode_id = (above != above.shift(fill_value=False)).cumsum()[above]
    episodes = []
    for _number_, block in series[above].groupby(episode_id):
        episodes.append({"start": _iso(block.index[0]), "end": _iso(block.index[-1]), "readings": int(len(block)),
                         "peak": float(block.max()), "peak_at": _iso(block.idxmax())})

    hour = np.minimum(23, ((series.index - start).total_seconds() // 3600).astype(int))
    by_hour = series.groupby(hour).mean()
    hourly_mean = [float(by_hour[index]) if index in by_hour.index else None for index in range(24)]
    filled = by_hour.dropna()
    middle = start + (end - start) / 2
    first, second = series[series.index < middle], series[series.index >= middle]

    return {
        "count": int(series.size),
        "mean": float(series.mean()), "median": typical, "minimum": float(series.min()), "maximum": float(series.max()),
        "standard_deviation": float(series.std(ddof=0)) if series.size > 1 else 0.0,
        "percentile_95": float(np.percentile(series.to_numpy(), 95)),
        "maximum_at": timestamps[int(np.argmax(series.to_numpy()))],
        "first_timestamp": timestamps[0], "last_timestamp": timestamps[-1],
        "cadence_minutes": _minutes(cadence) if cadence else None,
        "expected_count": expected,
        "coverage_percent": round(min(100.0, 100 * series.size / expected), 1) if expected else None,
        "gap_count": len(gaps), "gaps": sorted(gaps, key=lambda gap: -gap["minutes"])[:MAX_LISTED],
        "longest_gap_minutes": max((gap["minutes"] for gap in gaps), default=0.0),
        "zero_count": int((series == 0).sum()),
        "excursion_threshold": excursion_limit,
        "excursion_count": int(above.sum()),
        "excursion_episodes": len(episodes),
        "excursions": sorted(episodes, key=lambda episode: -episode["peak"])[:MAX_LISTED],
        "hourly_mean": hourly_mean,
        "hours_without_data": [index for index, value in enumerate(hourly_mean) if value is None],
        "highest_hour": int(filled.idxmax()) if len(filled) else None,
        "lowest_hour": int(filled.idxmin()) if len(filled) else None,
        "first_half_mean": float(first.mean()) if len(first) else None,
        "second_half_mean": float(second.mean()) if len(second) else None,
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
        # What is needed to reproduce and audit this analysis.
        "provenance": {
            "algorithm_version": ALGORITHM_VERSION,
            "libraries": {"pandas": pd.__version__, "numpy": np.__version__},
            "dataset_request_url": dataset["request_url"],
            "dataset_retrieved_at": dataset["retrieved_at"],
            "dataset_sha256": dataset["data_sha256"],
            "measurement": dataset["measurement"],
            "unit": dataset.get("unit"),
            "instruments": list(dataset["instruments"]),
            "pipeline_version": dataset.get("pipeline_version"),
            "transformation_steps": dataset.get("transformation_steps", []),
        },
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
