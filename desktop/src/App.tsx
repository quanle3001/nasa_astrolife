import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { useCalmMotion } from "@/lib/motion-preference";
import { motion } from "motion/react";
import { AlertTriangle, LoaderCircle, RotateCcw } from "lucide-react";
import { AppShell, type PageId } from "@/components/app-shell";
import { AssessmentPage } from "@/components/pages/assessment-page";
import { CheckinPage } from "@/components/pages/checkin-page";
import { HistoryPage } from "@/components/pages/history-page";
import { SensorPage, type SensorViewState } from "@/components/pages/sensor-page";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { useAmbientVideo } from "@/lib/media-playback";
import type { AppConfig, AssessmentBundle, BackendEvent, CheckIn, MissionId } from "@/types/backend";

const INITIAL_SENSOR: SensorViewState = {
  connected: false, connecting: false, status: "Disconnected", usable: false,
  heartRate: null, spo2: null, bundle: null, lastUpdate: null, lastUsableAt: null,
};
const StarBackground = lazy(() => import("@/components/effects/star-background").then((module) => ({ default: module.StarBackground })));
const requestedPage = new URLSearchParams(window.location.search).get("page") as PageId | null;
const initialPage: PageId = requestedPage && ["sensor", "checkin", "assessment", "history"].includes(requestedPage) ? requestedPage : "sensor";

function PageStage({ active, children }: { active: boolean; children: React.ReactNode }) {
  const reduced = useCalmMotion();
  return (
    <motion.section
      hidden={!active}
      initial={false}
      animate={active ? { opacity: 1, y: 0 } : { opacity: 0, y: 8 }}
      transition={reduced ? { duration: 0 } : { duration: 0.28, ease: "easeOut" }}
    >{children}</motion.section>
  );
}

export default function App() {
  const reducedMotion = Boolean(useCalmMotion());
  const [page, setPage] = useState<PageId>(initialPage);
  const [mission, setMission] = useState<MissionId>("leo");
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [backendReady, setBackendReady] = useState(false);
  const [startupError, setStartupError] = useState("");
  const [sensor, setSensor] = useState<SensorViewState>(INITIAL_SENSOR);
  const [latest, setLatest] = useState<AssessmentBundle | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [historyRefresh, setHistoryRefresh] = useState(0);
  const crownVideo = useRef<HTMLVideoElement>(null);
  useAmbientVideo(crownVideo, Boolean(config));

  const start = async () => {
    try {
      setStartupError("");
      await api.ping();
      const loaded = await api.getConfig();
      setConfig(loaded);
      setBackendReady(true);
    } catch (reason) {
      setStartupError(reason instanceof Error ? reason.message : String(reason));
      setBackendReady(false);
    }
  };

  useEffect(() => { void start(); }, []);
  useEffect(() => api.onBackendEvent((message: BackendEvent) => {
    if (message.event === "backend.stopped") {
      setBackendReady(false); setSensor((current) => ({ ...current, connected: false, connecting: false, status: "Local backend stopped" }));
    } else if (message.event === "sensor.connection") {
      const state = String(message.payload.state);
      setSensor((current) => ({ ...current, connected: state === "connected", connecting: state === "connecting", status: state === "connected" ? `Connected to ${message.payload.port ?? "sensor"} · receiving telemetry` : "Disconnected", ...(state === "disconnected" ? { usable: false, heartRate: null, spo2: null, bundle: null, lastUpdate: null, lastUsableAt: null } : {}) }));
    } else if (message.event === "sensor.status") {
      setSensor((current) => ({ ...current, status: String(message.payload.message ?? "Sensor status changed"), usable: false, heartRate: null, spo2: null, bundle: null }));
    } else if (message.event === "sensor.reading") {
      const usable = Boolean(message.payload.usable);
      const receivedAt = Date.now();
      setSensor((current) => ({
        ...current, usable, lastUpdate: receivedAt, lastUsableAt: usable ? receivedAt : current.lastUsableAt,
        heartRate: usable && typeof message.payload.heart_rate === "number" ? message.payload.heart_rate : null,
        spo2: usable && typeof message.payload.spo2 === "number" ? message.payload.spo2 : null,
        bundle: usable && message.payload.assessment_id ? message.payload as unknown as AssessmentBundle : null,
        status: usable ? "Receiving fresh device-valid estimates" : Boolean(message.payload.finger_detected) ? "Finger detected · hold still while estimates stabilize" : "Place your finger on the sensor and hold still",
      }));
    }
  }), []);

  const assess = async (checkin: CheckIn) => {
    setBusy(true);
    try {
      const bundle = await api.assess(checkin);
      setLatest(bundle); setSaved(false); setPage("assessment");
    } finally { setBusy(false); }
  };
  const reviewSensor = (bundle: AssessmentBundle) => { setLatest(bundle); setSaved(false); setPage("assessment"); };
  const save = async () => {
    if (!latest || saved) return;
    setSaving(true);
    try { await api.saveAssessment(latest.assessment_id); setSaved(true); setHistoryRefresh((value) => value + 1); }
    finally { setSaving(false); }
  };

  if (!config) {
    return (
      <div className="relative grid min-h-screen place-items-center overflow-hidden bg-space-black p-6 text-space-white">
        <Suspense fallback={null}><StarBackground reducedMotion={reducedMotion} /></Suspense><div className="mission-atmosphere" />
        {startupError ? <div className="glass-panel relative z-10 max-w-lg rounded-3xl border border-rose-400/25 p-8 text-center"><AlertTriangle className="mx-auto size-10 text-rose-300" /><h1 className="mt-4 text-2xl font-semibold">Local backend unavailable</h1><p className="mt-3 text-sm leading-6 text-space-muted">{startupError}</p><Button className="mt-5" onClick={() => void start()}><RotateCcw className="size-4" /> Retry</Button></div> : <div className="relative z-10 text-center"><div className="mx-auto grid size-16 place-items-center rounded-2xl bg-space-cyan text-2xl font-black text-space-black">A</div><LoaderCircle className="mx-auto mt-6 size-5 animate-spin text-cyan-300" /><p className="mt-3 telemetry-label">Initializing local crew console</p></div>}
      </div>
    );
  }

  return (
    <div className="relative isolate min-h-screen overflow-hidden bg-space-black">
      <div className="black-hole-crown" data-page={page} aria-hidden="true">
        <video ref={crownVideo} muted loop playsInline preload="auto">
          <source src="./videos/blackhole.webm" type="video/webm" />
        </video>
      </div>
      <Suspense fallback={null}><StarBackground reducedMotion={reducedMotion} /></Suspense>
      <div className="mission-atmosphere" data-mission={mission} aria-hidden="true" />
      <AppShell page={page} setPage={setPage} mission={mission} connected={sensor.connected} backendReady={backendReady} disclaimer={config.disclaimer}>
        <PageStage active={page === "sensor"}><SensorPage state={sensor} mission={mission} onReview={reviewSensor} onCheckin={() => setPage("checkin")} /></PageStage>
        <PageStage active={page === "checkin"}><CheckinPage config={config} mission={mission} setMission={setMission} onAssess={assess} busy={busy} /></PageStage>
        <PageStage active={page === "assessment"}><AssessmentPage config={config} bundle={latest} saved={saved} saving={saving} onSave={save} onEdit={() => setPage("checkin")} /></PageStage>
        <PageStage active={page === "history"}><HistoryPage config={config} active={page === "history"} refreshKey={historyRefresh} /></PageStage>
      </AppShell>
    </div>
  );
}
