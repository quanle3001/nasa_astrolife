"""Qualify and stabilize display estimates without changing assessment inputs.

These are UI consistency heuristics, not clinical limits or accuracy validation.
Every original reading still goes to the assessment rules unchanged.
"""

from collections import deque
from statistics import median


class ReadingStability:
    REPORT_COUNT = 3
    # Reports round device time to 0.1 s, and the ~1 Hz update can vary slightly.
    MIN_SPAN_SECONDS = 1.8

    def __init__(self):
        self.readings = deque(maxlen=self.REPORT_COUNT)

    def reset(self):
        self.readings.clear()

    def channel_state(self, field):
        if not self.readings or getattr(self.readings[-1], field) is None:
            return "waiting"
        values = [getattr(item, field) for item in self.readings if getattr(item, field) is not None]
        # Engineering consistency limits, never definitions of a healthy pulse.
        tolerance = max(6, median(values) * 0.08) if field == "heart_rate" else 2
        if max(values) - min(values) > tolerance:
            return "changing"
        span = self.readings[-1].elapsed_seconds - self.readings[0].elapsed_seconds
        if len(values) < self.REPORT_COUNT or span < self.MIN_SPAN_SECONDS:
            return "collecting"
        return "steady"

    def display_value(self, field):
        """Return a median only for agreeing fresh reports; never hold old values."""
        if self.channel_state(field) != "steady":
            return None
        return median(getattr(item, field) for item in self.readings)

    def update(self, reading, signal_ready=True):
        if not reading.usable:
            self.reset()
            return "waiting"
        if not signal_ready:
            self.reset()
            return "settling"
        if self.readings:
            previous = self.readings[-1]
            gap = reading.elapsed_seconds - previous.elapsed_seconds
            if not 0 < gap <= 8:
                self.reset()
        self.readings.append(reading)
        states = [self.channel_state(field) for field in ("heart_rate", "spo2") if getattr(reading, field) is not None]
        if "changing" in states:
            return "changing"
        return "steady" if all(state == "steady" for state in states) else "collecting"
