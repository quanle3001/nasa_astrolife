import { CircleCheck, CircleHelp, HandHeart, Stethoscope, TriangleAlert } from "lucide-react";
import { SourceList } from "@/components/flow/common";
import { cn } from "@/lib/utils";
import type { Finding, IndicatorStatus } from "@/types/backend";
import type { MeasurementGuide, Source } from "@/types/flow";

/**
 * Guidance attached to a prompt by the Python rules, in two visibly separate
 * parts: simple steps the astronaut can take themselves, and when to involve
 * the crew medical officer. Both lists come from the backend; nothing is
 * written here.
 */
export function CareSteps({ finding, compact }: { finding: Pick<Finding, "actions" | "self_care">; compact?: boolean }) {
  const own = [...new Set(finding.self_care ?? [])];
  const crew = [...new Set(finding.actions)];
  if (!own.length && !crew.length) return null;
  return (
    <div className={cn("care-steps", compact && "is-compact")}>
      {own.length > 0 && (
        <section aria-label="What you can do now">
          <h4><HandHeart className="size-3.5" aria-hidden="true" /> What you can do now</h4>
          <ul className="dot-list">{own.map((step) => <li key={step}>{step}</li>)}</ul>
        </section>
      )}
      {crew.length > 0 && (
        <section aria-label="When to involve the crew">
          <h4><Stethoscope className="size-3.5" aria-hidden="true" /> When to involve the crew</h4>
          <ul className="dot-list">{crew.map((step) => <li key={step}>{step}</li>)}</ul>
        </section>
      )}
    </div>
  );
}

const STATUS: Record<IndicatorStatus["status"], { label: string; icon: typeof CircleCheck }> = {
  in_reference: { label: "In the general reference", icon: CircleCheck },
  outside_reference: { label: "Outside the general reference · recheck", icon: CircleHelp },
  review: { label: "Contact a clinician", icon: TriangleAlert },
  urgent: { label: "Act now", icon: TriangleAlert },
};

/**
 * Each measured indicator with a colour and a plain label: teal inside the
 * cited general reference, amber outside it, red for an urgent value. The
 * label always carries the meaning, so colour is never the only signal.
 */
export function IndicatorStatusList({ indicators, sources, compact }: { indicators: IndicatorStatus[] | undefined; sources?: Source[]; compact?: boolean }) {
  if (!indicators?.length) return null;
  return (
    <ul className={cn("indicator-list", compact && "is-compact")} aria-label="Status of your measurements">
      {indicators.map((item) => {
        const { label, icon: Icon } = STATUS[item.status];
        return (
          <li key={item.id} className={`indicator-status is-${item.status}`}>
            <div className="indicator-value"><strong>{item.value}</strong><span>{item.unit}</span><em>{item.label}</em></div>
            <p className="indicator-badge"><Icon className="size-3.5" aria-hidden="true" /> {compact ? `${item.id === "spo2" ? "Blood oxygen" : "Heart rate"}: ${label.toLowerCase()}` : label}</p>
            {!compact && <p className="indicator-text">{item.text}</p>}
            {!compact && sources && <SourceList ids={item.source_ids} sources={sources} />}
          </li>
        );
      })}
    </ul>
  );
}

/** How to take the fingertip reading and what the two numbers mean, from the backend's sourced guidance. */
export function MeasureGuide({ guide, sources, open }: { guide: MeasurementGuide | undefined; sources: Source[]; open?: boolean }) {
  if (!guide) return null;
  return (
    <details className="measure-guide" open={open}>
      <summary>{guide.title} · what the numbers mean</summary>
      <ol className="measure-guide-steps">{guide.steps.map((step) => <li key={step.text}>{step.text}</li>)}</ol>
      <dl className="measure-guide-meaning">
        {guide.meaning.map((item) => <div key={item.indicator}><dt>{item.label}</dt><dd>{item.text}</dd></div>)}
      </dl>
      <SourceList ids={[...guide.steps, ...guide.meaning].flatMap((item) => item.source_ids)} sources={sources} />
      <p className="limit-line"><strong>Limit:</strong> General guidance, not a mission procedure. The sensor's estimates are not clinically validated.</p>
    </details>
  );
}
