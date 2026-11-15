import { Activity, FlaskConical } from "lucide-react";
import { PpgChart } from "@/components/monitor/ppg-chart";
import { READING_STATE_TEXT, type SensorViewState } from "@/components/monitor/sensor-state";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

/**
 * Live optical pulse chart with the firmware's heart-rate and SpO2 estimates
 * and the engineering diagnostics that describe how they were obtained.
 */
export function LiveMonitor({ state, onSimulate, compact }: { state: SensorViewState; onSimulate?: () => void; compact?: boolean }) {
  const details = [
    ["Source", state.source === "simulated" ? "Simulated demo stream" : state.source === "sensor" ? "ESP32 + MAX30102" : "—"],
    // Until the first complete report arrives nothing is known about the firmware.
    ["Firmware", state.firmware || (state.connected ? (state.lastUpdate == null ? "Waiting for the first report" : "Older report-only firmware") : "—")],
    ["Sample rate", state.sampleRateHz != null ? `${state.sampleRateHz} samples/s` : "—"],
    ["Firmware window", state.signalStatus ?? "—"],
    ["Optical check", state.opticalState ?? "—"],
    ["Report consistency", state.readingState ? READING_STATE_TEXT[state.readingState] ?? state.readingState : "—"],
    ["Last complete report", state.measuredAt ? new Date(state.measuredAt).toLocaleTimeString() : "—"],
  ];
  return (
    <Card className="p-5" data-testid="live-monitor">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2"><Activity className="size-4 text-space-cyan" /><h2 className="telemetry-label">Live optical pulse · PPG</h2></div>
        {onSimulate && !state.connected && !state.connecting && (
          <Button size="sm" variant="ghost" onClick={onSimulate} title="Runs a clearly labelled synthetic stream through the real parser. Not a measurement.">
            <FlaskConical className="size-3.5" /> Run simulated stream
          </Button>
        )}
      </div>
      <div className="monitor-layout mt-4">
        <PpgChart height={compact ? 160 : 220} />
        <div className="monitor-vitals" aria-label="Latest sensor estimates">
          <div><span className="telemetry-label">Pulse</span><strong className={state.heartRate == null ? "is-empty" : undefined}>{state.heartRate ?? "No reading"}</strong><small>beats / min · estimate</small></div>
          <div><span className="telemetry-label">Blood oxygen</span><strong className={state.spo2 == null ? "is-empty" : undefined}>{state.spo2 ?? "No reading"}</strong><small>% SpO₂ · estimate</small></div>
        </div>
      </div>
      <p className="mt-3 text-xs leading-5 text-space-subtle">"No reading" means the sensor could not provide a usable estimate. It is not a normal result.</p>
      {!compact && (
        <details className="monitor-diagnostics">
          <summary>Sensor diagnostics</summary>
          <dl className="monitor-details">{details.map(([term, value]) => <div key={term}><dt>{term}</dt><dd>{value}</dd></div>)}</dl>
          <p className="mt-2 text-xs leading-5 text-space-subtle">These engineering checks do not prove accuracy.</p>
        </details>
      )}
    </Card>
  );
}
