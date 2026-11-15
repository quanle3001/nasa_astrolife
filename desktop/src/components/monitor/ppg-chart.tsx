import { useEffect, useRef, useState } from "react";
import uPlot from "uplot";
import "uplot/dist/uPlot.min.css";
import { ppgBuffer } from "@/lib/ppg-store";
import type { PpgBuffer, PpgState } from "@/lib/ppg-buffer";
import { cn } from "@/lib/utils";

const WINDOW_SECONDS = 10;
/** Redraw at most this often; the sensor delivers about 25 samples per second. */
const REDRAW_INTERVAL_MS = 33;

const STATE_TEXT: Record<PpgState, string> = {
  idle: "No signal · connect the sensor to see the optical pulse.",
  live: "Live optical signal · keep your hand relaxed.",
  no_contact: "No contact · rest your fingertip directly on the sensor window.",
  clipped: "Signal too strong · reposition your finger gently.",
  stale: "Signal paused · waiting for the sensor.",
};

function chartOptions(width: number, height: number, showRed: boolean): uPlot.Options {
  const axis = { stroke: "#7c8ca3", grid: { stroke: "rgba(120,156,196,.12)", width: 1 }, ticks: { stroke: "rgba(120,156,196,.2)", width: 1 } };
  return {
    width, height,
    legend: { show: false },
    cursor: { show: false },
    scales: { x: { time: false, range: [-WINDOW_SECONDS, 0] }, y: { auto: true } },
    axes: [
      { ...axis, values: (_plot, ticks) => ticks.map((tick) => `${tick}s`) },
      // The vertical scale is relative light after baseline removal; absolute numbers would mislead.
      { ...axis, values: () => [], size: 12 },
    ],
    series: [
      {},
      { label: "Infrared", stroke: "#46d9e8", width: 2, points: { show: false } },
      { label: "Red", stroke: "#ff8394", width: 1.5, points: { show: false }, show: showRed },
    ],
  };
}

/**
 * Live optical pulse (PPG) from the MAX30102, drawn with uPlot.
 *
 * The component reads the shared `PpgBuffer` on an animation-frame loop and
 * only pushes data to the chart when the buffer changed, so React renders
 * happen on state changes (connect, contact lost) and never per sample.
 * When there is no usable signal it shows the reason instead of a flat line.
 */
export function PpgChart({ buffer = ppgBuffer, height = 220, className, compact }: {
  buffer?: PpgBuffer; height?: number; className?: string;
  /** Chart and status only, for previews: no channel toggle, pause control or caption. */
  compact?: boolean;
}) {
  const host = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<PpgState>(buffer.state);
  const [simulated, setSimulated] = useState(buffer.source === "simulated");
  const [showRed, setShowRed] = useState(false);
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(false);
  pausedRef.current = paused;

  useEffect(() => {
    const element = host.current;
    if (!element) return undefined;
    const plot = new uPlot(chartOptions(Math.max(element.clientWidth, 240), height, showRed), [[], [], []], element);
    const resize = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(() => {
      plot.setSize({ width: Math.max(element.clientWidth, 240), height });
    });
    resize?.observe(element);

    let frame = 0;
    let lastDraw = 0;
    let lastFreshness = 0;
    let drawnRevision = -1;
    const tick = (now: number) => {
      frame = requestAnimationFrame(tick);
      if (now - lastFreshness > 500) { lastFreshness = now; buffer.checkFreshness(); }
      // Paused: the buffer keeps filling, the picture holds still for reading.
      if (pausedRef.current || now - lastDraw < REDRAW_INTERVAL_MS || buffer.revision === drawnRevision) return;
      lastDraw = now;
      drawnRevision = buffer.revision;
      const shown = buffer.window(WINDOW_SECONDS);
      plot.setData([shown.seconds, shown.infrared, shown.red]);
      setState(buffer.state);
      setSimulated(buffer.source === "simulated");
    };
    frame = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(frame); resize?.disconnect(); plot.destroy(); };
  }, [buffer, height, showRed]);

  return (
    <div className={cn("ppg-chart", className)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-space-silver" role="status" aria-live="polite">{paused ? "Chart paused · the sensor is still being read." : STATE_TEXT[state]}</p>
        <div className="flex items-center gap-3">
          {simulated && <span className="provenance-badge provenance-simulated">Simulated data · not a measurement</span>}
          {!compact && (
            <>
              <label className="flex cursor-pointer items-center gap-2 text-xs text-space-muted">
                <input type="checkbox" checked={showRed} onChange={(event) => setShowRed(event.target.checked)} />
                Show red channel
              </label>
              <button type="button" className="chart-pause" aria-pressed={paused} onClick={() => setPaused((value) => !value)}>{paused ? "Resume chart" : "Pause chart"}</button>
            </>
          )}
        </div>
      </div>
      <div className="relative mt-3">
        <div ref={host} role="img" aria-label="Live optical finger pulse over the last ten seconds. This is a PPG signal, not an ECG." />
        {state !== "live" && <div className="ppg-chart-idle" aria-hidden="true" />}
      </div>
      {!compact && <p className="mt-2 text-xs leading-5 text-space-subtle">
        Optical pulse (PPG) at the fingertip, not an ECG. Infrared about 880 nm{showRed ? ", red about 660 nm" : ""}. The trace is display-filtered
        (baseline removed, lightly smoothed, inverted); raw counts are unchanged, and heart-rate and SpO₂ estimates come from the sensor firmware, not from this trace.
      </p>}
    </div>
  );
}
