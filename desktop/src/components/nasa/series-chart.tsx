import { useEffect, useRef } from "react";
import uPlot from "uplot";
import "uplot/dist/uPlot.min.css";

/**
 * Static line chart for one published time series. `hours` are hours since the
 * start of the dataset window; values are drawn exactly as retrieved.
 */
export function SeriesChart({ hours, values, label, color = "#8ec5ff", height = 240 }: {
  hours: number[]; values: number[]; label: string; color?: string; height?: number;
}) {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = host.current;
    if (!element) return undefined;
    const axis = { stroke: "#7c8ca3", grid: { stroke: "rgba(120,156,196,.12)", width: 1 }, ticks: { stroke: "rgba(120,156,196,.2)", width: 1 } };
    const plot = new uPlot({
      width: Math.max(element.clientWidth, 280), height,
      legend: { show: false },
      cursor: { drag: { x: false, y: false } },
      scales: { x: { time: false, range: [0, 24] }, y: { auto: true } },
      axes: [{ ...axis, values: (_plot, ticks) => ticks.map((tick) => `${tick}h`) }, { ...axis, size: 56 }],
      series: [{}, { label, stroke: color, width: 1.5, points: { show: values.length < 60, size: 5 } }],
    }, [hours, values], element);
    const resize = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(() => plot.setSize({ width: Math.max(element.clientWidth, 280), height }));
    resize?.observe(element);
    return () => { resize?.disconnect(); plot.destroy(); };
  }, [hours, values, label, color, height]);
  return <div ref={host} role="img" aria-label={`${label}: ${values.length} readings across the day. The table below lists the range for every instrument.`} />;
}
