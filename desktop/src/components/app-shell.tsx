import { motion } from "motion/react";
import { useCalmMotion, useMotionPreference } from "@/lib/motion-preference";
import { ClipboardCheck, Database, HeartPulse, Orbit, Pause, Play, Sparkles, UserRound } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";
import { StatusBadge } from "@/components/spaceui/status-badge";
import { MISSIONS } from "@/lib/missions";
import { cn } from "@/lib/utils";
import type { MissionId } from "@/types/backend";

export type PageId = "sensor" | "checkin" | "assessment" | "history";

const NAV = [
  { id: "sensor" as const, label: "Telemetry", icon: HeartPulse },
  { id: "checkin" as const, label: "Check-in", icon: UserRound },
  { id: "assessment" as const, label: "Assessment", icon: ClipboardCheck },
  { id: "history" as const, label: "History", icon: Database },
];

export function AppShell({ page, setPage, mission, connected, backendReady, disclaimer, children }: {
  page: PageId; setPage: (page: PageId) => void; mission: MissionId; connected: boolean; backendReady: boolean; disclaimer: string;
  children: ReactNode;
}) {
  const reduced = useCalmMotion();
  const { paused, setPaused } = useMotionPreference();
  const missionData = MISSIONS[mission];
  const scroller = useRef<HTMLElement>(null);
  // Each page starts at its top; the shared scroll container otherwise keeps the previous page's offset.
  useEffect(() => { scroller.current?.scrollTo({ top: 0 }); }, [page]);
  return (
    <div className="cosmic-app relative min-h-screen text-space-white" data-mission={mission}>
      <header className="space-navbar app-drag-region">
        <button type="button" className="app-no-drag brand-lockup" onClick={() => setPage("sensor")} aria-label="AstroTip telemetry home">
          <span className="brand-orbit"><span>A</span></span>
          <span className="brand-copy"><strong>ASTROTIP</strong><small>CREW HEALTH INTELLIGENCE</small></span>
        </button>

        <nav className="nav-capsule app-no-drag" aria-label="Primary navigation">
          {NAV.map(({ id, label, icon: Icon }) => (
            <button key={id} type="button" onClick={() => setPage(id)} aria-current={page === id ? "page" : undefined} className={cn("nav-capsule-item", page === id && "is-active")}>
              {page === id && <motion.span layoutId="nav-capsule-active" className="nav-capsule-active" transition={reduced ? { duration: 0 } : { type: "spring", stiffness: 360, damping: 32 }} />}
              <Icon className="relative z-10 size-3.5" />
              <span className="relative z-10 nav-label">{label}</span>
            </button>
          ))}
        </nav>

        <div className="app-no-drag nav-status">
          <StatusBadge status={backendReady ? "online" : "warning"} primaryText={backendReady ? "Backend" : "Backend offline"} aria-label={backendReady ? "Local Python backend ready" : "Local Python backend offline"} className="nav-badge" />
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
          <p className="space-footer-tagline"><Sparkles className="size-3" /> AstroTip educational prototype · Local-first crew wellness interface</p>
        </footer>
      </main>
    </div>
  );
}
