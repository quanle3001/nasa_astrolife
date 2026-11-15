import { Activity, BookOpen, ClipboardList, ListChecks, TrendingUp } from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useState, type ReactNode } from "react";
import { FALLBACK_URGENT_ACTION, UrgentPanel } from "@/components/flow/urgent-panel";
import { FlowPage, LEVEL_LABELS, measurementKind, ProvenanceBadge, SourceList } from "@/components/flow/common";
import { PointerGlow } from "@/components/effects/interactive";
import { Card } from "@/components/ui/card";
import { api } from "@/lib/api";
import { useCalmMotion } from "@/lib/motion-preference";
import { cn } from "@/lib/utils";
import type { AppConfig, HistoryEntry } from "@/types/backend";
import type { Knowledge, SessionResult } from "@/types/flow";

function Section({ icon: Icon, title, badge, children, index }: { icon: typeof Activity; title: string; badge?: ReactNode; children: ReactNode; index: number }) {
  const reduced = useCalmMotion();
  return (
    <motion.section initial={reduced ? false : { opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: reduced ? 0 : index * 0.07, duration: 0.3 }}>
      <Card className="findings-section">
        <PointerGlow className="findings-section-inner">
          <header><span className="findings-number">{index + 1}</span><Icon className="size-4 text-space-cyan" aria-hidden="true" /><h2>{title}</h2>{badge}</header>
          {children}
        </PointerGlow>
      </Card>
    </motion.section>
  );
}

const when = (iso: string) => { const date = new Date(iso); return Number.isNaN(date.getTime()) ? iso : date.toLocaleString(); };

/**
 * Step 8: the result of the Python rules, laid out in five separate parts so a
 * measurement, a reported observation, a trend, a rule-based prompt and NASA
 * research are never confused with each other.
 */
