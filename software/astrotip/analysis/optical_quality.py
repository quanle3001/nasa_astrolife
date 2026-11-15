"""Conservative optical-stream checks, not a clinical signal-quality score.

These checks reject obvious interruptions and large optical changes. Passing
them does not establish a valid heartbeat, accuracy, or the absence of motion.
Raw vital estimates must still be assessed independently for alerts.
"""

from collections import deque
from math import isfinite
from statistics import median


class OpticalSignalQuality:
    SAMPLE_COUNT = 100
    BLOCK_SIZE = 25
    MAX_RELATIVE_CHANGE = 0.05

    def __init__(self):
        self.samples = deque(maxlen=self.SAMPLE_COUNT)
        self.stream_seen = False
        self.reset()

    def reset(self, keep_stream=False):
        """Clear history; preserve stream capability during an interruption."""
        self.samples.clear()
        if not keep_stream:
            self.stream_seen = False
        self._state = "collecting" if self.stream_seen else "unavailable"

    def add_sample(self, sample):
        self.stream_seen = True
        if not isfinite(sample.elapsed_seconds) or sample.elapsed_seconds < 0:
            self.samples.clear()
            self._state = "timing"
            return
        if sample.infrared <= 50000:
            self.samples.clear()
            self._state = "no_contact"
            return
        if sample.red <= 0 or max(sample.red, sample.infrared) >= 262143:
            self.samples.clear()
            self._state = "clipped"
            return
        if self.samples:
            previous = self.samples[-1]
            if (sample.sequence != ((previous.sequence + 1) & 0xFFFFFFFF)
                    or sample.elapsed_seconds <= previous.elapsed_seconds):
                # Start again from the current sample after a gap or restart.
                self.samples.clear()
        self.samples.append(sample)
        self._state = "collecting"

    def evaluate(self, report_time):
        """Inspect the current raw window at the report's device timestamp."""
        if not self.stream_seen:
            return "unavailable"
        if not isfinite(report_time):
            return "timing"
        if not self.samples:
            return self._state
        age = report_time - self.samples[-1].elapsed_seconds
        # Firmware report times have only one decimal place. Small negative
        # differences can therefore be rounding, rather than reversed time.
        if age < -0.15 or age > 1.0:
            return "timing"
        if len(self.samples) < self.SAMPLE_COUNT:
            return "collecting"
        duration = self.samples[-1].elapsed_seconds - self.samples[0].elapsed_seconds
        if duration <= 0 or not 20 <= (self.SAMPLE_COUNT - 1) / duration <= 30:
            return "timing"
        for channel in ("red", "infrared"):
            values = [getattr(sample, channel) for sample in self.samples]
            baseline = median(values)
            limit = baseline * self.MAX_RELATIVE_CHANGE
            if any(abs(current - previous) > limit
                   for previous, current in zip(values, values[1:])):
                return "changing"
            block_medians = [median(values[start:start + self.BLOCK_SIZE])
                             for start in range(0, self.SAMPLE_COUNT, self.BLOCK_SIZE)]
            if max(block_medians) - min(block_medians) > limit:
                return "changing"
        return "ready"
