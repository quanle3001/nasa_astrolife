import { motion } from "motion/react";
import { useCalmMotion, useMotionPreference } from "@/lib/motion-preference";
import { AlertTriangle, Compass, Database, HeartPulse, Keyboard, LayoutDashboard, Orbit, Pause, Play, Radiation, Sparkles } from "lucide-react";
import { ARIA_MOD, MOD } from "@/lib/shortcuts";
import { useEffect, useRef, type ReactNode } from "react";
import { StatusBadge } from "@/components/spaceui/status-badge";
import { MISSIONS } from "@/lib/missions";
import { cn } from "@/lib/utils";
import type { MissionId } from "@/types/backend";

/** Top-level tabs of the dashboard, plus two pages reached from inside it. */
export type PageId = "dashboard" | "sensor" | "compass" | "nasa" | "history" | "checkin" | "assessment";

export const NAV = [
  { id: "dashboard" as const, label: "Dashboard", icon: LayoutDashboard },
  { id: "sensor" as const, label: "Monitor", icon: HeartPulse },
  { id: "compass" as const, label: "Compass", icon: Compass },
  { id: "nasa" as const, label: "NASA data", icon: Radiation },
  { id: "history" as const, label: "History", icon: Database },
];

/** Position in the guided flow, shown instead of the tabs while a flow step is open. */
export interface FlowProgress { index: number; total: number; label: string }

export function AppShell({ page, setPage, mission, connected, backendReady, disclaimer, onShowShortcuts, onReportConcern, flow, onHome, scrollKey, children }: {
  page: PageId; setPage: (page: PageId) => void; mission: MissionId; connected: boolean; backendReady: boolean; disclaimer: string;
  onShowShortcuts?: () => void;
  /** Always available: opens the health-concern report from any screen. */
  onReportConcern?: () => void;
  flow?: FlowProgress | null;
  onHome?: () => void;
  /** Changes whenever the visible screen changes, so each screen starts at its top. */
  scrollKey?: string;
  children: ReactNode;
}) {
  const reduced = useCalmMotion();
  const { paused, setPaused } = useMotionPreference();
  const missionData = MISSIONS[mission];
  const scroller = useRef<HTMLElement>(null);
  useEffect(() => { scroller.current?.scrollTo({ top: 0 }); }, [page, scrollKey]);
  return (
    <div className="cosmic-app relative min-h-screen text-space-white" data-mission={mission}>
      <header className="space-navbar app-drag-region">
        <button type="button" className="app-no-drag brand-lockup" onClick={() => (onHome ? onHome() : setPage("dashboard"))} aria-label="AstroLife home">
          <img className="brand-mark" src="./logo.svg" alt="" width={38} height={38} draggable={false} />
          <span className="brand-copy"><strong>ASTROLIFE</strong><small>CREW HEALTH INTELLIGENCE</small></span>
        </button>

        {flow ? (
          <div className="flow-stepper app-no-drag" role="group" aria-label={flow.index >= 0 ? `Guided check-in, step ${flow.index + 1} of ${flow.total}: ${flow.label}` : flow.label}>
            <span className="flow-stepper-label">{flow.label}</span>
            <span className="flow-stepper-dots" aria-hidden="true">
              {Array.from({ length: flow.total }, (_value, index) => <i key={index} className={cn(index < flow.index && "is-done", index === flow.index && "is-current")} />)}
            </span>
            {flow.index >= 0 && <span className="flow-stepper-count">{flow.index + 1} / {flow.total}</span>}
          </div>
        ) : (
          <nav className="nav-capsule app-no-drag" aria-label="Primary navigation">
            {NAV.map(({ id, label, icon: Icon }, index) => (
              <button key={id} type="button" onClick={() => setPage(id)} aria-current={page === id ? "page" : undefined} title={`${label} (${MOD}${index + 1})`} aria-keyshortcuts={`${ARIA_MOD}+${index + 1}`} className={cn("nav-capsule-item", page === id && "is-active")}>
                {page === id && <motion.span layoutId="nav-capsule-active" className="nav-capsule-active" transition={reduced ? { duration: 0 } : { type: "spring", stiffness: 360, damping: 32 }} />}
                <Icon className="relative z-10 size-3.5" />
                <span className="relative z-10 nav-label">{label}</span>
              </button>
            ))}
          </nav>
        )}

        <div className="app-no-drag nav-status">
          {onReportConcern && <button type="button" className="concern-button" onClick={onReportConcern}><AlertTriangle className="size-3.5" aria-hidden="true" /><span>Report concern</span></button>}
          {!backendReady && <StatusBadge status="warning" primaryText="Backend offline" aria-label="Local Python backend offline" className="nav-badge" />}
          <StatusBadge status={connected ? "online" : "offline"} primaryText={connected ? "Sensor live" : "No sensor"} animated={connected} aria-label={connected ? "Sensor connected" : "No sensor connected"} className="nav-badge" />
          <button
            type="button"
            className="motion-toggle"
            aria-pressed={paused}
            aria-label={paused ? "Resume background motion" : "Pause background motion"}
            title={paused ? "Resume background motion" : "Pause background motion"}
            onClick={() => setPaused(!paused)}
          >{paused ? <Play className="size-3.5" /> : <Pause className="size-3.5" />}</button>
          <span className="mission-chip"><Orbit className="size-3.5" style={{ color: missionData.color }} /><span>{mission.toUpperCase()}</span></span>
        </div>
      </header>

      <main ref={scroller} className="cosmic-scroll">
        {children}
        <footer className="space-footer">
          <p className="space-footer-disclaimer">{disclaimer}</p>
          <p className="space-footer-tagline"><Sparkles className="size-3" /> AstroLife educational prototype · Local-first crew wellness interface</p>
          {onShowShortcuts && <button type="button" className="footer-shortcuts" onClick={onShowShortcuts} aria-keyshortcuts="Shift+?"><Keyboard className="size-3.5" /> Keyboard shortcuts <kbd className="kbd">?</kbd></button>}
        </footer>
      </main>
    </div>
  );
}
