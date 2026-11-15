import { ChevronDown } from "lucide-react";
import { useState } from "react";
import { FlowPage, ProvenanceBadge } from "@/components/flow/common";
import { LiveMonitor } from "@/components/monitor/live-monitor";
import { SensorDock } from "@/components/monitor/sensor-dock";
import type { SensorViewState } from "@/components/monitor/sensor-state";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { MeasurementChoice, NoMeasurementReason } from "@/types/flow";

type Fallback = "manual" | NoMeasurementReason;
const optionalNumber = (text: string) => (text.trim() === "" ? null : Number(text));
const formatError = (text: string) => (text.trim() === "" || Number.isFinite(Number(text)) ? "" : "Enter a number, or leave this blank.");

/** What still stands between the astronaut and a usable sensor reading. */
function sensorStep(sensor: SensorViewState): string {
  if (sensor.measurementReady) return `Stable measurement ready from ${sensor.samplesRequired} agreeing reports.`;
  if (sensor.usable) {
    if (sensor.readingState === "changing") return "Recent readings disagree. Keep your finger still while a fresh window is collected.";
    return `Reading detected. Collecting stable reports (${sensor.samplesCollected}/${sensor.samplesRequired})…`;
  }
  if (sensor.connecting) return "Opening the sensor link…";
  if (!sensor.connected) return "Connect the ESP32 sensor to take your reading.";
  return "Sensor connected. Rest your fingertip on the lit window and hold still until a reading appears.";
}

/**
 * Step 7: the pulse and blood-oxygen reading from the ESP32 + MAX30102.
 *
 * The sensor reading is a required part of every check-in. It is never copied
 * from this screen: continuing tells the backend to use its own newest valid
 * reading, so a stale or invalid value cannot be submitted.
 *
 * If the hardware genuinely cannot be used, a secondary path records values
 * from another instrument or the reason no measurement was possible. That
 * keeps a check-in from being lost, and the result then says the measurement
 * is missing instead of treating it as normal.
 */
export function MeasurePage({ sensor, onConnectStart, onBack, onSubmit, busy, error, aside }: {
  sensor: SensorViewState; onConnectStart: (port: string) => void; onBack: () => void;
  onSubmit: (measurement: MeasurementChoice) => void; busy: boolean; error: string; aside?: React.ReactNode;
}) {
  const [fallbackOpen, setFallbackOpen] = useState(false);
  const [fallback, setFallback] = useState<Fallback | null>(null);
  const [heartRate, setHeartRate] = useState("");
  const [spo2, setSpo2] = useState("");
  const [quality, setQuality] = useState<"unknown" | "good" | "poor">("unknown");
  const manualError = formatError(heartRate) || formatError(spo2);
  const manualReady = !manualError && (heartRate.trim() !== "" || spo2.trim() !== "");
  const fallbackReady = fallback === "manual" ? manualReady : fallback !== null;
  const submitFallback = () => {
    if (fallback === "manual") onSubmit({ use: "manual", heart_rate: optionalNumber(heartRate), spo2: optionalNumber(spo2), signal_quality: quality });
    else if (fallback) onSubmit({ use: "none", reason: fallback });
  };
  const [simulateError, setSimulateError] = useState("");
  const simulate = () => { setSimulateError(""); onConnectStart("simulated stream"); api.simulateSensor().catch((reason) => setSimulateError(reason instanceof Error ? reason.message : String(reason))); };
  const options: { id: Fallback; label: string; hint: string }[] = [
    { id: "manual", label: "Enter values from another approved instrument", hint: "Recorded as a manual entry" },
    { id: "no_stable_reading", label: "A stable reading could not be obtained", hint: "Pulse and oxygen will be recorded as not measured" },
    { id: "sensor_unavailable", label: "The sensor is not available or not working", hint: "Pulse and oxygen will be recorded as not measured" },
  ];
  return (
    <FlowPage
      wide title="Measure your pulse and blood oxygen"
      lead="Every check-in includes a reading from your fingertip sensor. Rest a fingertip on the lit window and hold still for a few seconds."
      onBack={onBack} onNext={() => onSubmit({ use: "sensor" })} nextDisabled={!sensor.measurementReady} busy={busy}
      nextLabel={sensor.source === "simulated" ? "Continue with simulated demo values" : "Use this reading and see my findings"}
      aside={<>{!sensor.measurementReady && <span className="flow-hint">Waiting for three agreeing reports</span>}{aside}</>}
    >
      <p className={cn("measure-status", sensor.measurementReady && "is-ready")} role="status">
        <span className="measure-required">Required</span>
        {sensorStep(sensor)}
        {sensor.measurementReady && <ProvenanceBadge kind={sensor.source === "simulated" ? "simulated" : "measurement"} />}
      </p>
      <SensorDock state={sensor} onConnectStart={onConnectStart} autoConnect />
      <LiveMonitor state={sensor} onSimulate={simulate} />
      {(error || simulateError) && <div role="alert" className="flow-error">{error || `The simulated stream could not start: ${simulateError}`}</div>}

      <section className="measure-fallback">
        <button type="button" className="measure-fallback-toggle" aria-expanded={fallbackOpen} aria-controls="measure-fallback" onClick={() => setFallbackOpen((open) => !open)}>
          <ChevronDown className={cn("size-4 transition-transform", fallbackOpen && "rotate-180")} aria-hidden="true" /> The sensor cannot be used right now
        </button>
        {fallbackOpen && (
          <div id="measure-fallback" className="measure-fallback-body">
            <p>Use this only when a sensor reading is not possible. Your findings will say that pulse and oxygen were not measured by the sensor; they are never assumed to be normal.</p>
            <div className="measure-options" role="radiogroup" aria-label="Why the sensor reading is missing">
              {options.map((option) => (
                <button key={option.id} type="button" role="radio" aria-checked={fallback === option.id} className={cn("measure-option", fallback === option.id && "is-selected")} onClick={() => setFallback(option.id)}>
                  <span><strong>{option.label}</strong><small>{option.hint}</small></span>
                </button>
              ))}
            </div>
            {fallback === "manual" && (
              <div className="form-grid manual-grid">
                <label><span>Heart rate (bpm)</span><input className="control" inputMode="decimal" value={heartRate} onChange={(event) => setHeartRate(event.target.value)} placeholder="Optional" aria-invalid={formatError(heartRate) ? true : undefined} /></label>
                <label><span>SpO₂ (%)</span><input className="control" inputMode="decimal" value={spo2} onChange={(event) => setSpo2(event.target.value)} placeholder="Optional" aria-invalid={formatError(spo2) ? true : undefined} /></label>
                <label><span>Reading quality</span><select className="control" value={quality} onChange={(event) => setQuality(event.target.value as typeof quality)}><option value="unknown">Unknown / not checked</option><option value="good">Good · stable repeated reading</option><option value="poor">Poor · motion or unstable contact</option></select></label>
                {manualError && <small className="field-error col-span-full">{manualError}</small>}
              </div>
            )}
            <button type="button" className="measure-fallback-submit" disabled={!fallbackReady || busy} onClick={submitFallback}>Continue without a sensor reading</button>
          </div>
        )}
      </section>
    </FlowPage>
  );
}
