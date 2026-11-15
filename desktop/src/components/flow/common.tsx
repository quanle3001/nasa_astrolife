import { ArrowLeft, ArrowRight, BookOpen, ExternalLink, FlaskConical, HeartPulse, History, ListChecks, PenLine } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { MeasurementSource, PriorityLevel } from "@/types/backend";
import type { Source } from "@/types/flow";

export const LEVEL_LABELS: Record<PriorityLevel, string> = {
  urgent: "Act now", review: "Medical review", watch: "Follow up", info: "No prompt",
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

/** Common frame for one guided step: heading, content and Back / Continue controls. */
export function FlowPage({ eyebrow, title, lead, children, onBack, onNext, nextLabel = "Continue", nextDisabled, busy, aside, wide }: {
  eyebrow: string; title: ReactNode; lead?: ReactNode; children: ReactNode;
  onBack?: () => void; onNext?: () => void; nextLabel?: string; nextDisabled?: boolean; busy?: boolean;
  /** Extra controls shown next to Continue, for example "Save and exit". */
  aside?: ReactNode; wide?: boolean;
}) {
  return (
    <div className={cn("flow-page", wide && "is-wide")}>
      <header className="flow-heading">
        <p className="telemetry-label">{eyebrow}</p>
        <h1>{title}</h1>
        {lead && <p className="flow-lead">{lead}</p>}
      </header>
      {children}
      {(onBack || onNext || aside) && (
        <div className="flow-controls">
          {onBack ? <Button variant="ghost" onClick={onBack}><ArrowLeft className="size-4" /> Back</Button> : <span />}
          <div className="flex items-center gap-2">
            {aside}
            {onNext && <Button variant="primary" size="lg" onClick={onNext} disabled={nextDisabled || busy} aria-busy={busy || undefined}>{busy ? "Working…" : nextLabel} <ArrowRight className="size-4" /></Button>}
          </div>
        </div>
      )}
    </div>
  );
}
