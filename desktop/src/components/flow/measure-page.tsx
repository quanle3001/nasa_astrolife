import { HeartPulse, PenLine, SkipForward } from "lucide-react";
import { useState } from "react";
import { FlowPage, ProvenanceBadge } from "@/components/flow/common";
import { LiveMonitor } from "@/components/monitor/live-monitor";
import { SensorDock } from "@/components/monitor/sensor-dock";
import type { SensorViewState } from "@/components/monitor/sensor-state";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { MeasurementChoice } from "@/types/flow";

type Mode = "sensor" | "manual" | "none";
const optionalNumber = (text: string) => (text.trim() === "" ? null : Number(text));
const formatError = (text: string) => (text.trim() === "" || Number.isFinite(Number(text)) ? "" : "Enter a number, or leave this blank.");

/**
 * Step 7: add a pulse and oxygen measurement, or continue without one.
 *
 * A sensor reading is never copied from this screen. Choosing it tells the
 * backend to use its own newest valid reading, so a stale or invalid value
 * cannot be submitted. Range checks stay in the Python backend.
 */
export function MeasurePage({ sensor, onConnectStart, onBack, onSubmit, busy, error, aside }: {
  sensor: SensorViewState; onConnectStart: (port: string) => void; onBack: () => void;
  onSubmit: (measurement: MeasurementChoice) => void; busy: boolean; error: string; aside?: React.ReactNode;
}) {
  const [mode, setMode] = useState<Mode>("sensor");
  const [heartRate, setHeartRate] = useState("");
  const [spo2, setSpo2] = useState("");
  const [quality, setQuality] = useState<"unknown" | "good" | "poor">("unknown");
  const manualError = formatError(heartRate) || formatError(spo2);
  const manualEmpty = heartRate.trim() === "" && spo2.trim() === "";
  const blocked = mode === "sensor" ? !sensor.usable : mode === "manual" ? Boolean(manualError) || manualEmpty : false;
  const submit = () => onSubmit(
    mode === "sensor" ? { use: "sensor" }
      : mode === "manual" ? { use: "manual", heart_rate: optionalNumber(heartRate), spo2: optionalNumber(spo2), signal_quality: quality }
        : { use: "none" },
  );
  const simulate = () => { onConnectStart("simulated stream"); void api.simulateSensor().catch(() => undefined); };
  const modes: { id: Mode; label: string; hint: string; icon: typeof HeartPulse }[] = [
    { id: "sensor", label: "Use the sensor reading", hint: sensor.usable ? `Current estimate: ${sensor.heartRate ?? "—"} bpm · ${sensor.spo2 ?? "—"}% SpO₂` : "Waiting for a usable reading", icon: HeartPulse },
    { id: "manual", label: "Enter values from another instrument", hint: "For an approved monitor you read yourself", icon: PenLine },
    { id: "none", label: "Continue without a measurement", hint: "Pulse and oxygen stay unassessed", icon: SkipForward },
  ];
  return (
    <FlowPage
      wide eyebrow="Step 6 · Measurement" title="Measure your pulse and blood oxygen"
      lead="Connect the ESP32, rest a fingertip on the sensor window and hold still for a few seconds. A missing or invalid measurement never blocks your check-in and is never treated as normal."
      onBack={onBack} onNext={submit} nextDisabled={blocked} busy={busy} nextLabel="See my findings" aside={aside}
    >
      <SensorDock state={sensor} onConnectStart={onConnectStart} />
      <LiveMonitor state={sensor} onSimulate={simulate} />
      <fieldset className="measure-choice">
        <legend>Which measurement should this check-in include?</legend>
        <div className="measure-options" role="radiogroup" aria-label="Measurement to include">
          {modes.map(({ id, label, hint, icon: Icon }) => (
            <button key={id} type="button" role="radio" aria-checked={mode === id} className={cn("measure-option", mode === id && "is-selected")} onClick={() => setMode(id)}>
              <Icon className="size-4 shrink-0" aria-hidden="true" /><span><strong>{label}</strong><small>{hint}</small></span>
            </button>
          ))}
        </div>
        {mode === "sensor" && (
          <p className="measure-hint">
            {sensor.usable ? <ProvenanceBadge kind={sensor.source === "simulated" ? "simulated" : "measurement"} /> : null}
            {sensor.usable ? " The newest valid reading at the moment you continue is recorded with its timestamp." : " No usable reading yet. Keep your finger on the sensor, or choose another option."}
          </p>
        )}
        {mode === "manual" && (
          <div className="form-grid manual-grid">
            <label><span>Heart rate (bpm)</span><input className="control" inputMode="decimal" value={heartRate} onChange={(event) => setHeartRate(event.target.value)} placeholder="Optional" aria-invalid={formatError(heartRate) ? true : undefined} /></label>
            <label><span>SpO₂ (%)</span><input className="control" inputMode="decimal" value={spo2} onChange={(event) => setSpo2(event.target.value)} placeholder="Optional" aria-invalid={formatError(spo2) ? true : undefined} /></label>
            <label><span>Reading quality</span><select className="control" value={quality} onChange={(event) => setQuality(event.target.value as typeof quality)}><option value="unknown">Unknown / not checked</option><option value="good">Good · stable repeated reading</option><option value="poor">Poor · motion or unstable contact</option></select></label>
            {manualError && <small className="field-error col-span-full">{manualError}</small>}
          </div>
        )}
      </fieldset>
      {error && <div role="alert" className="flow-error">{error}</div>}
    </FlowPage>
  );
}