export function FindingsPage({ result, entryId, config, knowledge, onNext, onExit, nextLabel }: {
  result: SessionResult; entryId: number | null; config: AppConfig; knowledge: Knowledge;
  onNext: () => void; onExit?: () => void; nextLabel?: string;
}) {
  const { checkin, assessment, session_notes: notes } = result;
  const { catalog } = knowledge;
  const [history, setHistory] = useState<HistoryEntry[] | null>(null);
  useEffect(() => { let alive = true; api.listHistory().then((data) => { if (alive) setHistory(data.entries); }).catch(() => { if (alive) setHistory([]); }); return () => { alive = false; }; }, [entryId]);

  const hasMeasurement = checkin.heart_rate != null || checkin.spo2 != null;
  const kind = measurementKind(checkin.input_source, hasMeasurement);
  const flagged = assessment.findings.filter((finding) => finding.level !== "info" && (assessment.level !== "urgent" || finding.level === "urgent"));
  const later = assessment.level === "urgent" ? assessment.findings.filter((finding) => finding.level !== "info" && finding.level !== "urgent") : [];
  const notAssessed = notes.filter((note) => /^(Unsure|Skipped|Not answered):/.test(note));
  const otherNotes = notes.filter((note) => !/^(Unsure|Skipped|Not answered):/.test(note) && !note.startsWith("These items"));
  const earlier = (history ?? []).filter((entry) => entry.id !== entryId && (entry.checkin.heart_rate != null || entry.checkin.spo2 != null) && entry.checkin.input_source !== "simulated").slice(0, 4);
  const qualityNotes = assessment.data_notes.filter((note) => /signal quality|pulse oximeters|spo2 was not provided|heart rate was not provided|spo2 prompts/i.test(note));

  return (
    <FlowPage
      wide eyebrow="Step 7 · Findings" title="What your check-in shows"
      lead={assessment.summary} onNext={onNext} nextLabel={nextLabel ?? "Explore the Health Compass"}
      aside={onExit ? <button type="button" className="text-link" onClick={onExit}>Back to dashboard</button> : undefined}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className={cn("priority-badge", `priority-${assessment.level}`)}>{LEVEL_LABELS[assessment.level]}</span>
        <ProvenanceBadge kind="rule" />
        <span className="text-xs text-space-subtle">Saved to local history · {when(assessment.created_at)}</span>
      </div>
      {assessment.level === "urgent" && <UrgentPanel assessment={assessment} conditionTitles={config.condition_titles} sources={catalog.sources} />}

      <Section index={0} icon={Activity} title="Measurement quality" badge={kind ? <ProvenanceBadge kind={kind} /> : undefined}>
        {hasMeasurement ? (
          <dl className="fact-grid">
            <div><dt>Heart rate</dt><dd>{checkin.heart_rate != null ? `${checkin.heart_rate} bpm` : "Not available"}</dd></div>
            <div><dt>Estimated SpO₂</dt><dd>{checkin.spo2 != null ? `${checkin.spo2}%` : "Not available"}</dd></div>
            <div><dt>Signal quality</dt><dd>{checkin.signal_quality === "good" ? "Good (self-reported)" : checkin.signal_quality === "poor" ? "Poor or still settling" : "Unknown"}</dd></div>
            <div><dt>Measured</dt><dd>{checkin.sensor_received_at ? when(checkin.sensor_received_at) : "Time not recorded"}</dd></div>
          </dl>
        ) : <p className="empty-line">No measurement was included. Pulse and oxygen are unassessed, not normal.</p>}
        <ul className="dot-list muted">{qualityNotes.map((note) => <li key={note}>{note}</li>)}</ul>
      </Section>

      <Section index={1} icon={ClipboardList} title="What you reported">
        {checkin.symptoms.length > 0
          ? <ul className="risk-chips">{checkin.symptoms.map((key) => <li key={key}>{config.symptoms[key] ?? key}</li>)}</ul>
          : <p className="empty-line">No symptom or alert was reported in this check-in.</p>}
        <dl className="fact-grid">
          <div><dt>Sleep</dt><dd>{checkin.sleep_hours != null ? `${checkin.sleep_hours} hours` : "Not reported"}</dd></div>
          <div><dt>Prescribed exercise</dt><dd>{checkin.exercise_completed == null ? "Not reported" : checkin.exercise_completed ? "Completed" : "Missed"}</dd></div>
        </dl>
        {checkin.notes && <p className="detail-notes">{checkin.notes}</p>}
        {notAssessed.length > 0 && (
          <div className="not-assessed"><strong>Not assessed · not treated as normal</strong><ul>{notAssessed.map((note) => <li key={note}>{note}</li>)}</ul></div>
        )}
        {otherNotes.map((note) => <p key={note} className="empty-line">{note}</p>)}
      </Section>

      <Section index={2} icon={TrendingUp} title="Compared with earlier saved measurements">
        {history === null ? <p className="empty-line" aria-busy="true">Loading saved measurements…</p>
          : !hasMeasurement || earlier.length === 0 ? <p className="empty-line">A trend needs this check-in and at least one earlier saved measurement. None is available yet, so no trend is shown.</p>
            : (
              <>
                <table className="trend-table">
                  <thead><tr><th scope="col">Recorded</th><th scope="col">Heart rate</th><th scope="col">SpO₂</th><th scope="col">Source</th></tr></thead>
                  <tbody>
                    <tr className="is-current"><td>This check-in</td><td>{checkin.heart_rate ?? "—"}</td><td>{checkin.spo2 ?? "—"}</td><td>{checkin.input_source}</td></tr>
                    {earlier.map((entry) => <tr key={entry.id}><td>{when(entry.created_at)}</td><td>{entry.checkin.heart_rate ?? "—"}</td><td>{entry.checkin.spo2 ?? "—"}</td><td>{entry.checkin.input_source ?? "manual"}</td></tr>)}
                  </tbody>
                </table>
                <p className="empty-line">Values are listed for your own comparison. AstroLife does not interpret a change between them; share an unexpected change with the medical team.</p>
              </>
            )}
      </Section>

      <Section index={3} icon={ListChecks} title="Follow-up prompts" badge={<ProvenanceBadge kind="rule" />}>
        {flagged.length === 0 && <p className="empty-line">No follow-up prompt was triggered by what was entered. This is not a health clearance.</p>}
        <div className="finding-list">
          {flagged.map((finding) => (
            <article key={finding.condition_id} className="finding-item">
              <header><h3>{config.condition_titles[finding.condition_id] ?? finding.condition_id}</h3><span className={cn("priority-badge", `priority-${finding.level}`)}>{LEVEL_LABELS[finding.level]}</span></header>
              <p>{finding.reason}</p>
              {finding.actions.length > 0 ? <ul className="dot-list">{[...new Set(finding.actions)].map((action) => <li key={action}>{action}</li>)}</ul> : assessment.level === "urgent" && <p>{FALLBACK_URGENT_ACTION}</p>}
            </article>
          ))}
        </div>
        {later.length > 0 && <p className="empty-line">{later.length} lower-priority prompt{later.length > 1 ? "s are" : " is"} saved in your Action Center for after the urgent concern is handled.</p>}
      </Section>

      <Section index={4} icon={BookOpen} title="NASA scientific context" badge={<ProvenanceBadge kind="evidence" />}>
        {flagged.length === 0 && <p className="empty-line">Open the Health Compass to read NASA research for any body system.</p>}
        <div className="finding-list">
          {flagged.map((finding) => {
            const condition = catalog.conditions.find((item) => item.id === finding.condition_id);
            if (!condition) return null;
            return (
              <article key={finding.condition_id} className="finding-item is-evidence">
                <header><h3>{condition.title}</h3></header>
                <p>{condition.why_it_matters}</p>
                {condition.research[0] && <p className="research-line">Research: {condition.research[0].text}</p>}
                <p className="limit-line">Limit: {condition.limitations}</p>
                <SourceList ids={[...condition.source_ids, ...finding.source_ids]} sources={catalog.sources} />
              </article>
            );
          })}
        </div>
        <p className="empty-line">NASA research explains context. It does not set your diagnosis, a clinical threshold or a treatment.</p>
      </Section>
    </FlowPage>
  );
}
