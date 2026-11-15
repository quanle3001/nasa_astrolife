import { describe, expect, it } from "vitest";
import { PpgBuffer, STALE_AFTER_MS } from "@/lib/ppg-buffer";
import type { PpgBatch } from "@/types/backend";

/** Consecutive 25 Hz samples starting at `first`. */
function batch(first: number, count: number, overrides: Partial<PpgBatch> = {}): PpgBatch {
  const seq = Array.from({ length: count }, (_value, index) => first + index);
  return {
    stream_id: 1, batch_seq: 0, source: "sensor", seq,
    t_ms: seq.map((value) => value * 40),
    red: seq.map((value) => 60000 + value),
    ir: seq.map((value) => 80000 + value * 2),
    dropped: 0, contact: "ok", ...overrides,
  };
}

describe("PpgBuffer", () => {
  it("keeps consecutive samples and aligns the window to the newest one", () => {
    const buffer = new PpgBuffer();
    buffer.push(batch(0, 3));
    buffer.push(batch(3, 2));
    expect(buffer.length).toBe(5);
    expect(buffer.state).toBe("live");
    expect(buffer.gaps).toBe(0);
    const shown = buffer.window();
    expect(shown.seconds.at(-1)).toBe(0);
    expect(shown.seconds[0]).toBeCloseTo(-0.16);
    expect(buffer.latestRaw()).toEqual({ red: 60004, infrared: 80008 });
  });

  it("never grows beyond its capacity", () => {
    const buffer = new PpgBuffer(50);
    buffer.push(batch(0, 32));
    buffer.push(batch(32, 32));
    expect(buffer.length).toBe(50);
    expect(buffer.gaps).toBe(0);
  });

  it("returns only the requested time window", () => {
    const buffer = new PpgBuffer(512);
    for (let first = 0; first < 300; first += 30) buffer.push(batch(first, 30));
    const shown = buffer.window(2);
    expect(shown.seconds[0]).toBeGreaterThanOrEqual(-2);
    expect(shown.seconds.length).toBe(51);
  });

  it("breaks the line instead of joining across a sequence gap", () => {
    const buffer = new PpgBuffer();
    buffer.push(batch(0, 5));
    buffer.push(batch(9, 3));
    expect(buffer.length).toBe(3);
    expect(buffer.gaps).toBe(1);
  });

  it("breaks the line when the backend reports dropped samples", () => {
    const buffer = new PpgBuffer();
    buffer.push(batch(0, 5));
    buffer.push(batch(5, 2, { dropped: 4 }));
    expect(buffer.length).toBe(2);
    expect(buffer.gaps).toBe(1);
  });

  it("breaks the line when device time runs backwards (sensor restart)", () => {
    const buffer = new PpgBuffer();
    buffer.push(batch(100, 3));
    buffer.push({ ...batch(103, 1), t_ms: [10] });
    expect(buffer.length).toBe(1);
    expect(buffer.gaps).toBe(1);
  });

  it("accepts the 32-bit sequence counter wrapping to zero", () => {
    const buffer = new PpgBuffer();
    buffer.push({ ...batch(0, 2), seq: [4294967294, 4294967295], t_ms: [0, 40] });
    buffer.push({ ...batch(0, 1), seq: [0], t_ms: [80] });
    expect(buffer.length).toBe(3);
    expect(buffer.gaps).toBe(0);
  });

  it("starts over on a new connection without counting a gap", () => {
    const buffer = new PpgBuffer();
    buffer.push(batch(0, 5));
    buffer.push(batch(0, 2, { stream_id: 2, source: "simulated" }));
    expect(buffer.length).toBe(2);
    expect(buffer.gaps).toBe(0);
    expect(buffer.source).toBe("simulated");
  });

  it("shows lost contact and clipping as states, not as a flat pulse", () => {
    const buffer = new PpgBuffer();
    buffer.push(batch(0, 5));
    buffer.push(batch(5, 1, { contact: "no_contact", ir: [900] }));
    expect(buffer.state).toBe("no_contact");
    expect(buffer.length).toBe(0);
    buffer.push(batch(6, 1, { contact: "clipped", ir: [262143] }));
    expect(buffer.state).toBe("clipped");
    buffer.push(batch(7, 2));
    expect(buffer.state).toBe("live");
    expect(buffer.length).toBe(2);
  });

  it("marks the trace stale when batches stop arriving", () => {
    const buffer = new PpgBuffer();
    buffer.push(batch(0, 5), 1000);
    buffer.checkFreshness(1000 + STALE_AFTER_MS - 1);
    expect(buffer.state).toBe("live");
    buffer.checkFreshness(1000 + STALE_AFTER_MS + 1);
    expect(buffer.state).toBe("stale");
    expect(buffer.length).toBe(0);
  });

  it("reset returns to idle and bumps the revision for a redraw", () => {
    const buffer = new PpgBuffer();
    buffer.push(batch(0, 5));
    const before = buffer.revision;
    buffer.reset();
    expect(buffer.state).toBe("idle");
    expect(buffer.length).toBe(0);
    expect(buffer.revision).toBeGreaterThan(before);
  });

  it("display trace removes the baseline, inverts, and leaves raw counts unchanged", () => {
    const buffer = new PpgBuffer();
    // A constant level followed by a drop in reflected light (more blood volume).
    const level = batch(0, 50, { red: Array(50).fill(60000), ir: Array(50).fill(80000) });
    buffer.push(level);
    expect(Math.abs(buffer.window().infrared.at(-1) ?? 1)).toBeLessThan(1e-9);
    buffer.push(batch(50, 3, { red: Array(3).fill(60000), ir: Array(3).fill(79000) }));
    expect(buffer.window().infrared.at(-1)).toBeGreaterThan(0);
    expect(buffer.latestRaw()).toEqual({ red: 60000, infrared: 79000 });
  });
});
