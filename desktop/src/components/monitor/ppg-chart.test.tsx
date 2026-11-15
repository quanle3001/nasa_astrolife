import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PpgBuffer } from "@/lib/ppg-buffer";
import type { PpgBatch } from "@/types/backend";

const setData = vi.fn();
vi.mock("uplot", () => ({
  default: class { setData = setData; setSize = vi.fn(); destroy = vi.fn(); },
}));
vi.mock("uplot/dist/uPlot.min.css", () => ({}));

const batch = (overrides: Partial<PpgBatch> = {}): PpgBatch => ({
  stream_id: 1, batch_seq: 0, source: "sensor", seq: [0, 1, 2], t_ms: [0, 40, 80],
  red: [60000, 60010, 60020], ir: [80000, 80020, 80040], dropped: 0, contact: "ok", ...overrides,
});

describe("PpgChart", () => {
  beforeEach(() => { vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame", "performance"] }); setData.mockClear(); });
  afterEach(() => { vi.useRealTimers(); });

  it("draws real samples, labels the signal as PPG, and never per-sample re-renders", async () => {
    const { PpgChart } = await import("@/components/monitor/ppg-chart");
    const buffer = new PpgBuffer();
    render(<PpgChart buffer={buffer} />);
    expect(screen.getByRole("status")).toHaveTextContent("No signal");
    expect(screen.getByRole("img")).toHaveAccessibleName(/PPG signal, not an ECG/);
    act(() => { buffer.push(batch()); vi.advanceTimersByTime(100); });
    expect(screen.getByRole("status")).toHaveTextContent("Live optical signal");
    const [seconds, infrared] = setData.mock.calls.at(-1)![0] as number[][];
    expect(seconds).toHaveLength(3);
    expect(infrared).toHaveLength(3);
    const calls = setData.mock.calls.length;
    act(() => { vi.advanceTimersByTime(300); });
    expect(setData.mock.calls.length).toBe(calls);
  });

  it("can be paused without losing samples, and resumes with the newest data", async () => {
    const { PpgChart } = await import("@/components/monitor/ppg-chart");
    const buffer = new PpgBuffer();
    render(<PpgChart buffer={buffer} />);
    act(() => { buffer.push(batch()); vi.advanceTimersByTime(100); });
    const drawn = setData.mock.calls.length;
    fireEvent.click(screen.getByRole("button", { name: "Pause chart" }));
    expect(screen.getByRole("status")).toHaveTextContent("Chart paused");
    act(() => { buffer.push(batch({ batch_seq: 1, seq: [3, 4], t_ms: [120, 160], red: [60030, 60040], ir: [80060, 80080] })); vi.advanceTimersByTime(200); });
    expect(setData.mock.calls.length).toBe(drawn);
    expect(buffer.length).toBe(5);
    fireEvent.click(screen.getByRole("button", { name: "Resume chart" }));
    act(() => { vi.advanceTimersByTime(100); });
    expect((setData.mock.calls.at(-1)![0] as number[][])[0]).toHaveLength(5);
  });

  it("offers only the chart and its status in compact previews", async () => {
    const { PpgChart } = await import("@/components/monitor/ppg-chart");
    render(<PpgChart buffer={new PpgBuffer()} compact />);
    expect(screen.queryByRole("button", { name: "Pause chart" })).not.toBeInTheDocument();
    expect(screen.queryByText(/display-filtered/)).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("No signal");
  });

  it("explains lost contact and labels simulated data", async () => {
    const { PpgChart } = await import("@/components/monitor/ppg-chart");
    const buffer = new PpgBuffer();
    render(<PpgChart buffer={buffer} />);
    act(() => { buffer.push(batch({ source: "simulated" })); vi.advanceTimersByTime(100); });
    expect(screen.getByText(/Simulated data/)).toBeInTheDocument();
    act(() => { buffer.push(batch({ source: "simulated", batch_seq: 1, seq: [3], t_ms: [120], red: [10], ir: [900], contact: "no_contact" })); vi.advanceTimersByTime(100); });
    expect(screen.getByRole("status")).toHaveTextContent("No contact");
  });
});
