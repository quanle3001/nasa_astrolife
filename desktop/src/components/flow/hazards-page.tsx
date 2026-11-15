import { AnimatePresence, motion } from "motion/react";
import { ChevronDown, Globe2, Orbit, Radiation, Ruler, Users } from "lucide-react";
import { useState } from "react";
import { EvidenceReports, FlowPage, ProvenanceBadge, SourceList } from "@/components/flow/common";
import { useCalmMotion } from "@/lib/motion-preference";
import { cn } from "@/lib/utils";
import type { AssessmentPlan, HazardId, Knowledge, MissionProfile } from "@/types/flow";

const ICONS: Record<HazardId, typeof Orbit> = { radiation: Radiation, isolation: Users, distance: Ruler, gravity: Orbit, environment: Globe2 };

/**
 * Step 4: all five NASA hazards, always. The mission only changes their order
 * and which ones carry a mission-specific NASA statement.
 */
export function HazardsPage({ profile, knowledge, plan, onBack, onNext, nextLabel, busy }: {
  profile: MissionProfile; knowledge: Knowledge;
  /** Check-in plan computed by the backend from the NASA catalog for this mission. */
  plan?: AssessmentPlan | null;
  onBack: () => void; onNext: () => void; nextLabel?: string; busy?: boolean;
}) {
  const questionText = new Map(knowledge.registry.questions.map((question) => [question.id, question.text]));
  const firstTopic = plan?.topics.find((topic) => topic.domain_id !== "safety");
  const reduced = useCalmMotion();
  const { catalog, mission_context: context } = knowledge;
  const mission = context.missions[profile.environment];
  const [open, setOpen] = useState<HazardId | null>(mission.hazard_order[0]);
  return (
    <FlowPage wide title={`NASA's five hazards on a ${mission.title} mission`}
      lead={context.note} onBack={onBack} onNext={onNext} busy={busy} nextLabel={nextLabel ?? "Start health check-in"}
    >
      {plan && (
        <section className="plan-summary" aria-label="Your check-in plan">
          <p><strong>Your check-in for this mission:</strong> {plan.safety_question_count} safety items, then {plan.question_count} questions in {plan.topics.length - 1} health topics, plus a pulse and oxygen reading from your sensor.</p>
          {firstTopic && <p>It starts with <strong>{firstTopic.title}</strong>. {firstTopic.reason}</p>}
          <ul className="risk-chips" aria-label="Indicators collected and the NASA risk they relate to">
            {plan.indicators.map((indicator) => <li key={indicator.id} title={indicator.why}>{indicator.label} · {indicator.condition_ids.map((id) => catalog.conditions.find((condition) => condition.id === id)?.title ?? id).join(", ")}</li>)}
          </ul>
        </section>
      )}
      <ol className="hazard-list">
        {mission.hazard_order.map((id) => {
          const hazard = catalog.hazards.find((item) => item.id === id);
          const detail = context.hazards[id];
          const emphasis = mission.emphasis[id];
          const related = catalog.conditions.filter((condition) => condition.hazard_ids.includes(id));
          const Icon = ICONS[id];
          const expanded = open === id;
          const planned = plan?.hazards.find((item) => item.id === id);
          return (
            <motion.li key={id} layout={!reduced} className={cn("hazard-card", emphasis && "is-emphasized", expanded && "is-open")} >
              <button type="button" className="hazard-head" aria-expanded={expanded} aria-controls={`hazard-${id}`} onClick={() => setOpen(expanded ? null : id)}>
                <span className="hazard-icon"><Icon className="size-5" aria-hidden="true" /></span>
                <span className="hazard-title">
                  <strong>{hazard?.title ?? id}</strong>
                  <small>{detail.summary}</small>
                </span>
                {emphasis && <span className="hazard-emphasis">Emphasized for {mission.title}</span>}
                <ChevronDown className={cn("size-4 shrink-0 transition-transform", expanded && "rotate-180")} aria-hidden="true" />
              </button>
              <AnimatePresence initial={false}>
                {expanded && (
                  <motion.div id={`hazard-${id}`} className="hazard-body" initial={reduced ? false : { height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={reduced ? undefined : { height: 0, opacity: 0 }} transition={{ duration: 0.28 }}>
                    <div className="hazard-grid">
                      <section>
                        <h3>Why it matters</h3>
                        <p>{detail.why_it_matters}</p>
                        {emphasis && <><h3>On this mission</h3><p>{emphasis.rationale}</p><SourceList ids={emphasis.source_ids} sources={catalog.sources} /></>}
                      </section>
                      <section>
                        <h3>What AstroLife will ask or record because of this hazard</h3>
                        {planned ? (
                          planned.question_ids.length + planned.indicator_ids.length > 0 ? (
                            <ul className="dot-list">
                              {planned.question_ids.slice(0, 6).map((questionId) => <li key={questionId}>{questionText.get(questionId) ?? questionId}</li>)}
                              {planned.question_ids.length > 6 && <li>and {planned.question_ids.length - 6} more questions</li>}
                              {planned.indicator_ids.map((indicatorId) => <li key={indicatorId}><strong>Measured or recorded:</strong> {plan?.indicators.find((indicator) => indicator.id === indicatorId)?.label ?? indicatorId}</li>)}
                            </ul>
                          ) : <p>AstroLife has no question or sensor for this hazard. It is explained here and asked about only through mission alerts.</p>
                        ) : <ul className="dot-list">{detail.observations.map((item) => <li key={item}>{item}</li>)}</ul>}
                        <h3>Limits</h3>
                        <p>{detail.limits}</p>
                      </section>
                      <section>
                        <h3>Related NASA health risks</h3>
                        <ul className="risk-chips">{related.map((condition) => <li key={condition.id} title={condition.why_it_matters}>{condition.title}</li>)}</ul>
                        <div className="mt-3 flex flex-wrap items-center gap-2"><ProvenanceBadge kind="evidence" /></div>
                        <SourceList ids={[...detail.source_ids, ...related.flatMap((condition) => condition.source_ids)].slice(0, 6)} sources={catalog.sources} />
                        <EvidenceReports reports={related.flatMap((condition) => knowledge.hrr_evidence.conditions[condition.id] ?? []).filter((report, index, all) => all.findIndex((item) => item.risk_id === report.risk_id) === index).slice(0, 3)} />
                      </section>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.li>
          );
        })}
      </ol>
      <p className="flow-footnote">Catalog reviewed against NASA Human Research Program pages on {catalog.reviewed_on}. A hazard listed lower still applies to your mission.</p>
    </FlowPage>
  );
}
