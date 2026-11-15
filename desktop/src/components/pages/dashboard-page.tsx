import { Activity, AlertTriangle, ClipboardCheck, Compass, Database, ListTodo, Orbit, PlayCircle, Radiation, RotateCcw, Settings2 } from "lucide-react";
import type { ReactNode } from "react";
import { Magnetic, PointerGlow } from "@/components/effects/interactive";
import { UrgentPanel } from "@/components/flow/urgent-panel";
import { ActionItem } from "@/components/flow/actions-page";
import { LEVEL_LABELS, measurementKind, ProvenanceBadge } from "@/components/flow/common";
import { MissionViewport } from "@/components/hero/mission-viewport";
import { PpgChart } from "@/components/monitor/ppg-chart";
import type { SensorViewState } from "@/components/monitor/sensor-state";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { AppConfig } from "@/types/backend";
import type { AppState, FollowupAction, Knowledge } from "@/types/flow";

function Tile({ title, icon: Icon, children, className }: { title: string; icon: typeof Activity; children: ReactNode; className?: string }) {
  return (
    <div className={className}>
      {/* The tiles hold checkboxes and text being read, so they light up under the cursor but do not tilt. */}
      <PointerGlow className="glass-panel dashboard-tile rounded-2xl border">
        <h2 className="tile-title"><Icon className="size-4 text-space-cyan" aria-hidden="true" />{title}</h2>
        {children}
      </PointerGlow>
    </div>
  );
}

const when = (iso: string) => { const date = new Date(iso); return Number.isNaN(date.getTime()) ? iso : date.toLocaleString(); };
const isToday = (iso: string) => new Date(iso).toDateString() === new Date().toDateString();

/**
 * Mission dashboard: where the astronaut lands after onboarding and on every
 * later launch. Everything on it is a summary that links to the full page.
 */
