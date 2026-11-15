import { AlertOctagon } from "lucide-react";
import type { ReactNode } from "react";
import { ProvenanceBadge, SourceList } from "@/components/flow/common";
import type { Assessment } from "@/types/backend";
import type { Source } from "@/types/flow";

/** Shown whenever no rule output is available yet, so guidance is never blank. */
export const FALLBACK_URGENT_ACTION = "Follow the mission emergency procedure and contact the crew medical officer now.";

/**
 * Urgent guidance. Every sentence of guidance comes from the Python rules
 * (`assessment`); this component only lays it out and never adds advice.
 */
export function UrgentPanel({ assessment, conditionTitles, sources, children }: {
  assessment: Assessment | null; conditionTitles: Record<string, string>; sources: Source[]; children?: ReactNode;
}) {
  const urgent = assessment?.findings.filter((finding) => finding.level === "urgent") ?? [];
  const actions = [...new Set(urgent.flatMap((finding) => finding.actions))];
  return (
    <section className="urgent-panel" role="alert" aria-labelledby="urgent-title">
      <div className="flex items-start gap-3">
        <AlertOctagon className="mt-1 size-7 shrink-0 text-rose-300" aria-hidden="true" />
        <div className="min-w-0">
          <h2 id="urgent-title"><span className="urgent-eyebrow">Act now.</span> {actions[0] ?? FALLBACK_URGENT_ACTION}</h2>
          {actions.slice(1).map((action) => <p key={action} className="mt-2 font-medium">{action}</p>)}
        </div>
      </div>
      {urgent.length > 0 && (
        <ul className="urgent-findings">
          {urgent.map((finding) => (
            <li key={finding.condition_id}>
              <strong>{conditionTitles[finding.condition_id] ?? finding.condition_id}</strong>
              <span>{finding.reason}</span>
              <SourceList ids={finding.source_ids.slice(0, 2)} sources={sources} />
            </li>
          ))}
        </ul>
      )}
      <div className="mt-4 flex flex-wrap items-center gap-2"><ProvenanceBadge kind="rule" /><span className="text-xs text-rose-100/80">This prompt comes from what you reported. It is not a diagnosis. Do not wait for a sensor reading.</span></div>
      {children && <div className="mt-5 flex flex-wrap gap-2">{children}</div>}
    </section>
  );
}
