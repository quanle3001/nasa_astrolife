import { motion, useReducedMotion } from "motion/react";
import { Activity, Cable, ChevronRight, CircleGauge, HeartPulse, RefreshCw, Satellite, ShieldAlert, Sparkles, Waves } from "lucide-react";
import { useEffect, useState } from "react";
import { BorderBeam } from "@/components/effects/border-beam";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { AssessmentBundle, SerialPort } from "@/types/backend";

export interface SensorViewState {
  connected: boolean;
  connecting: boolean;
  status: string;
  usable: boolean;
  heartRate: number | null;
  spo2: number | null;
  bundle: AssessmentBundle | null;
}

function OrbitalTelemetry({ state }: { state: SensorViewState }) {
  const reduced = useReducedMotion();
  const float = (delay: number, amount = 9) => reduced ? undefined : {
    y: [0, -amount, 0], rotate: [0, 1.5, 0],
    transition: { duration: 4.8, delay, repeat: Infinity, ease: "easeInOut" as const },
  };
  return (
    <div className="orbital-telemetry" aria-label="Live orbital telemetry display">
      <div className="orbit-grid" />
      <div className="orbit-ring orbit-ring-one" />
      <div className="orbit-ring orbit-ring-two" />
      <div className="orbit-ring orbit-ring-three" />
      <motion.div className="metric-pod metric-pod-heart" animate={float(0)}>
        <span className="metric-pod-icon"><HeartPulse className="size-5" /></span>
        <span><small>HEART RATE</small><strong>{state.heartRate ?? "—"} <em>bpm</em></strong></span>
      </motion.div>
      <motion.div className="metric-pod metric-pod-oxygen" animate={float(.8, 7)}>
        <span className="metric-pod-icon"><Waves className="size-5" /></span>
        <span><small>ESTIMATED SpO₂</small><strong>{state.spo2 ?? "—"} <em>%</em></strong></span>
      </motion.div>
      <motion.div className="metric-pod metric-pod-link" animate={float(1.4, 6)}>
        <span className={cn("live-pulse", state.connected && "is-live")} />
        <span><small>SENSOR LINK</small><strong>{state.connected ? "ONLINE" : "STANDBY"}</strong></span>
      </motion.div>
      <div className="orbit-core">
        <div className="orbit-core-halo" />
        <Satellite className="size-8" />
        <small>ASTROTIP</small>
        <strong>BIOMED</strong>
      </div>
      <span className="orbit-satellite orbit-satellite-one"><Activity className="size-4" /></span>
      <span className="orbit-satellite orbit-satellite-two"><Sparkles className="size-3.5" /></span>
    </div>
  );
}

export function SensorPage({ state, onReview }: { state: SensorViewState; onReview: (bundle: AssessmentBundle) => void }) {
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
      else if (port.trim()) await api.connectSensor(port.trim());
      else setError("Select or enter the ESP32 serial port first.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
  };

  return (
    <div className="page-grid sensor-experience">
      <section className="sensor-hero">
        <motion.div className="sensor-hero-copy" initial={{ opacity: 0, x: -30 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: .7 }}>
          <div className="welcome-pill"><Sparkles className="size-3.5" /> NASA-inspired crew health console</div>
          <h1><span className="nowrap">Mission health,</span><br /><span className="gradient-text">in orbit.</span></h1>
          <p>Connect local biomedical telemetry, record how the crew feels, and turn observations into clear next steps—without sending health data to the cloud.</p>
          <div className="hero-facts">
            <span><b>01</b> Private Python analysis</span>
            <span><b>02</b> Local sensor link</span>
            <span><b>03</b> Explainable priorities</span>
          </div>
        </motion.div>
        <motion.div initial={{ opacity: 0, x: 35 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: .8, delay: .12 }}>
          <OrbitalTelemetry state={state} />
        </motion.div>
      </section>

      <Card className="sensor-command-dock">
        {state.usable && <BorderBeam duration={7} />}
        <div className="command-dock-title"><Cable className="size-4" /><span><b>ESP32 UPLINK</b><small>MAX30102 · 115200 BAUD</small></span></div>
        <div className="command-dock-control">
          <input list="serial-ports" value={port} onChange={(event) => setPort(event.target.value)} disabled={state.connected || state.connecting} className="control" aria-label="ESP32 serial port" placeholder="Select or enter a serial port" />
          <datalist id="serial-ports">{ports.map((item) => <option key={item.device} value={item.device}>{item.description}</option>)}</datalist>
          <Button onClick={refresh} disabled={state.connected || state.connecting} size="icon" aria-label="Refresh serial ports"><RefreshCw className="size-4" /></Button>
          <Button variant="primary" onClick={toggle} className="min-w-28">{state.connected || state.connecting ? "Disconnect" : "Initiate link"}</Button>
        </div>
        <div className="command-dock-state"><span className={cn("live-pulse", state.connected && "is-live", state.connecting && "is-connecting")} />{error || state.status}</div>
      </Card>

      <section className="interpretation-grid">
        <Card className="interpretation-card">
          <div className="flex items-center gap-2"><CircleGauge className="size-4 text-space-cyan" /><span className="telemetry-label">Live interpretation</span></div>
          {state.bundle ? (
            <div className="mt-5 flex flex-col gap-5 md:flex-row md:items-end">
              <div className="min-w-0 flex-1"><div className={cn("priority-badge", `priority-${state.bundle.assessment.level}`)}>{state.bundle.assessment.level}</div><h2 className="mt-3 text-2xl font-semibold text-white">{state.bundle.assessment.summary}</h2><p className="mt-2 text-sm text-slate-400">Fresh device-valid estimate; clinical accuracy remains unknown.</p></div>
              <Button variant="primary" onClick={() => onReview(state.bundle!)}>Open assessment <ChevronRight className="size-4" /></Button>
            </div>
          ) : (
            <div className="empty-interpretation"><ShieldAlert className="size-6" /><span><b>Awaiting a usable signal</b><small>Missing readings do not establish that you are healthy.</small></span></div>
          )}
        </Card>
        <Card className="privacy-card">
          <div className="telemetry-label">Local-first by design</div>
          <div className="privacy-orb"><span /></div>
          <p>Experimental estimates stay on this computer. Nothing here is a diagnosis or flight-certified medical device.</p>
        </Card>
      </section>
    </div>
  );
}
