import { ArrowLeft, ArrowRight, BookOpen, ExternalLink, FlaskConical, HeartPulse, History, ListChecks, PenLine } from "lucide-react";
import type { ReactNode } from "react";
import { Magnetic } from "@/components/effects/interactive";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { MeasurementSource, PriorityLevel } from "@/types/backend";
import type { EvidenceReport, EvidenceTraceEntry, Source } from "@/types/flow";

export const LEVEL_LABELS: Record<PriorityLevel, string> = {
  urgent: "Act now", review: "Medical review", watch: "Follow up", info: "Monitoring only",
};

/**
 * The four kinds of information AstroLife shows, kept visibly apart:
 * NASA research, historical instrument data, the astronaut's own measurement,
 * and the app's rule-based prompts.
 */
export type ProvenanceKind = "evidence" | "historical" | "measurement" | "manual" | "simulated" | "rule";

const PROVENANCE: Record<ProvenanceKind, { label: string; icon: typeof BookOpen; className: string }> = {
  evidence: { label: "NASA scientific evidence", icon: BookOpen, className: "provenance-evidence" },
  historical: { label: "Historical research measurement", icon: History, className: "provenance-historical" },
  measurement: { label: "Your sensor measurement", icon: HeartPulse, className: "provenance-measurement" },
  manual: { label: "Your manual entry", icon: PenLine, className: "provenance-measurement" },
  simulated: { label: "Simulated data · not a measurement", icon: FlaskConical, className: "provenance-simulated" },
  rule: { label: "Rule-based prompt", icon: ListChecks, className: "provenance-rule" },
};

export function ProvenanceBadge({ kind, label }: { kind: ProvenanceKind; label?: string }) {
  const { icon: Icon, className, label: fallback } = PROVENANCE[kind];
  return <span className={cn("provenance-badge", className)}><Icon className="size-3" aria-hidden="true" />{label ?? fallback}</span>;
}

/** Badge for a measurement's origin; `null` when there is no measurement. */
export function measurementKind(source: MeasurementSource | undefined, hasValue: boolean): ProvenanceKind | null {
  if (!hasValue) return null;
  return source === "sensor" ? "measurement" : source === "simulated" ? "simulated" : "manual";
}

const isNasa = (url: string) => { try { const host = new URL(url).hostname; return host === "nasa.gov" || host.endsWith(".nasa.gov"); } catch { return false; } };

/** Cited sources. NASA pages open in the system browser; other sources show their address. */
export function SourceList({ ids, sources, className }: { ids: string[]; sources: Source[]; className?: string }) {
  const found = [...new Set(ids)].map((id) => sources.find((source) => source.id === id)).filter((source): source is Source => Boolean(source));
  if (!found.length) return null;
  return (
    <ul className={cn("source-list", className)} aria-label="Sources">
      {found.map((source) => (
        <li key={source.id}>
          {isNasa(source.url)
            ? <button type="button" onClick={() => void api.openNasaSource(source.url).catch(() => undefined)} title={source.url}><ExternalLink className="size-3" aria-hidden="true" />{source.title}</button>
            : <span title={source.url}>{source.title} · {new URL(source.url).hostname}</span>}
        </li>
      ))}
    </ul>
  );
}

/**
 * NASA Human Research Program evidence reports for a health topic. Each entry
 * opens the report (PDF) on the Human Research Roadmap; the risk title links
 * to the Roadmap's page for that risk.
 */
