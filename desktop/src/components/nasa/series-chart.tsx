import { useEffect, useRef, useState } from "react";
import uPlot from "uplot";
import "uplot/dist/uPlot.min.css";

/**
 * Interactive line chart for one published time series. `hours` are hours
 * since the start of the dataset window; values are drawn exactly as
 * retrieved. `overlay` adds a second line on the same time axis (the hourly
 * mean computed by the backend). Moving the cursor over the chart reads out
 * the time and values under it.
 */
export function SeriesChart({ hours, values, label, overlay, color = "#9dcddc", height = 260 }: {
  hours: number[]; values: number[]; label: string;
  overlay?: { values: (number | null)[]; label: string };
  color?: string; height?: number;
}) {
  const host = useRef<HTMLDivElement>(null);
  const [readout, setReadout] = useState("Move the pointer over the chart to read a value.");
  useEffect(() => {
    const element = host.current;
    if (!element) return undefined;
    const axis = { stroke: "#8eabb7", grid: { stroke: "rgba(86,146,169,.14)", width: 1 }, ticks: { stroke: "rgba(86,146,169,.24)", width: 1 } };
    const clock = (hour: number) => `${String(Math.floor(hour)).padStart(2, "0")}:${String(Math.round((hour % 1) * 60) % 60).padStart(2, "0")}`;
    const plot = new uPlot({
      width: Math.max(element.clientWidth, 280), height,
      legend: { show: false },
      cursor: { drag: { x: false, y: false }, points: { size: 7 } },
      scales: { x: { time: false, range: [0, 24] }, y: { auto: true } },
      axes: [{ ...axis, values: (_plot, ticks) => ticks.map((tick) => `${tick}h`) }, { ...axis, size: 56 }],
      series: [
        {},
        { label, stroke: color, width: 1.5, points: { show: values.length < 60, size: 5 } },
        ...(overlay ? [{ label: overlay.label, stroke: "#f5c67b", width: 2, dash: [6, 4], points: { show: false }, paths: uPlot.paths.stepped?.({ align: 1 }) }] : []),
      ],
      hooks: {
        setCursor: [(chart) => {
          const index = chart.cursor.idx;
          if (index == null || hours[index] == null) return;
          const mean = overlay?.values[index];
          setReadout(`${clock(hours[index])} · reading ${values[index]}${mean != null ? ` · hourly mean ${mean.toFixed(2)}` : ""}`);
        }],
      },
    }, overlay ? [hours, values, overlay.values] : [hours, values], element);
    const resize = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(() => plot.setSize({ width: Math.max(element.clientWidth, 280), height }));
    resize?.observe(element);
    return () => { resize?.disconnect(); plot.destroy(); };
  }, [hours, values, label, overlay, color, height]);
  return (
    <div className="series-chart">
      <div ref={host} role="img" aria-label={`${label}: ${values.length} readings across the day${overlay ? `, with ${overlay.label}` : ""}. The statistics and the table below give the same information as text.`} />
      <p className="series-readout" aria-live="off">
        <span className="series-key"><i style={{ background: color }} />Readings</span>
        {overlay && <span className="series-key"><i className="is-dashed" />{overlay.label}</span>}
        <span>{readout}</span>
      </p>
    </div>
  );
}
