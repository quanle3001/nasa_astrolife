import { ChevronRight, CircleGauge, ShieldAlert } from "lucide-react";
import { LiveMonitor } from "@/components/monitor/live-monitor";
import { SensorDock } from "@/components/monitor/sensor-dock";
import type { SensorViewState } from "@/components/monitor/sensor-state";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { AssessmentBundle } from "@/types/backend";

export type { SensorViewState } from "@/components/monitor/sensor-state";

/**
 * Monitor tab: the sensor link, the live optical pulse and the rule output for
 * the newest reading. Decoration is kept off this page so biomedical data
 * stays easy to read.
 */
export function SensorPage({ state, onReview, onConnectStart }: {
  state: SensorViewState; onReview: (bundle: AssessmentBundle) => void; onConnectStart: (port: string) => void;
}) {
  const simulate = () => { onConnectStart("simulated stream"); void api.simulateSensor().catch(() => undefined); };
  return (
    <div className="page-grid sensor-experience">
      <div className="page-heading"><div><h1>Live health monitor</h1><p>Connect the ESP32, rest a fingertip on the MAX30102 window and keep your hand still. Estimates are experimental.</p></div></div>
      <SensorDock state={state} onConnectStart={onConnectStart} />
      <LiveMonitor state={state} onSimulate={simulate} />
      <section className="interpretation-grid">
        <Card className="interpretation-card">
          <div className="flex items-center gap-2"><CircleGauge className="size-4 text-space-cyan" /><h2 className="telemetry-label">Live interpretation</h2></div>
          {state.bundle ? (
            <div className="mt-5 flex flex-col gap-5 md:flex-row md:items-end">
              <div className="min-w-0 flex-1"><div className={cn("priority-badge", `priority-${state.bundle.assessment.level}`)}>{state.bundle.assessment.level}</div><h2 className="mt-3 text-2xl font-semibold text-white">{state.bundle.assessment.summary}</h2><p className="mt-2 text-sm text-space-muted">{state.source === "simulated" ? "Simulated demo values; not a measurement." : "Fresh device-valid estimate; clinical accuracy remains unknown."}</p></div>
              <Button variant="primary" onClick={() => onReview(state.bundle!)}>Open assessment <ChevronRight className="size-4" /></Button>
            </div>
          ) : (
            <div className="empty-interpretation"><ShieldAlert className="size-6" /><span><b>Awaiting a usable signal</b><small>Missing readings do not establish that you are healthy.</small></span></div>
          )}
        </Card>
        <Card className="privacy-card">
          <h2 className="telemetry-label">Local-first by design</h2>
          <div className="privacy-orb"><span /></div>
          <p>Experimental estimates stay on this computer. Nothing here is a diagnosis or flight-certified medical device.</p>
        </Card>
      </section>
    </div>
  );
}
