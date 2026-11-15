import { ClipboardCheck, NotebookPen } from "lucide-react";
import { useState, type FormEvent } from "react";
import { MissionSelector } from "@/components/mission-selector";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { AppConfig, CheckIn, MissionId } from "@/types/backend";

const optionalNumber = (value: string) => value.trim() === "" ? null : Number(value);

export function CheckinPage({ config, mission, setMission, onAssess, busy }: {
  config: AppConfig; mission: MissionId; setMission: (mission: MissionId) => void;
  onAssess: (checkin: CheckIn) => Promise<void>; busy: boolean;
}) {
  const [heartRate, setHeartRate] = useState("");
  const [spo2, setSpo2] = useState("");
  const [sleep, setSleep] = useState("");
  const [quality, setQuality] = useState<CheckIn["signal_quality"]>("unknown");
  const [exercise, setExercise] = useState("unknown");
  const [symptoms, setSymptoms] = useState<Set<string>>(new Set());
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");

  const toggleSymptom = (key: string) => setSymptoms((current) => {
    const next = new Set(current); next.has(key) ? next.delete(key) : next.add(key); return next;
  });
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setError("");
    try {
      await onAssess({
        mission, heart_rate: optionalNumber(heartRate), spo2: optionalNumber(spo2), signal_quality: quality,
        sleep_hours: optionalNumber(sleep), symptoms: [...symptoms],
        exercise_completed: exercise === "yes" ? true : exercise === "no" ? false : null,
        notes: notes.trim(), input_source: "manual", sensor_port: "", sensor_received_at: "",
      });
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
  };

  return (
    <form onSubmit={submit} className="page-grid checkin-experience">
      <div className="page-heading immersive-heading"><div><div className="welcome-pill"><ClipboardCheck className="size-3.5" /> Crew wellness link</div><h1>Log the human side of <span className="gradient-text whitespace-nowrap">the mission.</span></h1><p>Record what you know. Leave missing readings blank; unreported symptoms are not ruled out.</p></div></div>
      <MissionSelector value={mission} onChange={setMission} />
      <Card className="p-5">
        <div className="mb-5 flex items-center gap-2"><NotebookPen className="size-4 text-cyan-300" /><h2 className="text-base font-semibold text-white">Mission and observations</h2></div>
        <div className="form-grid">
          <label><span>Mission context</span><select className="control" value={mission} onChange={(event) => setMission(event.target.value as MissionId)}>{Object.entries(config.missions).map(([id, title]) => <option value={id} key={id}>{title}</option>)}</select></label>
          <label><span>Heart rate (bpm)</span><input className="control" inputMode="decimal" value={heartRate} onChange={(event) => setHeartRate(event.target.value)} placeholder="Optional · beats per minute" /></label>
          <label><span>Estimated SpO₂ (%)</span><input className="control" inputMode="decimal" value={spo2} onChange={(event) => setSpo2(event.target.value)} placeholder="Optional · percent" /></label>
          <label><span>Reading quality</span><select className="control" value={quality} onChange={(event) => setQuality(event.target.value as CheckIn["signal_quality"])}><option value="unknown">Unknown / not checked</option><option value="good">Good · stable repeated reading</option><option value="poor">Poor · motion or unstable contact</option></select></label>
          <label><span>Sleep (hours)</span><input className="control" inputMode="decimal" value={sleep} onChange={(event) => setSleep(event.target.value)} placeholder="Optional · last 24 hours" /></label>
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
      {error && <div className="rounded-xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">{error}</div>}
      <div className="sticky bottom-0 z-20 flex items-center justify-between gap-4 rounded-2xl border border-white/10 p-3"><p className="hidden text-xs text-space-subtle md:block">Assessment stays in memory until you choose Save to history.</p><Button type="submit" variant="primary" size="lg" disabled={busy} className="ml-auto"><ClipboardCheck className="size-4" />{busy ? "Reviewing…" : "Review health priorities"}</Button></div>
    </form>
  );
}
