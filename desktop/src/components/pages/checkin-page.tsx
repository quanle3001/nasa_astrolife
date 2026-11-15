import { ClipboardCheck, NotebookPen } from "lucide-react";
import { useState, type FormEvent } from "react";
import { ARIA_MOD, MOD } from "@/lib/shortcuts";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { AppConfig, CheckIn } from "@/types/backend";

const optionalNumber = (value: string) => value.trim() === "" ? null : Number(value);

type NumericField = "heart_rate" | "spo2" | "sleep_hours";
const FIELD_ORDER: NumericField[] = ["heart_rate", "spo2", "sleep_hours"];

/**
 * Format check only: is the entry a number? Range and clinical validation stay
 * in the Python backend and are unchanged.
 */
function numberError(value: string) {
  const trimmed = value.trim();
  if (trimmed === "" || Number.isFinite(Number(trimmed))) return "";
  return /\d,\d/.test(trimmed) ? "Use a decimal point, not a comma (for example 7.5)." : "Enter a number, or leave this blank.";
}

function NumberField({ id, label, value, onChange, onBlur, placeholder, error }: {
  id: NumericField; label: string; value: string; onChange: (value: string) => void; onBlur: () => void;
  placeholder: string; error: string;
}) {
  return (
    <label>
      <span>{label}</span>
      <input
        id={`checkin-${id}`}
        className="control"
        inputMode="decimal"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onBlur={onBlur}
        placeholder={placeholder}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `checkin-${id}-error` : undefined}
      />
      {error && <small id={`checkin-${id}-error`} className="field-error">{error}</small>}
    </label>
  );
}

/**
 * Health-concern report: the free-form check-in used when the astronaut wants
 * to report something outside the guided flow. It is reachable from every
 * screen and goes to the same Python rules.
 */
export function CheckinPage({ config, onAssess, busy, onCancel }: {
  config: AppConfig; onAssess: (checkin: CheckIn) => Promise<void>; busy: boolean; onCancel?: () => void;
}) {
  const [heartRate, setHeartRate] = useState("");
  const [spo2, setSpo2] = useState("");
  const [sleep, setSleep] = useState("");
  const [quality, setQuality] = useState<CheckIn["signal_quality"]>("unknown");
  const [exercise, setExercise] = useState("unknown");
  const [symptoms, setSymptoms] = useState<Set<string>>(new Set());
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<NumericField, string>>({ heart_rate: "", spo2: "", sleep_hours: "" });
  const values: Record<NumericField, string> = { heart_rate: heartRate, spo2, sleep_hours: sleep };
  const checkField = (field: NumericField) => setFieldErrors((current) => ({ ...current, [field]: numberError(values[field]) }));
  const edit = (field: NumericField, setter: (value: string) => void) => (value: string) => {
    setter(value);
    // Clear a shown error as soon as the entry becomes valid; new errors wait for blur.
    if (fieldErrors[field] && !numberError(value)) setFieldErrors((current) => ({ ...current, [field]: "" }));
  };

  const toggleSymptom = (key: string) => setSymptoms((current) => {
    const next = new Set(current); next.has(key) ? next.delete(key) : next.add(key); return next;
  });
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setError("");
    const errors = Object.fromEntries(FIELD_ORDER.map((field) => [field, numberError(values[field])])) as Record<NumericField, string>;
    setFieldErrors(errors);
    const firstInvalid = FIELD_ORDER.find((field) => errors[field]);
    if (firstInvalid) { document.getElementById(`checkin-${firstInvalid}`)?.focus(); return; }
    try {
      await onAssess({
        heart_rate: optionalNumber(heartRate), spo2: optionalNumber(spo2), signal_quality: quality,
        sleep_hours: optionalNumber(sleep), symptoms: [...symptoms],
        exercise_completed: exercise === "yes" ? true : exercise === "no" ? false : null,
        notes: notes.trim(), input_source: "manual", sensor_port: "", sensor_received_at: "",
      });
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
  };

  return (
    <form id="checkin-form" onSubmit={submit} className="page-grid checkin-experience">
      <div className="page-heading immersive-heading"><div><p className="telemetry-label">Available from every screen</p><h1>Report a health concern</h1><p>Select what applies and add any reading you have. Leave missing readings blank; unreported symptoms are not ruled out. For an emergency, follow the mission emergency procedure first.</p></div>{onCancel && <Button onClick={onCancel}>Return without reporting</Button>}</div>
      <Card className="p-5">
        <div className="mb-5 flex items-center gap-2"><NotebookPen className="size-4 text-cyan-300" /><h2 className="text-base font-semibold text-white">Readings and observations</h2></div>
        <div className="form-grid">
          <NumberField id="heart_rate" label="Heart rate (bpm)" value={heartRate} onChange={edit("heart_rate", setHeartRate)} onBlur={() => checkField("heart_rate")} placeholder="Optional · beats per minute" error={fieldErrors.heart_rate} />
          <NumberField id="spo2" label="Estimated SpO₂ (%)" value={spo2} onChange={edit("spo2", setSpo2)} onBlur={() => checkField("spo2")} placeholder="Optional · percent" error={fieldErrors.spo2} />
          <label><span>Reading quality</span><select className="control" value={quality} onChange={(event) => setQuality(event.target.value as CheckIn["signal_quality"])}><option value="unknown">Unknown / not checked</option><option value="good">Good · stable repeated reading</option><option value="poor">Poor · motion or unstable contact</option></select></label>
          <NumberField id="sleep_hours" label="Sleep (hours)" value={sleep} onChange={edit("sleep_hours", setSleep)} onBlur={() => checkField("sleep_hours")} placeholder="Optional · last 24 hours" error={fieldErrors.sleep_hours} />
          <label><span>Prescribed exercise</span><select className="control" value={exercise} onChange={(event) => setExercise(event.target.value)}><option value="unknown">Not recorded / not applicable</option><option value="yes">Completed prescribed session</option><option value="no">Missed prescribed session</option></select></label>
        </div>
      </Card>
      <Card className="p-5">
        <h2 className="text-base font-semibold text-white">Symptoms and mission alerts reported today</h2>
        <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {Object.entries(config.symptoms).map(([key, title]) => (
            <label key={key} className="check-tile"><input type="checkbox" checked={symptoms.has(key)} onChange={() => toggleSymptom(key)} /><span>{title}</span></label>
          ))}
        </div>
      </Card>
      <Card className="p-5"><label className="block"><span className="mb-2 block text-xs font-medium text-space-muted">Notes for your record · not automatically analyzed</span><textarea className="control min-h-28 resize-y" maxLength={5000} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Optional: timing, activity, changes from baseline, or information for the medical team." /></label></Card>
      {error && <div role="alert" className="rounded-xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">{error}</div>}
      <div className="sticky bottom-0 z-20 flex items-center justify-between gap-4 rounded-2xl border border-white/10 p-3"><p className="hidden text-xs text-space-subtle md:block">Assessment stays in memory until you choose Save to history.</p><Button type="submit" variant="primary" size="lg" disabled={busy} className="ml-auto" title={`Review health priorities (${MOD} Enter)`} aria-keyshortcuts={`${ARIA_MOD}+Enter`}><ClipboardCheck className="size-4" />{busy ? "Reviewing…" : "Review health priorities"}<kbd className="kbd kbd-on-primary" aria-hidden="true">{MOD}↵</kbd></Button></div>
    </form>
  );
}
