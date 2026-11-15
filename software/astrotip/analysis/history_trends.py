"""Descriptive summary of the astronaut's own saved measurements, with pandas.

It answers "what has been recorded, and how does the newest value sit among
the others" for heart rate and SpO2. It does not judge whether a change
matters: the app has no personal baseline or approved mission limit, so any
interpretation belongs to the crew medical team.

Simulated demo entries are excluded: they are not measurements.
"""

from __future__ import annotations

import pandas as pd

ALGORITHM_VERSION = "history-descriptive-1.0"
INDICATORS = {"heart_rate": ("Heart rate", "bpm"), "spo2": ("Estimated SpO2", "%")}
MAX_POINTS = 30


def summarize_history(entries: list[dict]) -> dict:
    """Count, range, mean and latest-versus-previous for each recorded indicator."""
    rows = [
        {"entry_id": entry["id"], "created_at": entry["created_at"],
         "source": entry["checkin"].get("input_source", "manual"),
         "heart_rate": entry["checkin"].get("heart_rate"), "spo2": entry["checkin"].get("spo2")}
        for entry in entries
    ]
    frame = pd.DataFrame(rows, columns=["entry_id", "created_at", "source", "heart_rate", "spo2"])
    simulated = int((frame["source"] == "simulated").sum())
    real = frame[frame["source"] != "simulated"].sort_values("entry_id", kind="stable")
    indicators = {}
    for field, (label, unit) in INDICATORS.items():
        recorded = real.dropna(subset=[field])
        values = recorded[field].astype(float)
        summary = {"label": label, "unit": unit, "count": int(len(values)), "points": [
            {"entry_id": int(row.entry_id), "created_at": row.created_at, "value": float(getattr(row, field)), "source": row.source}
            for row in recorded.tail(MAX_POINTS).itertuples()
        ]}
        if len(values):
            summary.update({
                "mean": float(values.mean()), "minimum": float(values.min()), "maximum": float(values.max()),
                "latest": float(values.iloc[-1]),
                "previous": float(values.iloc[-2]) if len(values) > 1 else None,
                "change_from_previous": float(values.iloc[-1] - values.iloc[-2]) if len(values) > 1 else None,
            })
        indicators[field] = summary
    return {
        "algorithm_version": ALGORITHM_VERSION,
        "entries_considered": int(len(real)), "simulated_excluded": simulated,
        "indicators": indicators,
        "limits": "Descriptive only. AstroLife has no personal baseline or approved mission limit and does not interpret a change.",
    }
