import { AlertOctagon, Check, Edit3, Save, ShieldCheck, Stethoscope } from "lucide-react";
import { motion } from "motion/react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { AppConfig, AssessmentBundle } from "@/types/backend";

const LEVEL_LABELS = { urgent: "Act now", review: "Medical review", watch: "Follow up", info: "Prevention & monitoring" } as const;

export function AssessmentPage({ config, bundle, saved, saving, onSave, onEdit }: {
  config: AppConfig; bundle: AssessmentBundle | null; saved: boolean; saving: boolean;
  onSave: () => Promise<void>; onEdit: () => void;
}) {
  if (!bundle) {
    return (
      <div className="page-grid">
        <div className="page-heading"><div><h1>Health priorities & next steps</h1><p>Complete a check-in or review a fresh sensor reading to see current priorities.</p></div></div>
        <Card className="grid min-h-80 place-items-center p-8 text-center"><div><ShieldCheck className="mx-auto size-10 text-space-subtle" /><h2 className="mt-4 text-xl font-semibold text-white">No assessment in memory</h2><p className="mt-2 text-sm text-space-subtle">No input has been analyzed yet. Connect your sensor or enter an optional check-in.</p><Button className="mt-5" onClick={onEdit}>Open daily check-in</Button></div></Card>
      </div>
    );
  }
  const { assessment } = bundle;
  const findings = assessment.findings.filter((finding) => finding.level !== "info" && (assessment.level !== "urgent" || finding.level === "urgent"));
  const urgentActions = [...new Set(assessment.findings.filter((item) => item.level === "urgent").flatMap((item) => item.actions))];
  return (
    <div className="page-grid">
      <div className="page-heading">
        <div><h1>Health priorities & next steps</h1><p>Explainable local assessment from the observations recorded in this session.</p></div>
        <div className="flex gap-2"><Button onClick={onEdit}><Edit3 className="size-4" /> Edit check-in</Button><Button variant="primary" disabled={saved || saving} onClick={() => void onSave()}>{saved ? <Check className="size-4" /> : <Save className="size-4" />}{saved ? "Saved" : saving ? "Saving…" : "Save to history"}</Button></div>
      </div>
      <Card className={cn("overflow-hidden p-5", assessment.level === "urgent" && "border-rose-400/40 bg-rose-950/25")}>
        <div className="flex items-start gap-4"><div className={cn("grid size-11 shrink-0 place-items-center rounded-xl", assessment.level === "urgent" ? "bg-rose-500/15 text-rose-300" : "bg-cyan-300/10 text-cyan-300")}><Stethoscope className="size-5" /></div><div><div className={cn("priority-badge", `priority-${assessment.level}`)}>{LEVEL_LABELS[assessment.level]}</div><h2 className="mt-3 text-xl font-semibold text-white">{assessment.summary}</h2></div></div>
      </Card>
      {assessment.level === "urgent" && (
        <div className="rounded-2xl border border-rose-400/50 bg-rose-500/15 p-5 text-rose-50">
          <div className="flex items-start gap-3"><AlertOctagon className="mt-0.5 size-6 shrink-0 text-rose-300" /><div><div className="text-xs font-black tracking-[.18em] text-rose-300">ACT NOW</div><p className="mt-2 font-semibold">{urgentActions[0] || "Follow the mission emergency procedure and contact the crew medical officer now."}</p>{urgentActions.length > 1 && <p className="mt-2 text-sm text-rose-100/70">Additional urgent actions are listed below.</p>}</div></div>
        </div>
      )}
      <div className="space-y-3">
        {findings.length ? findings.map((finding, index) => (
          <motion.div key={`${finding.condition_id}-${index}`} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.06 }}>
            <Card className="p-5"><div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-lg font-semibold text-white">{config.condition_titles[finding.condition_id] || finding.condition_id.replaceAll("_", " ")}</h2><span className={cn("priority-badge", `priority-${finding.level}`)}>{LEVEL_LABELS[finding.level]}</span></div><p className="mt-3 text-sm leading-6 text-space-silver">{finding.reason}</p>{finding.actions.length > 0 && <div className="mt-4 border-t border-white/[.08] pt-4"><div className="telemetry-label">Suggested next steps</div><ul className="mt-3 space-y-2 text-sm text-space-silver">{[...new Set(finding.actions)].map((action) => <li key={action} className="flex gap-2"><span className="mt-2 size-1 shrink-0 rounded-full bg-teal-300" />{action}</li>)}</ul></div>}</Card>
          </motion.div>
        )) : <Card className="p-5 text-sm text-space-muted">No specific follow-up trigger was entered. This does not establish that you are healthy.</Card>}
      </div>
      <Card className="p-4 text-xs leading-5 text-space-subtle">Pulse and oxygen estimates cannot diagnose a condition or assess radiation exposure, bone health, eye changes, or mental health. Seek help for concerning symptoms even if a reading looks typical.</Card>
      <p className="text-xs text-space-subtle">{saved ? "Saved to local health history." : "Unsaved assessment. Save only if you want a local record on this computer."}<br />Local history file (unencrypted): {config.history_path}</p>
    </div>
  );
}
