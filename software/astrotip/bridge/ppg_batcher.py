"""Group raw optical samples into bounded, ordered batches for the desktop shell.

The ESP32 emits about 25 paired red/infrared samples per second. Sending each
one as its own JSON line and IPC message would work at that rate, but batching
keeps the renderer's work proportional to its redraw rate rather than to the
sensor's sample rate, and gives every batch an explicit position in the stream.

Samples are forwarded exactly as the firmware reported them: device sequence
number, device time in milliseconds and raw counts. Nothing here filters,
interpolates or interprets the signal.
"""

from __future__ import annotations

from collections import deque

# Same contact limits as the teammate's waveform and optical quality checks.
NO_CONTACT_INFRARED = 50000
ADC_FULL_SCALE = 262143


def contact_state(sample) -> str:
    """Classify one raw sample as usable contact, no contact or clipped."""
    if sample.infrared <= NO_CONTACT_INFRARED or sample.red == 0:
        return "no_contact"
    if max(sample.red, sample.infrared) >= ADC_FULL_SCALE:
        return "clipped"
    return "ok"


class PpgBatcher:
    """Bounded queue of optical samples, flushed as `sensor.ppg.batch` payloads.

    `MAX_QUEUE` bounds memory if the consumer stalls: the oldest samples are
    dropped and the number dropped is reported in the next batch, so the
    renderer can break the drawn line instead of joining across a gap.
    """

    MAX_BATCH = 32
    MAX_QUEUE = 256

    def __init__(self, emit):
        self._emit = emit
        self._queue: deque = deque()
        self._dropped = 0
        self._batch_seq = 0
        self._last: tuple[int, float] | None = None
        self.duplicates = 0
        self.stream_id = 0
        self.source = "sensor"

    def start_stream(self, source: str = "sensor") -> int:
        """Begin a new stream (new connection); earlier samples are discarded."""
        self._queue.clear()
        self._dropped = 0
        self._batch_seq = 0
        self._last = None
        self.duplicates = 0
        self.stream_id += 1
        self.source = source
        return self.stream_id

    def add(self, sample) -> None:
        # Seen on the real board: when the port opens, the serial adapter can
        # deliver one stale sample many times. A repeat of the previous sample
        # (same device sequence and device time) carries no new information.
        identity = (sample.sequence, sample.elapsed_seconds)
        if identity == self._last:
            self.duplicates += 1
            return
        self._last = identity
        if len(self._queue) >= self.MAX_QUEUE:
            self._queue.popleft()
            self._dropped += 1
        self._queue.append(sample)
        if len(self._queue) >= self.MAX_BATCH:
            self.flush()

    def flush(self) -> int:
        """Emit queued samples in order; returns the number of batches sent."""
        sent = 0
        while self._queue:
            samples = [self._queue.popleft() for _ in range(min(len(self._queue), self.MAX_BATCH))]
            self._emit({
                "stream_id": self.stream_id,
                "batch_seq": self._batch_seq,
                "source": self.source,
                "seq": [sample.sequence for sample in samples],
                "t_ms": [round(sample.elapsed_seconds * 1000) for sample in samples],
                "red": [sample.red for sample in samples],
                "ir": [sample.infrared for sample in samples],
                "dropped": self._dropped,
                "contact": contact_state(samples[-1]),
            })
            self._batch_seq += 1
            self._dropped = 0
            sent += 1
        return sent

    def clear(self) -> None:
        self._queue.clear()
        self._dropped = 0
