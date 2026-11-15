import { BookOpen } from "lucide-react";
import { useState, type ReactNode } from "react";
import { EvidenceReports, ProvenanceBadge, SourceList } from "@/components/flow/common";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { HazardId, Knowledge, MissionProfile } from "@/types/flow";

/**
 * NASA data tab: historical radiation measurements (passed in as `radiation`)
 * and the curated research catalog, organized by NASA hazard in the order
 * used for the current mission.
 */
export function NasaPage({ knowledge, profile, radiation }: { knowledge: Knowledge; profile: MissionProfile | null; radiation?: ReactNode }) {
  const { catalog, mission_context: context } = knowledge;
  const order = profile ? context.missions[profile.environment].hazard_order : catalog.hazards.map((hazard) => hazard.id);
  const [hazardId, setHazardId] = useState<HazardId>(order[0]);
  const conditions = catalog.conditions.filter((condition) => condition.hazard_ids.includes(hazardId));
  return (
    <div className="page-grid">
      <div className="page-heading"><div><h1>The science behind your check-in</h1><p>Real NASA instrument data and Human Research Program evidence. None of it is a measurement of you.</p></div></div>
      {radiation}
      <Card className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="telemetry-label"><BookOpen className="mr-1.5 inline size-3.5 text-space-cyan" aria-hidden="true" />Research evidence by NASA hazard</h2>
          <ProvenanceBadge kind="evidence" />
        </div>
        <div className="choice-row mt-4" role="tablist" aria-label="NASA hazards">
          {order.map((id) => (
            <button key={id} type="button" role="tab" aria-selected={hazardId === id} className={cn("choice-chip", hazardId === id && "is-selected")} onClick={() => setHazardId(id)}>{catalog.hazards.find((hazard) => hazard.id === id)?.title ?? id}</button>
          ))}
        </div>
        <p className="mt-4 text-sm leading-6 text-space-silver">{context.hazards[hazardId].summary} {context.hazards[hazardId].why_it_matters}</p>
        <div className="finding-list mt-4">
          {conditions.map((condition) => (
            <article key={condition.id} className="finding-item is-evidence">
              <header><h3>{condition.title}</h3></header>
              <p>{condition.why_it_matters}</p>
              {condition.research.map((item) => <p key={item.text} className="research-line"><strong>Research:</strong> {item.text}</p>)}
              <p className="limit-line"><strong>Limit:</strong> {condition.limitations}</p>
              <SourceList ids={[...condition.source_ids, ...condition.research.flatMap((item) => item.source_ids)]} sources={catalog.sources} />
              <EvidenceReports reports={knowledge.hrr_evidence.conditions[condition.id]} />
            </article>
          ))}
        </div>
        <p className="flow-footnote">{catalog.scope} Reviewed {catalog.reviewed_on}.</p>
        <p className="flow-footnote">{knowledge.hrr_evidence.note} Reviewed {knowledge.hrr_evidence.reviewed_on}.</p>
      </Card>
    </div>
  );
}