export function DashboardPage({ state, knowledge, config, sensor, onStartCheckin, onResume, onChangeMission, onOpen, onViewResult, onToggleAction, onReportConcern }: {
  state: AppState; knowledge: Knowledge; config: AppConfig; sensor: SensorViewState;
  onStartCheckin: () => void; onResume: () => void; onChangeMission: () => void;
  onOpen: (page: "sensor" | "compass" | "nasa" | "history") => void;
  onViewResult: (step: "findings" | "actions") => void;
  onToggleAction: (action: FollowupAction) => void; onReportConcern: () => void;
}) {
  const profile = state.mission;
  const context = knowledge.mission_context;
  const mission = profile ? context.missions[profile.environment] : null;
  const latest = state.latest?.result ?? null;
  const checkin = latest?.checkin;
  const hasMeasurement = checkin != null && (checkin.heart_rate != null || checkin.spo2 != null);
  const kind = measurementKind(checkin?.input_source, hasMeasurement);
  const findings = latest?.assessment.findings.filter((finding) => finding.level !== "info") ?? [];
  const openActions = state.actions.filter((action) => action.status === "open");
  const doneToday = state.latest ? isToday(state.latest.updated_at) : false;
  const hazardTitles = mission ? mission.hazard_order.slice(0, 3).map((id) => knowledge.catalog.hazards.find((hazard) => hazard.id === id)?.title ?? id) : [];

  return (
    <div className="page-grid dashboard">
      <section className="dashboard-hero">
        <div className="dashboard-hero-copy">
          <h1>{mission?.title ?? "Mission"} health</h1>
          <p className="text-sm text-space-muted">{state.open ? "You have a check-in in progress." : doneToday ? "Today's check-in is complete. You can reassess at any time." : "No check-in recorded today."}</p>
          <div className="hero-actions">
            {state.open
              ? <Magnetic><Button variant="primary" size="lg" onClick={onResume}><RotateCcw className="size-4" /> Resume check-in</Button></Magnetic>
              : doneToday
                ? <><Magnetic><Button variant="primary" size="lg" onClick={() => onViewResult("findings")}><ClipboardCheck className="size-4" /> Review today's findings</Button></Magnetic><Button size="lg" onClick={onStartCheckin}><PlayCircle className="size-4" /> Check in again</Button></>
                : <Magnetic><Button variant="primary" size="lg" onClick={onStartCheckin}><PlayCircle className="size-4" /> Start today's check-in</Button></Magnetic>}
            <Button size="lg" variant="danger" onClick={onReportConcern}><AlertTriangle className="size-4" /> Report health concern</Button>
          </div>
        </div>
        {profile && (
          <div className="dashboard-hero-visual">
            <MissionViewport mission={profile.environment} telemetry={sensor} />
            {sensor.source === "simulated" && <p className="mt-2 text-center"><ProvenanceBadge kind="simulated" label="Live values shown are simulated · not a measurement" /></p>}
          </div>
        )}
      </section>

      {latest?.assessment.level === "urgent" && <UrgentPanel assessment={latest.assessment} conditionTitles={config.condition_titles} sources={knowledge.catalog.sources} />}

      <div className="dashboard-grid">
        <Tile title="Mission profile" icon={Orbit}>
          {profile && mission ? (
            <>
              <dl className="fact-grid">
                <div><dt>Mission</dt><dd>{mission.title}</dd></div>
                <div><dt>Phase</dt><dd>{context.phases.find((phase) => phase.id === profile.phase)?.title ?? profile.phase}</dd></div>
                <div><dt>Mission day</dt><dd>{profile.mission_day ?? "Not set"}</dd></div>
                <div><dt>Recent EVA</dt><dd>{profile.eva_recent ? "Yes" : "No"}</dd></div>
              </dl>
              <p className="tile-note">Hazards presented first: {hazardTitles.join(" · ")}</p>
              <Button size="sm" variant="ghost" onClick={onChangeMission}><Settings2 className="size-3.5" /> Change mission or context</Button>
            </>
          ) : <p className="empty-line">No mission saved.</p>}
        </Tile>

        <Tile title="Latest check-in" icon={ClipboardCheck}>
          {latest && state.latest ? (
            <>
              <div className="flex flex-wrap items-center gap-2"><span className={cn("priority-badge", `priority-${latest.assessment.level}`)}>{LEVEL_LABELS[latest.assessment.level]}</span><ProvenanceBadge kind="rule" /></div>
              <p className="tile-summary">{latest.assessment.summary}</p>
              <p className="tile-note">Recorded {when(state.latest.updated_at)}</p>
              <Button size="sm" onClick={() => onViewResult("findings")}>Open findings</Button>
            </>
          ) : <p className="empty-line">No completed check-in yet.</p>}
        </Tile>

        <Tile title="Latest measurement" icon={Activity}>
          {hasMeasurement && checkin ? (
            <>
              <div className="tile-vitals"><div><strong>{checkin.heart_rate ?? "—"}</strong><small>bpm</small></div><div><strong>{checkin.spo2 ?? "—"}</strong><small>% SpO₂</small></div></div>
              {kind && <ProvenanceBadge kind={kind} />}
              <p className="tile-note">{checkin.sensor_received_at ? `${checkin.input_source === "simulated" ? "Simulated" : "Measured"} ${when(checkin.sensor_received_at)}` : "From your latest check-in"} · {checkin.input_source === "simulated" ? "demo values, not a measurement" : "estimates, not validated"}</p>
            </>
          ) : <p className="empty-line">No measurement in your latest check-in. Pulse and oxygen are unassessed.</p>}
          {sensor.connected && <PpgChart compact height={96} />}
          <div className="tile-live">
            <span className={cn("live-pulse", sensor.connected && "is-live", sensor.connecting && "is-connecting")} />
            <span>{sensor.connected ? (sensor.usable ? `Live now: ${sensor.heartRate ?? "—"} bpm · ${sensor.spo2 ?? "—"}%${sensor.source === "simulated" ? " (simulated)" : ""}` : "Sensor connected · waiting for a usable reading") : "Sensor not connected"}</span>
            <Button size="sm" variant="ghost" onClick={() => onOpen("sensor")}>Open monitor</Button>
          </div>
        </Tile>

        <Tile title={`Active findings · ${findings.length}`} icon={ListTodo} className="dashboard-wide">
          {findings.length ? (
            <ul className="tile-findings">
              {findings.slice(0, 4).map((finding) => (
                <li key={finding.condition_id}><span className={cn("priority-badge", `priority-${finding.level}`)}>{LEVEL_LABELS[finding.level]}</span><span><strong>{config.condition_titles[finding.condition_id] ?? finding.condition_id}</strong><small>{finding.reason}</small></span></li>
              ))}
            </ul>
          ) : <p className="empty-line">{latest ? "No prompt from your latest check-in. This is not a health clearance." : "Findings appear here after a check-in."}</p>}
        </Tile>

        <Tile title={`Follow-up tasks · ${openActions.length} open`} icon={ListTodo} className="dashboard-wide">
          {openActions.length ? (
            <ul className="action-list">{openActions.slice(0, 3).map((action) => <ActionItem key={action.id} action={action} knowledge={knowledge} conditionTitles={config.condition_titles} onToggle={onToggleAction} />)}</ul>
          ) : <p className="empty-line">No open follow-up task.</p>}
          {state.actions.length > 0 && <Button size="sm" variant="ghost" onClick={() => onViewResult("actions")}>Open Action Center ({state.actions.length})</Button>}
        </Tile>

        <Tile title="Explore" icon={Compass}>
          <div className="tile-links">
            <button type="button" onClick={() => onOpen("compass")}><Compass className="size-4" /><span><strong>Health Compass</strong><small>Your observations and NASA research by body system</small></span></button>
            <button type="button" onClick={() => onOpen("nasa")}><Radiation className="size-4" /><span><strong>NASA data</strong><small>Radiation measurements and research evidence</small></span></button>
            <button type="button" onClick={() => onOpen("history")}><Database className="size-4" /><span><strong>Health history</strong><small>Saved check-ins on this computer</small></span></button>
          </div>
        </Tile>
      </div>
    </div>
  );
}
