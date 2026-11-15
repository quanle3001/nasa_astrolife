import { Database, History as HistoryIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { api } from "@/lib/api";
import { cn, formatDate } from "@/lib/utils";
import type { AppConfig, HistoryEntry } from "@/types/backend";

export function HistoryPage({ config, active, refreshKey }: { config: AppConfig; active: boolean; refreshKey: number }) {
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!active) return;
    api.listHistory().then(({ entries: next }) => { setEntries(next); setSelected((current) => current && next.some((item) => item.id === current) ? current : next[0]?.id ?? null); setError(""); }).catch((reason) => setError(reason instanceof Error ? reason.message : String(reason)));
  }, [active, refreshKey]);
  const entry = entries.find((item) => item.id === selected) ?? null;
  return (
    <div className="page-grid">
      <div className="page-heading"><div><p className="telemetry-label text-teal-300">Local crew records</p><h1>Health history</h1><p>Saved on this computer. Past priorities reflect the observations recorded at that time.</p></div><div className="hidden items-center gap-2 text-xs text-space-subtle lg:flex"><Database className="size-4" />{config.history_path}</div></div>
      {error && <div className="rounded-xl border border-rose-400/30 bg-rose-500/10 p-4 text-sm text-rose-100">{error}</div>}
      {!entries.length ? (
        <Card className="grid min-h-80 place-items-center p-8 text-center"><div><HistoryIcon className="mx-auto size-10 text-space-subtle" /><h2 className="mt-4 text-xl font-semibold text-white">No saved check-ins</h2><p className="mt-2 max-w-md text-sm text-space-subtle">Review a Daily Check-in, then choose Save to history on the Assessment page to keep a local record.</p></div></Card>
      ) : (
        <div className="grid min-h-[520px] gap-3 lg:grid-cols-[360px_1fr]">
          <Card className="overflow-hidden p-2"><div className="max-h-[70vh] space-y-1 overflow-auto">{entries.map((item) => <button key={item.id} type="button" onClick={() => setSelected(item.id)} className={cn("w-full rounded-xl border px-3 py-3 text-left transition", selected === item.id ? "border-cyan-300/25 bg-cyan-300/[.08]" : "border-transparent hover:bg-white/[.04]")}><div className="flex items-center justify-between gap-2"><span className="text-sm font-semibold text-space-white">{config.missions[item.checkin.mission]}</span><span className={cn("priority-badge", `priority-${item.assessment.level}`)}>{item.assessment.level}</span></div><div className="mt-2 text-xs text-space-subtle">{formatDate(item.created_at)}</div></button>)}</div></Card>
          {entry && <Card className="overflow-auto p-6"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="telemetry-label">Recorded assessment</p><h2 className="mt-2 text-2xl font-semibold text-white">{entry.assessment.summary}</h2></div><span className={cn("priority-badge", `priority-${entry.assessment.level}`)}>{entry.assessment.level}</span></div><div className="mt-5 grid gap-2 rounded-xl border border-white/[.07] bg-black/15 p-4 text-sm text-space-silver sm:grid-cols-3"><div><span className="text-space-subtle">Heart rate</span><br />{entry.checkin.heart_rate ?? "Not recorded"} {entry.checkin.heart_rate != null && "bpm"}</div><div><span className="text-space-subtle">SpO₂</span><br />{entry.checkin.spo2 ?? "Not recorded"} {entry.checkin.spo2 != null && "%"}</div><div><span className="text-space-subtle">Sleep</span><br />{entry.checkin.sleep_hours ?? "Not recorded"} {entry.checkin.sleep_hours != null && "hours"}</div></div><div className="mt-5 space-y-3">{entry.assessment.findings.filter((item) => item.level !== "info").map((finding, index) => <div key={`${finding.condition_id}-${index}`} className="rounded-xl border border-white/[.07] bg-white/[.025] p-4"><div className="font-semibold text-white">{config.condition_titles[finding.condition_id] || finding.condition_id.replaceAll("_", " ")}</div><p className="mt-2 text-sm leading-6 text-space-muted">{finding.reason}</p></div>)}</div><div className="mt-6 border-t border-white/[.08] pt-4 text-xs leading-5 text-space-subtle"><b className="text-space-muted">Reported symptoms:</b> {entry.checkin.symptoms.map((key) => config.symptoms[key] || key).join(", ") || "None reported; conditions are not ruled out."}<br /><b className="text-space-muted">Notes (not analyzed):</b> {entry.checkin.notes || "None"}</div></Card>}
        </div>
      )}
    </div>
  );
}
