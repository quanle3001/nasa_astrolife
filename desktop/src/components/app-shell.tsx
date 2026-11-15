import { motion, useReducedMotion } from "motion/react";
import { Activity, ClipboardCheck, Database, HeartPulse, Orbit, Radio, Sparkles, UserRound } from "lucide-react";
import type { ReactNode } from "react";
import { MISSIONS } from "@/lib/missions";
import { cn } from "@/lib/utils";
import type { MissionId } from "@/types/backend";

export type PageId = "sensor" | "checkin" | "assessment" | "history";

const NAV = [
  { id: "sensor" as const, label: "Telemetry", icon: HeartPulse },
  { id: "checkin" as const, label: "Check-in", icon: UserRound },
  { id: "assessment" as const, label: "Assessment", icon: ClipboardCheck },
  { id: "history" as const, label: "Archive", icon: Database },
];

export function AppShell({ page, setPage, mission, connected, backendReady, children }: {
  page: PageId; setPage: (page: PageId) => void; mission: MissionId; connected: boolean; backendReady: boolean;
  children: ReactNode;
}) {
  const reduced = useReducedMotion();
  const missionData = MISSIONS[mission];
  return (
    <div className="cosmic-app relative min-h-screen text-slate-100" data-mission={mission}>
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
          <span className={cn("signal-dot", backendReady && "is-online")} title={backendReady ? "Python backend ready" : "Backend offline"}><Radio className="size-3.5" /></span>
          <span className={cn("signal-dot", connected && "is-linked")} title={connected ? "Sensor connected" : "No sensor connected"}><Activity className="size-3.5" /></span>
          <span className="mission-chip"><Orbit className="size-3.5" style={{ color: missionData.color }} /><span>{mission.toUpperCase()}</span></span>
        </div>
      </header>

      <main className="cosmic-scroll">
        {children}
        <footer className="space-footer"><Sparkles className="size-3" /> AstroTip educational prototype · Local-first crew wellness interface</footer>
      </main>
    </div>
  );
}
