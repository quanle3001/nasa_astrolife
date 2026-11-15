import { motion } from "motion/react";
import { useCalmMotion } from "@/lib/motion-preference";
import { Activity, Cable, ChevronRight, CircleGauge, ClipboardCheck, FlaskConical, ListChecks, LoaderCircle, LockKeyhole, PlugZap, RefreshCw, ShieldAlert, Sparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { BorderBeam } from "@/components/effects/border-beam";
import { MissionViewport } from "@/components/hero/mission-viewport";
import { PpgChart } from "@/components/monitor/ppg-chart";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { AssessmentBundle, MeasurementSource, MissionId, SerialPort } from "@/types/backend";

export interface SensorViewState {
  connected: boolean;
  connecting: boolean;
  status: string;
  usable: boolean;
  heartRate: number | null;
  spo2: number | null;
  bundle: AssessmentBundle | null;
  /** Client time of the newest sensor message (usable or not). */
  lastUpdate: number | null;
  /** Client time of the newest usable reading. */
  lastUsableAt: number | null;
  /** Why the last connection attempt failed (backend message), kept until the next attempt. */
  fault: string | null;
  /** "sensor" for the ESP32, "simulated" for the labelled demo stream. */
  source: MeasurementSource | null;
  /** Firmware window status, e.g. ready / collecting / no_contact (null on older firmware). */
  signalStatus: string | null;
  sampleRateHz: number | null;
  firmware: string | null;
  /** Agreement of recent reports: waiting / collecting / steady / changing / settling. */
  readingState: string | null;
  /** Result of the raw optical window check; not a clinical quality score. */
  opticalState: string | null;
  /** Backend receive time (ISO 8601, UTC) of the newest complete report. */
  measuredAt: string | null;
}

/** Plain words for the engineering checks; none of these establish clinical accuracy. */
const READING_STATE_TEXT: Record<string, string> = {
  waiting: "Waiting for a usable report",
  collecting: "Collecting agreeing reports",
  settling: "Optical window still settling",
  changing: "Recent reports disagree · hold still",
  steady: "Recent reports agree",
};

/** Drop OS error codes such as "[Errno 2]" from what the crew reads; the full text stays in the tooltip. */
const plainError = (message: string) => message.replace(/\[Errno \d+\]\s*/g, "").replace(/\s{2,}/g, " ").trim();

export function SensorPage({ state, mission, onReview, onCheckin, onConnectStart }: {
  state: SensorViewState; mission: MissionId; onReview: (bundle: AssessmentBundle) => void; onCheckin: () => void;
  onConnectStart: (port: string) => void;
}) {
  const reduced = useCalmMotion();
  const portInput = useRef<HTMLInputElement>(null);
  const [ports, setPorts] = useState<SerialPort[]>([]);
  const [port, setPort] = useState("");
  const [error, setError] = useState("");

  const refresh = async () => {
    try {
      setError("");
      const found = await api.listPorts();
      setPorts(found);
      if (!port && found[0]) setPort(found[0].device);
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
  };
  useEffect(() => { void refresh(); }, []);

  const toggle = async () => {
    try {
      setError("");
      if (state.connected || state.connecting) await api.disconnectSensor();
      else if (port.trim()) { onConnectStart(port.trim()); await api.connectSensor(port.trim()); }
      else setError("Select or enter the ESP32 serial port first.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
  };
  const simulate = async () => {
    try { setError(""); onConnectStart("simulated stream"); await api.simulateSensor(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
  };
  const details = [
    ["Source", state.source === "simulated" ? "Simulated demo stream" : state.source === "sensor" ? "ESP32 + MAX30102" : "—"],
    ["Firmware", state.firmware || (state.connected ? "Older report-only firmware" : "—")],
    ["Sample rate", state.sampleRateHz != null ? `${state.sampleRateHz} samples/s` : "—"],
    ["Firmware window", state.signalStatus ?? "—"],
    ["Optical check", state.opticalState ?? "—"],
    ["Report consistency", state.readingState ? READING_STATE_TEXT[state.readingState] ?? state.readingState : "—"],
    ["Last complete report", state.measuredAt ? new Date(state.measuredAt).toLocaleTimeString() : "—"],
  ];

  return (
    <div className="page-grid sensor-experience">
      <section className="sensor-hero">
        <motion.div className="sensor-hero-copy" initial={reduced ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .4, ease: [0.22, 1, 0.36, 1] }}>
          <div className="welcome-pill"><Sparkles className="size-3.5" /> NASA-inspired crew health console</div>
          <h1><span className="nowrap">Mission health,</span><br /><span className="gradient-text">in orbit.</span></h1>
          <p>Connect local biomedical telemetry, record how the crew feels, and turn observations into clear next steps—without sending health data to the cloud.</p>
          <div className="hero-actions">
            <Button variant="primary" size="lg" onClick={onCheckin}><ClipboardCheck className="size-4" /> Start daily check-in</Button>
            <Button size="lg" onClick={() => { portInput.current?.scrollIntoView({ block: "center", behavior: reduced ? "auto" : "smooth" }); portInput.current?.focus({ preventScroll: true }); }}><PlugZap className="size-4" /> Connect sensor</Button>
          </div>
          <div className="hero-facts">
            <span><LockKeyhole className="size-3.5" aria-hidden="true" /> Private Python analysis</span>
            <span><Cable className="size-3.5" aria-hidden="true" /> Local sensor link</span>
            <span><ListChecks className="size-3.5" aria-hidden="true" /> Explainable priorities</span>
          </div>
        </motion.div>
        <motion.div className="sensor-hero-visual" initial={reduced ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .45, delay: .06, ease: [0.22, 1, 0.36, 1] }}>
          <MissionViewport mission={mission} telemetry={state} />
        </motion.div>
      </section>

      <Card className="sensor-command-dock">
        {state.usable && <BorderBeam duration={7} />}
        <div className="command-dock-title"><Cable className="size-4" /><span><h2>ESP32 UPLINK</h2><small>MAX30102 · 115200 BAUD</small></span></div>
        <div className="command-dock-control">
          <input ref={portInput} list="serial-ports" value={port} onChange={(event) => setPort(event.target.value)} disabled={state.connected || state.connecting} className="control" aria-label="ESP32 serial port" placeholder="Select or enter a serial port" />
          <datalist id="serial-ports">{ports.map((item) => <option key={item.device} value={item.device}>{item.description}</option>)}</datalist>
          <Button onClick={refresh} disabled={state.connected || state.connecting} size="icon" aria-label="Refresh serial ports"><RefreshCw className="size-4" /></Button>
          <Button variant="primary" onClick={toggle} className="min-w-28" aria-busy={state.connecting || undefined}>{state.connecting ? <><LoaderCircle className="size-4 animate-spin" /> Cancel</> : state.connected ? "Disconnect" : "Initiate link"}</Button>
        </div>
        {error || state.fault ? (
          <div className="command-dock-state is-fault" role="alert" title={error || state.fault || undefined}>
            <span className="live-pulse is-fault" />
            <span><b>{error ? "Can't start the link." : "Couldn't connect to the sensor."}</b> {plainError(error || state.fault || "")}</span>
          </div>
        ) : (
          <div className="command-dock-state" role="status"><span className={cn("live-pulse", state.connected && "is-live", state.connecting && "is-connecting")} />{state.status}</div>
        )}
      </Card>

      <Card className="p-5" data-testid="live-monitor">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2"><Activity className="size-4 text-space-cyan" /><h2 className="telemetry-label">Live optical pulse · PPG</h2></div>
          {!state.connected && !state.connecting && (
            <Button size="sm" variant="ghost" onClick={simulate} title="Runs a clearly labelled synthetic stream through the real parser. Not a measurement.">
              <FlaskConical className="size-3.5" /> Run simulated stream
            </Button>
          )}
        </div>
        <div className="monitor-layout mt-4">
          <PpgChart />
          <div className="monitor-vitals" aria-label="Latest sensor estimates">
            <div><span className="telemetry-label">Pulse</span><strong>{state.heartRate ?? "—"}</strong><small>beats / min · estimate</small></div>
            <div><span className="telemetry-label">Blood oxygen</span><strong>{state.spo2 ?? "—"}</strong><small>% SpO₂ · estimate</small></div>
          </div>
        </div>
        <dl className="monitor-details">
          {details.map(([term, value]) => <div key={term}><dt>{term}</dt><dd>{value}</dd></div>)}
        </dl>
        <p className="mt-3 text-xs leading-5 text-space-subtle">A dash means the sensor could not provide a usable estimate. It is not a normal result. These engineering checks do not prove accuracy.</p>
      </Card>

      <section className="interpretation-grid">
        <Card className="interpretation-card">
          <div className="flex items-center gap-2"><CircleGauge className="size-4 text-space-cyan" /><h2 className="telemetry-label">Live interpretation</h2></div>
          {state.bundle ? (
            <div className="mt-5 flex flex-col gap-5 md:flex-row md:items-end">
              <div className="min-w-0 flex-1"><div className={cn("priority-badge", `priority-${state.bundle.assessment.level}`)}>{state.bundle.assessment.level}</div><h2 className="mt-3 text-2xl font-semibold text-white">{state.bundle.assessment.summary}</h2><p className="mt-2 text-sm text-space-muted">Fresh device-valid estimate; clinical accuracy remains unknown.</p></div>
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
