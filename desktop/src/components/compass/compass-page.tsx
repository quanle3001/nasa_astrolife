import { AnimatePresence, motion } from "motion/react";
import { ChevronDown, Info } from "lucide-react";
import { Component, lazy, Suspense, useMemo, useState, type ReactNode } from "react";
import { COMPASS_REGIONS, regionForCondition, type RegionSummary } from "@/components/compass/regions";
import { ActionItem } from "@/components/flow/actions-page";
import { CareSteps } from "@/components/flow/guidance";
import { OsdrStudyCard, studiesFor } from "@/components/nasa/osdr-study";
import { EvidenceReports, FlowPage, LEVEL_LABELS, measurementKind, ProvenanceBadge, SourceList } from "@/components/flow/common";
import { Card } from "@/components/ui/card";
import { useCalmMotion } from "@/lib/motion-preference";
import { cn } from "@/lib/utils";
import type { FollowupAction, Knowledge, SessionResult } from "@/types/flow";

const AnatomyViewer = lazy(() => import("@/components/compass/anatomy-viewer"));

/** True when this device can create a WebGL context for the 3D viewer. */
export function webglAvailable(): boolean {
  try {
    const canvas = document.createElement("canvas");
    return Boolean(canvas.getContext("webgl2") ?? canvas.getContext("webgl"));
  } catch { return false; }
}

/** If the 3D viewer fails to load or render, the region buttons below it still work. */
class ViewerBoundary extends Component<{ onError: () => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { this.props.onError(); }
  render() { return this.state.failed ? null : this.props.children; }
}

/**
 * Health Compass: select a body region to see, kept apart, (1) what was
 * recorded for it, (2) the app's rule-based prompts, (3) NASA research and the
 * related hazards, and (4) the follow-up actions.
 *
 * The body is shown as an interactive 3D anatomical model. Every region is also
 * a plain button below the model, so the page stays usable from the keyboard
 * and on a device that cannot draw 3D.
 */