export function EvidenceReports({ reports, className }: { reports: EvidenceReport[] | undefined; className?: string }) {
  if (!reports?.length) return null;
  const open = (url: string) => void api.openNasaSource(url).catch(() => undefined);
  return (
    <div className={cn("evidence-reports", className)}>
      <p className="evidence-reports-title">NASA Human Research Program evidence report{reports.length > 1 ? "s" : ""}</p>
      <ul>
        {reports.map((report) => (
          <li key={report.risk_id}>
            <button type="button" className="evidence-report" onClick={() => open(report.report_url)} title={report.report_url}>
              <ExternalLink className="size-3.5 shrink-0" aria-hidden="true" /><span>{report.report_title}: {report.risk_title}</span>
            </button>
            <button type="button" className="evidence-risk" onClick={() => open(report.risk_url)} title={report.risk_url}>Roadmap risk page</button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * The chain behind one finding, as built by the backend: mission, NASA hazard,
 * NASA risk, the astronaut's own observation, the rule-based prompt and the
 * follow-up it created. It shows how NASA knowledge and the astronaut's data
 * meet, and keeps the two visibly different.
 */
export function EvidenceTrace({ entry }: { entry: EvidenceTraceEntry }) {
  const hazard = entry.hazards[0];
  const open = (url: string) => void api.openNasaSource(url).catch(() => undefined);
  return (
    <ol className="evidence-trace" aria-label={`Why AstroLife shows this prompt for ${entry.condition_title}`}>
      <li><span className="trace-step">Mission</span><strong>{entry.mission_title}</strong></li>
      {hazard && <li><span className="trace-step">NASA hazard</span><strong>{hazard.title}</strong><small>presented {["first", "second", "third", "fourth", "fifth"][hazard.rank - 1] ?? "later"} for this mission{entry.hazards.length > 1 ? ` · also ${entry.hazards.slice(1).map((item) => item.title).join(", ")}` : ""}</small></li>}
      {entry.nasa_risks[0] && (
        <li className="is-evidence">
          <span className="trace-step">NASA health risk</span>
          <button type="button" onClick={() => open(entry.nasa_risks[0].risk_url)} title={entry.nasa_risks[0].risk_url}>{entry.nasa_risks[0].risk_title}</button>
          <small>Human Research Roadmap risk {entry.nasa_risks.map((risk) => risk.risk_id).join(", ")}</small>
        </li>
      )}
      <li className="is-own">
        <span className="trace-step">Your observation</span>
        {entry.observations.length ? entry.observations.map((item) => (
          item.kind === "answer"
            ? <strong key={item.question_id}>{item.question} <em>{item.answer}</em></strong>
            : <strong key={item.indicator_id}>{item.label}: <em>{item.value}{item.unit === "%" ? "%" : ` ${item.unit}`}</em> <small>{item.source === "sensor" ? "sensor" : item.source === "simulated" ? "simulated, not a measurement" : "manual entry"}</small></strong>
        )) : <strong>Reported in this check-in</strong>}
      </li>
      <li className="is-rule"><span className="trace-step">Rule-based prompt</span><strong>{LEVEL_LABELS[entry.level]}</strong></li>
      <li><span className="trace-step">Follow-up</span><strong>{entry.actions.length ? `${entry.actions.length} action${entry.actions.length > 1 ? "s" : ""} in your Action Center` : "No action created"}</strong></li>
    </ol>
  );
}

/** The identifiers behind a finding, for anyone who wants to audit it. Closed by default. */
export function TraceAudit({ entry }: { entry: EvidenceTraceEntry }) {
  const audit = entry.traceability;
  if (!audit) return null;
  const rows: [string, string][] = [
    ["Assessment rules", `${audit.rules_engine} · version ${audit.rules_version}`],
    ["Rule inputs", audit.rule_ids.join(", ") || "none"],
    ["Questions", audit.question_ids.join(", ") || "none"],
    ["Observations", audit.observation_ids.join(", ") || "none"],
    ["NASA risks (Human Research Roadmap)", audit.nasa_risk_ids.join(", ")],
    ["NASA sources", audit.nasa_source_ids.join(", ")],
    ["Follow-up actions", audit.action_ids.length ? audit.action_ids.map((id) => `#${id}`).join(", ") : "none"],
    ["Saved as", audit.history_entry_id != null ? `history entry #${audit.history_entry_id}` : "not saved"],
    ["Versions", `question registry ${audit.question_registry_version} · catalog reviewed ${audit.catalog_reviewed_on} · evidence reviewed ${audit.evidence_reviewed_on}`],
  ];
  return (
    <details className="trace-audit">
      <summary>Audit details</summary>
      <dl>{rows.map(([term, value]) => <div key={term}><dt>{term}</dt><dd>{value}</dd></div>)}</dl>
    </details>
  );
}

/** Common frame for one guided step: heading, content and Back / Continue controls. */
export function FlowPage({ title, lead, children, onBack, onNext, nextLabel = "Continue", nextDisabled, busy, aside, wide }: {
  title: ReactNode; lead?: ReactNode; children: ReactNode;
  onBack?: () => void; onNext?: () => void; nextLabel?: string; nextDisabled?: boolean; busy?: boolean;
  /** Extra controls shown next to Continue, for example "Save and exit". */
  aside?: ReactNode; wide?: boolean;
}) {
  return (
    <div className={cn("flow-page", wide && "is-wide")}>
      <header className="flow-heading">
        <h1>{title}</h1>
        {lead && <p className="flow-lead">{lead}</p>}
      </header>
      {children}
      {(onBack || onNext || aside) && (
        <div className="flow-controls">
          {onBack ? <Button variant="ghost" onClick={onBack}><ArrowLeft className="size-4" /> Back</Button> : <span />}
          <div className="flex items-center gap-2">
            {aside}
            {onNext && <Magnetic strength={0.14}><Button variant="primary" size="lg" onClick={onNext} disabled={nextDisabled || busy} aria-busy={busy || undefined}>{busy ? "Working…" : nextLabel} <ArrowRight className="size-4" /></Button></Magnetic>}
          </div>
        </div>
      )}
    </div>
  );
}
