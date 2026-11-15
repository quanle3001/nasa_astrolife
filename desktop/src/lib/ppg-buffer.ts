import type { PpgBatch } from "@/types/backend";

/** Why the chart is (or is not) drawing a line right now. */
export type PpgState = "idle" | "live" | "no_contact" | "clipped" | "stale";

/** Arrays ready for the chart: seconds relative to the newest sample, newest last. */
export interface PpgWindow {
  seconds: number[];
  infrared: number[];
  red: number[];
}

/** Time constants of the display filter, in seconds (same values as the PySide6 monitor). */
const BASELINE_SECONDS = 1.5;
const SMOOTHING_SECONDS = 0.04;
/** A gap longer than this between samples is a break in the stream, not a slow sample. */
const MAX_SAMPLE_GAP_SECONDS = 1;
/** With no new batch for this long the chart says so instead of holding an old trace. */
export const STALE_AFTER_MS = 2000;

/**
 * Bounded buffer of the newest optical samples for the live chart.
 *
 * It keeps raw counts untouched and, next to them, a display-only trace:
 * baseline removed, lightly smoothed and inverted so that a heartbeat points
 * up. The filter is a port of `OpticalWaveform._append` in
 * `software/astrotip/ui/optical_waveform.py` and is causal, driven by device
 * timestamps. It never adds points, and the display trace is never used for
 * heart-rate or SpO2 estimates, which come from the firmware reports.
 *
 * The line is cleared rather than joined across anything that makes samples
 * non-consecutive: a new connection, a sequence gap, samples dropped upstream,
 * time running backwards, or lost contact.
 */
export class PpgBuffer {
  readonly capacity: number;
  /** Bumped on every change so the chart can skip redraws when nothing is new. */
  revision = 0;
  state: PpgState = "idle";
  source: PpgBatch["source"] | null = null;
  /** Count of line breaks caused by missing or out-of-order samples in this stream. */
  gaps = 0;
  lastBatchAt: number | null = null;

  private seconds: number[] = [];
  private rawRed: number[] = [];
  private rawInfrared: number[] = [];
  private shownRed: number[] = [];
  private shownInfrared: number[] = [];
  private streamId: number | null = null;
  private lastSequence: number | null = null;
  private baseline: [number, number] | null = null;
  private smoothed: [number, number] = [0, 0];

  constructor(capacity = 512) {
    this.capacity = capacity;
  }

  get length(): number {
    return this.seconds.length;
  }

  /** Newest raw counts, or null when no sample is held. */
  latestRaw(): { red: number; infrared: number } | null {
    const last = this.seconds.length - 1;
    return last < 0 ? null : { red: this.rawRed[last], infrared: this.rawInfrared[last] };
  }

  push(batch: PpgBatch, now = Date.now()): void {
    if (batch.stream_id !== this.streamId) {
      this.reset();
      this.streamId = batch.stream_id;
      this.gaps = 0;
    }
    this.source = batch.source;
    this.lastBatchAt = now;
    if (batch.dropped > 0) this.breakLine();
    for (let index = 0; index < batch.seq.length; index += 1) {
      this.append(batch.seq[index], batch.t_ms[index] / 1000, batch.red[index], batch.ir[index]);
    }
    if (batch.contact !== "ok") {
      // No usable optical contact: show the reason, never a flat "pulse".
      this.clearSamples();
      this.state = batch.contact;
    } else if (this.seconds.length) {
      this.state = "live";
    }
    this.revision += 1;
  }

  /** Call periodically; marks the trace stale when the stream has gone quiet. */
  checkFreshness(now = Date.now()): void {
    if (this.lastBatchAt !== null && this.state !== "idle" && this.state !== "stale" && now - this.lastBatchAt > STALE_AFTER_MS) {
      this.clearSamples();
      this.state = "stale";
      this.revision += 1;
    }
  }

  /** Forget everything, for example after the sensor disconnects. */
  reset(): void {
    this.clearSamples();
    this.streamId = null;
    this.source = null;
    this.lastBatchAt = null;
    this.state = "idle";
    this.revision += 1;
  }

  /** The newest `windowSeconds` of the display trace, time-aligned to end at zero. */
  window(windowSeconds = 10): PpgWindow {
    const count = this.seconds.length;
    if (!count) return { seconds: [], infrared: [], red: [] };
    const newest = this.seconds[count - 1];
    let start = 0;
    while (start < count && newest - this.seconds[start] > windowSeconds) start += 1;
    return {
      seconds: this.seconds.slice(start).map((value) => value - newest),
      infrared: this.shownInfrared.slice(start),
      red: this.shownRed.slice(start),
    };
  }

  private append(sequence: number, seconds: number, red: number, infrared: number): void {
    let elapsed = 0;
    if (this.seconds.length && this.lastSequence !== null) {
      const gap = seconds - this.seconds[this.seconds.length - 1];
      elapsed = Math.max(0, gap);
      // The firmware counter is 32 bits wide and wraps to zero.
      const consecutive = sequence === ((this.lastSequence + 1) >>> 0);
      if (gap <= 0 || gap > MAX_SAMPLE_GAP_SECONDS || !consecutive) {
        this.breakLine();
        elapsed = 0;
      }
    }
    this.lastSequence = sequence;
    if (this.baseline === null) {
      this.baseline = [red, infrared];
      this.smoothed = [0, 0];
    } else {
      const baselineGain = 1 - Math.exp(-elapsed / BASELINE_SECONDS);
      const smoothingGain = 1 - Math.exp(-elapsed / SMOOTHING_SECONDS);
      const raw = [red, infrared];
      for (const channel of [0, 1] as const) {
        this.baseline[channel] += baselineGain * (raw[channel] - this.baseline[channel]);
        this.smoothed[channel] += smoothingGain * (-(raw[channel] - this.baseline[channel]) - this.smoothed[channel]);
      }
    }
    this.seconds.push(seconds);
    this.rawRed.push(red);
    this.rawInfrared.push(infrared);
    this.shownRed.push(this.smoothed[0]);
    this.shownInfrared.push(this.smoothed[1]);
    if (this.seconds.length > this.capacity) {
      for (const list of [this.seconds, this.rawRed, this.rawInfrared, this.shownRed, this.shownInfrared]) list.shift();
    }
  }

  private breakLine(): void {
    if (this.seconds.length) this.gaps += 1;
    this.clearSamples();
  }

  private clearSamples(): void {
    this.seconds = [];
    this.rawRed = [];
    this.rawInfrared = [];
    this.shownRed = [];
    this.shownInfrared = [];
    this.lastSequence = null;
    this.baseline = null;
    this.smoothed = [0, 0];
  }
}