export function CompassPage({ result, actions, knowledge, conditionTitles, onToggleAction, onBack, onNext, nextLabel, framed = true }: {
  result: SessionResult | null; actions: FollowupAction[]; knowledge: Knowledge; conditionTitles: Record<string, string>;
  onToggleAction: (action: FollowupAction) => void; onBack?: () => void; onNext?: () => void; nextLabel?: string;
  /** False on the dashboard tab, where the step heading and controls are not wanted. */
  framed?: boolean;
}) {
  const reduced = useCalmMotion();
  const { catalog } = knowledge;
  const findings = result?.assessment.findings ?? [];
  const highlighted = useMemo(() => new Set(findings.filter((finding) => finding.level !== "info").map((finding) => regionForCondition(finding.condition_id)?.id).filter((id): id is string => Boolean(id))), [findings]);
  const [selected, setSelected] = useState<string>(() => [...highlighted][0] ?? "heart");
  const [canRender3d] = useState(webglAvailable);
  const [viewerFailed, setViewerFailed] = useState(false);
  const region = COMPASS_REGIONS.find((item) => item.id === selected) ?? COMPASS_REGIONS[0];
  // NASA research is folded away until asked for, so the panel opens on the astronaut's own data.
  const [openResearch, setOpenResearch] = useState<Set<string>>(new Set());
  const toggleResearch = (id: string) => setOpenResearch((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const regionInfo = useMemo(() => Object.fromEntries(COMPASS_REGIONS.map((item): [string, RegionSummary] => {
    const value = item.measurement && result ? result.checkin[item.measurement] : null;
    const prompts = item.conditionIds.map((id) => findings.find((finding) => finding.condition_id === id && finding.level !== "info")).filter((finding) => finding !== undefined);
    return [item.id, {
      title: item.title, about: item.about,
      measurement: item.measurement ? (value != null ? `${value}${item.measurement === "heart_rate" ? " bpm" : "% SpO₂"} recorded` : "No measurement recorded") : null,
      simulated: value != null && result?.checkin.input_source === "simulated",
      prompt: prompts[0]?.reason ?? null, promptCount: prompts.length,
      risks: item.conditionIds.map((id) => catalog.conditions.find((condition) => condition.id === id)?.title ?? id),
    }];
  })), [findings, result, catalog]);
  const checkin = result?.checkin;
  const measured = region.measurement && checkin ? checkin[region.measurement] : null;
  const kind = measurementKind(checkin?.input_source, measured != null);

  const body = (
    <div className="compass-layout">
      <Card className="compass-map">
        {canRender3d && !viewerFailed ? (
          <ViewerBoundary onError={() => setViewerFailed(true)}>
            <Suspense fallback={<p className="compass-loading" aria-busy="true">Loading the 3D anatomical model…</p>}>
              <AnatomyViewer selected={selected} highlighted={highlighted} onSelect={setSelected} calm={Boolean(reduced)} regionInfo={regionInfo} />
            </Suspense>
          </ViewerBoundary>
        ) : <p className="flow-notice" role="status">The 3D body cannot be shown on this device. Choose a body region from the buttons below; everything else works the same.</p>}
        <p className="compass-legend"><Info className="size-3.5 shrink-0" aria-hidden="true" /> A region marked with a blue dot has a prompt to review. It does not mean something is wrong there, and a region without a mark is not confirmed healthy.</p>
        <nav className="compass-chips" aria-label="Body regions">
          {COMPASS_REGIONS.map((item) => (
            <button key={item.id} type="button" aria-pressed={selected === item.id} className={cn("choice-chip", selected === item.id && "is-selected", highlighted.has(item.id) && "has-prompt")} onClick={() => setSelected(item.id)}>{item.title}{highlighted.has(item.id) && <>{" "}<span className="sr-only">· has a prompt to review</span></>}</button>
          ))}
        </nav>
      </Card>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={region.id} className="compass-panel" initial={reduced ? false : { opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={reduced ? undefined : { opacity: 0, x: -16 }} transition={{ duration: 0.22 }}>
          <Card className="p-5" aria-live="polite">
            <h2 className="compass-title">{region.title}</h2>
            <p className="text-sm text-space-muted">{region.about}</p>

            <section className="compass-block">
              <h3>What was recorded</h3>
              {region.measurement && (
                measured != null
                  ? <p className="compass-measure"><strong>{measured}{region.measurement === "heart_rate" ? " bpm" : "%"}</strong> {region.measurement === "heart_rate" ? "heart-rate estimate" : "SpO₂ estimate"} {kind && <ProvenanceBadge kind={kind} />}</p>
                  : <p className="empty-line">No {region.measurement === "heart_rate" ? "heart-rate" : "SpO₂"} measurement is recorded. It is unassessed, not normal.</p>
              )}
              {region.conditionIds.map((id) => {
                const finding = findings.find((item) => item.condition_id === id);
                if (!finding || finding.level === "info") return null;
                return (
                  <div key={id} className="compass-finding">
                    <div className="flex flex-wrap items-center gap-2"><span className={cn("priority-badge", `priority-${finding.level}`)}>{LEVEL_LABELS[finding.level]}</span><ProvenanceBadge kind="rule" /></div>
                    <p>{finding.reason}</p>
                    <CareSteps finding={finding} compact />
                  </div>
                );
              })}
              {!result && <p className="empty-line">Complete a check-in to see your own observations here.</p>}
              {result && !region.conditionIds.some((id) => findings.some((item) => item.condition_id === id && item.level !== "info")) && <p className="empty-line">No prompt for this region from your latest check-in. This area was not examined and is not ruled out.</p>}
            </section>

            {region.conditionIds.map((id) => {
              const condition = catalog.conditions.find((item) => item.id === id);
              if (!condition) return null;
              const hazards = condition.hazard_ids.map((hazardId) => ({ id: hazardId, title: catalog.hazards.find((hazard) => hazard.id === hazardId)?.title ?? hazardId }));
              const related = actions.filter((action) => action.condition_id === id);
              return (
                <section key={id} className="compass-block">
                  <div className="flex flex-wrap items-center justify-between gap-2"><h3>{condition.title}</h3><ProvenanceBadge kind="evidence" /></div>
                  <p>{condition.why_it_matters}</p>
                  <ul className="risk-chips" aria-label="Related NASA hazards">{hazards.map((hazard) => <li key={hazard.id} data-hazard={hazard.id}>{hazard.title}</li>)}</ul>
                  <button type="button" className="research-toggle" aria-expanded={openResearch.has(id)} aria-controls={`research-${id}`} onClick={() => toggleResearch(id)}>
                    <ChevronDown className={cn("size-4 transition-transform", openResearch.has(id) && "rotate-180")} aria-hidden="true" /> {openResearch.has(id) ? "Hide" : "Show"} NASA research and sources
                  </button>
                  {openResearch.has(id) && (
                    <div id={`research-${id}`}>
                      <p className="research-line"><strong>What to watch:</strong> {condition.monitoring}</p>
                      {condition.research.map((item) => <p key={item.text} className="research-line"><strong>Research:</strong> {item.text}</p>)}
                      <p className="limit-line"><strong>Limit:</strong> {condition.limitations}</p>
                      <SourceList ids={[...condition.source_ids, ...condition.research.flatMap((item) => item.source_ids)]} sources={catalog.sources} />
                      <EvidenceReports reports={knowledge.hrr_evidence.conditions[id]} />
                      {studiesFor(knowledge.osdr_studies, [id]).map((study) => <OsdrStudyCard key={study.accession} study={study} limitations={knowledge.osdr_studies?.limitations ?? ""} />)}
                    </div>
                  )}
                  {related.length > 0 && <><h4>Your follow-up actions</h4><ul className="action-list">{related.map((action) => <ActionItem key={action.id} action={action} knowledge={knowledge} conditionTitles={conditionTitles} onToggle={onToggleAction} />)}</ul></>}
                </section>
              );
            })}
          </Card>
        </motion.div>
      </AnimatePresence>
    </div>
  );

  if (!framed) return <div className="page-grid"><div className="page-heading"><div><h1>Health Compass</h1><p>Select a region to see what you recorded, AstroLife's prompts, and the NASA research behind them.</p></div></div>{body}</div>;
  return (
    <FlowPage wide title="Explore your health by body system" lead="Select a region to see what you recorded, AstroLife's prompts, and the NASA research behind them." onBack={onBack} onNext={onNext} nextLabel={nextLabel ?? "See my next steps"}>
      {body}
    </FlowPage>
  );
}
