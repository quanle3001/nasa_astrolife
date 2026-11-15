import { useMachine } from "@xstate/react";
import { AlertTriangle, LoaderCircle, RotateCcw } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AppShell, NAV, type FlowProgress, type PageId } from "@/components/app-shell";
import { CompassPage } from "@/components/compass/compass-page";
import { ParticleField } from "@/components/effects/interactive";
import { ActionsPage } from "@/components/flow/actions-page";
import { ContextPage } from "@/components/flow/context-page";
import { FindingsPage } from "@/components/flow/findings-page";
import { HazardsPage } from "@/components/flow/hazards-page";
import { MeasurePage } from "@/components/flow/measure-page";
import { MissionPage } from "@/components/flow/mission-page";
import { QuestionsPage } from "@/components/flow/questions-page";
import { SafetyPage } from "@/components/flow/safety-page";
import { UrgentPanel } from "@/components/flow/urgent-panel";
import { WelcomePage } from "@/components/flow/welcome-page";
import { INITIAL_SENSOR, type SensorViewState } from "@/components/monitor/sensor-state";
import { AssessmentPage } from "@/components/pages/assessment-page";
import { CheckinPage } from "@/components/pages/checkin-page";
import { DashboardPage } from "@/components/pages/dashboard-page";
import { HistoryPage } from "@/components/pages/history-page";
import { NasaPage } from "@/components/pages/nasa-page";
import { SensorPage } from "@/components/pages/sensor-page";
import { ShortcutsDialog } from "@/components/shortcuts-dialog";
import { Button } from "@/components/ui/button";
import { FLOW_STEPS, flowMachine, flowView, type FlowStep, type ResumableStep } from "@/flow/flow-machine";
import { api } from "@/lib/api";
import { useAmbientVideo } from "@/lib/media-playback";
import { useCalmMotion } from "@/lib/motion-preference";
import { ppgBuffer, startPpgStream } from "@/lib/ppg-store";
import { isTypingTarget, matchShortcut } from "@/lib/shortcuts";
import { questionnaireView } from "@/questions/engine";
import type { AppConfig, Assessment, AssessmentBundle, BackendEvent, CheckIn } from "@/types/backend";
import type { Answers, AnswerValue, AppState, FollowupAction, Knowledge, MeasurementChoice, MissionProfile, Question, Session, SessionResult } from "@/types/flow";

/** Cleared whenever the link drops so no stale estimate or diagnostic stays on screen. */
const NO_READING = {
  usable: false, heartRate: null, spo2: null, bundle: null, lastUpdate: null, lastUsableAt: null,
  signalStatus: null, sampleRateHz: null, firmware: null, readingState: null, opticalState: null, measuredAt: null,
} as const;
const DEFAULT_PROFILE: MissionProfile = { environment: "leo", phase: "orbit", mission_day: null, eva_recent: false, gravity_transition_recent: false };
const STEP_LABELS: Record<FlowStep, string> = {
  welcome: "Welcome", mission: "Choose mission", context: "Mission context", hazards: "Mission hazards", safety: "Safety screen",
  questions: "Health questions", measure: "Measurement", findings: "Findings", compass: "Health Compass", actions: "Next steps",
};
const TAB_IDS = NAV.map((item) => item.id) as PageId[];
const text = (value: unknown) => (typeof value === "string" && value ? value : null);
/** Readable error text: Electron prefixes backend errors with the IPC channel name. */
const message = (reason: unknown) => (reason instanceof Error ? reason.message : String(reason)).replace(/^Error invoking remote method '[^']+': (Error: )?/, "");

const StarBackground = lazy(() => import("@/components/effects/star-background").then((module) => ({ default: module.StarBackground })));
const requestedPage = new URLSearchParams(window.location.search).get("page") as PageId | null;

/** One screen of the app; cross-fades and slides when the screen changes. */
function Screen({ children }: { children: ReactNode }) {
  const reduced = useCalmMotion();
  return (
    <motion.section initial={reduced ? false : { opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} exit={reduced ? undefined : { opacity: 0, y: -12 }} transition={{ duration: reduced ? 0 : 0.3, ease: [0.22, 1, 0.36, 1] }}>
      {children}
    </motion.section>
  );
}

/** What the concern screen is showing: the report form, or a result. */
type Concern =
  | { stage: "form" }
  | { stage: "result"; bundle: AssessmentBundle }
  /** Urgent answer on the safety screen: guidance from a preview, nothing to save separately. */
  | { stage: "safety"; assessment: Assessment };

export default function App() {
  const reducedMotion = Boolean(useCalmMotion());
  const [snapshot, send] = useMachine(flowMachine);
  const view = flowView(snapshot.value);
  const inFlow = (FLOW_STEPS as readonly string[]).includes(view);

  const [config, setConfig] = useState<AppConfig | null>(null);
  const [knowledge, setKnowledge] = useState<Knowledge | null>(null);
  const [appState, setAppState] = useState<AppState>({ mission: null, open: null, latest: null, actions: [] });
  const [backendReady, setBackendReady] = useState(false);
  const [startupError, setStartupError] = useState("");
  const [page, setPage] = useState<PageId>(requestedPage && TAB_IDS.includes(requestedPage) ? requestedPage : "dashboard");

  // Guided check-in state. The backend holds the durable copy of all of it.
  const [profile, setProfile] = useState<MissionProfile>(DEFAULT_PROFILE);
  const [session, setSession] = useState<Session | null>(null);
  const [answers, setAnswers] = useState<Answers>({});
  const [questionIndex, setQuestionIndex] = useState(0);
  const [notice, setNotice] = useState("");
  const [result, setResult] = useState<{ result: SessionResult; entryId: number | null; sessionId: string } | null>(null);
  const [flowBusy, setFlowBusy] = useState(false);
  const [flowError, setFlowError] = useState("");
  const [actionBusy, setActionBusy] = useState<number | null>(null);

  // Sensor and the free-form concern report.
  const [sensor, setSensor] = useState<SensorViewState>(INITIAL_SENSOR);
  const [concern, setConcern] = useState<Concern>({ stage: "form" });
  const [quick, setQuick] = useState<AssessmentBundle | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [historyRefresh, setHistoryRefresh] = useState(0);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const crownVideo = useRef<HTMLVideoElement>(null);
  useAmbientVideo(crownVideo, Boolean(config));

  const applyState = useCallback((state: AppState) => {
    setAppState(state);
    if (state.mission) setProfile(state.mission);
    setSession(state.open);
    setAnswers(state.open?.answers ?? {});
    if (state.latest?.result) setResult({ result: state.latest.result, entryId: state.latest.entry_id, sessionId: state.latest.session_id });
  }, []);

  const start = async () => {
    try {
      setStartupError("");
      await api.ping();
      const [loadedConfig, loadedKnowledge, state] = await Promise.all([api.getConfig(), api.getKnowledge(), api.currentSession()]);
      setKnowledge(loadedKnowledge);
      applyState(state);
      setConfig(loadedConfig);
      setBackendReady(true);
      // Onboarding is complete once a mission is saved and one check-in was submitted.
      send({ type: "LOADED", onboarded: Boolean(state.mission && state.latest) });
    } catch (reason) {
      setStartupError(message(reason));
      setBackendReady(false);
    }
  };
  useEffect(() => { void start(); }, []);
  // Raw optical samples bypass React state; see lib/ppg-store.ts.
  useEffect(() => startPpgStream(), []);

  useEffect(() => api.onBackendEvent((event: BackendEvent) => {
    if (event.event === "backend.stopped") {
      setBackendReady(false); setSensor((current) => ({ ...current, connected: false, connecting: false, status: "Local backend stopped" }));
    } else if (event.event === "sensor.connection") {
      const state = String(event.payload.state);
      const simulated = event.payload.source === "simulated";
      if (state === "disconnected") ppgBuffer.reset();
      // A failure reported before disconnect stays visible (fault) instead of being replaced by "Disconnected".
      setSensor((current) => ({
        ...current, connected: state === "connected", connecting: state === "connecting", fault: state === "disconnected" ? current.fault : null,
        status: state === "connected" ? (simulated ? "Simulated stream running · not a measurement" : `Connected to ${event.payload.port ?? "sensor"} · receiving telemetry`) : "Disconnected",
        ...(state === "connected" ? { source: simulated ? "simulated" as const : "sensor" as const } : {}),
        ...(state === "disconnected" ? { ...NO_READING, source: null } : {}),
      }));
    } else if (event.event === "sensor.status") {
      const status = String(event.payload.message ?? "Sensor status changed");
      // Before a link is established, a status message can only be the reason it failed.
      setSensor((current) => ({ ...current, status, fault: current.connected ? null : status, usable: false, heartRate: null, spo2: null, bundle: null }));
    } else if (event.event === "sensor.reading") {
      const usable = Boolean(event.payload.usable);
      const receivedAt = Date.now();
      setSensor((current) => ({
        ...current, usable, lastUpdate: receivedAt, lastUsableAt: usable ? receivedAt : current.lastUsableAt,
        heartRate: usable && typeof event.payload.heart_rate === "number" ? event.payload.heart_rate : null,
        spo2: usable && typeof event.payload.spo2 === "number" ? event.payload.spo2 : null,
        bundle: usable && event.payload.assessment_id ? event.payload as unknown as AssessmentBundle : null,
        signalStatus: text(event.payload.signal_status) ?? current.signalStatus,
        sampleRateHz: typeof event.payload.sample_rate_hz === "number" ? event.payload.sample_rate_hz : current.sampleRateHz,
        firmware: text(event.payload.firmware_version) ?? current.firmware,
        readingState: text(event.payload.reading_state) ?? (usable ? current.readingState : "waiting"),
        opticalState: text(event.payload.optical_state) ?? current.opticalState,
        measuredAt: text(event.payload.received_at) ?? current.measuredAt,
        status: usable ? (event.payload.source === "simulated" ? "Simulated stream · demo values, not a measurement" : "Receiving fresh device-valid estimates") : event.payload.finger_detected ? "Finger detected · hold still while estimates stabilize" : "Place your finger on the sensor and hold still",
      }));
    }
  }), []);

  const activeMission = session?.mission ?? profile;
  const hazardOrder = useMemo(() => (knowledge ? knowledge.mission_context.missions[activeMission.environment].hazard_order : []), [knowledge, activeMission.environment]);
  const questionView = useMemo(
    () => (knowledge ? questionnaireView(knowledge.registry, activeMission, answers, hazardOrder) : null),
    [knowledge, activeMission, answers, hazardOrder],
  );

  /** Run a backend step of the flow with a shared busy flag and visible errors. */
  const guarded = async (work: () => Promise<void>) => {
    setFlowBusy(true); setFlowError("");
    try { await work(); } catch (reason) { setFlowError(message(reason)); } finally { setFlowBusy(false); }
  };
  const refreshState = async () => applyState(await api.currentSession());

  const saveContext = () => guarded(async () => {
    const { profile: stored } = await api.saveMission(profile);
    setProfile(stored);
    setAppState((current) => ({ ...current, mission: stored }));
    // A check-in started under the old context no longer matches; it is closed when a new one starts.
    if (session && JSON.stringify(session.mission) !== JSON.stringify(stored)) { setSession(null); setAnswers({}); }
    send({ type: "NEXT" });
  });

  /** Make sure an open backend session exists for the current mission. */
  const ensureSession = async (): Promise<Session> => {
    if (session && session.status === "in_progress") return session;
    const started = await api.startSession();
    setSession(started); setAnswers({}); setQuestionIndex(0); setNotice("");
    setAppState((current) => ({ ...current, open: started }));
    return started;
  };
  const beginCheckin = (event: "NEXT" | "START_CHECKIN") => guarded(async () => { await ensureSession(); send({ type: event }); });

  const resume = () => {
    if (!knowledge || !appState.open) return;
    const open = appState.open;
    const resumed = questionnaireView(knowledge.registry, open.mission, open.answers, knowledge.mission_context.missions[open.mission.environment].hazard_order);
    const step: ResumableStep = !resumed.safetyComplete ? "safety" : resumed.next ? "questions" : "measure";
    setSession(open); setAnswers(open.answers);
    setQuestionIndex(resumed.next ? resumed.questions.indexOf(resumed.next) : resumed.questions.length);
    send({ type: "RESUME", step });
  };

  const submitSafety = () => guarded(async () => {
    const current = await ensureSession();
    const preview = await api.previewSession(current.session_id, answers, "safety");
    if (preview.urgent) { setConcern({ stage: "safety", assessment: preview.assessment }); send({ type: "REPORT_URGENT" }); return; }
    if (questionView) setQuestionIndex(questionView.next ? questionView.questions.indexOf(questionView.next) : 0);
    send({ type: "NEXT" });
  });

  const answerQuestion = useCallback((question: Question, value: AnswerValue) => {
    if (!knowledge || !session) return;
    const next = questionnaireView(knowledge.registry, session.mission, { ...answers, [question.id]: value }, hazardOrder);
    setAnswers(next.answers);
    setNotice(next.dropped.length ? `${next.dropped.length} follow-up answer${next.dropped.length > 1 ? "s" : ""} no longer applied and ${next.dropped.length > 1 ? "were" : "was"} removed.` : "");
    const position = next.questions.findIndex((item) => item.id === question.id);
    setQuestionIndex(position + 1);
    setFlowError("");
    api.saveSession(session.session_id, next.answers, next.questions[position + 1]?.id ?? "review").catch((reason) => setFlowError(`Your answer is shown here but could not be saved: ${message(reason)}`));
  }, [knowledge, session, answers, hazardOrder]);

  const submitCheckin = (measurement: MeasurementChoice) => guarded(async () => {
    if (!session) throw new Error("This check-in is no longer open. Start a new one from the dashboard.");
    const submitted = await api.submitSession(session.session_id, answers, measurement);
    setResult({ result: { checkin: submitted.checkin, assessment: submitted.assessment, session_notes: submitted.session_notes }, entryId: submitted.entry_id, sessionId: submitted.session_id });
    setHistoryRefresh((value) => value + 1);
    await refreshState();
    send({ type: "NEXT" });
  });

  const toggleAction = async (action: FollowupAction) => {
    setActionBusy(action.id);
    try {
      const { action: updated } = await api.updateAction(action.id, action.status === "done" ? "open" : "done");
      setAppState((current) => ({ ...current, actions: current.actions.map((item) => (item.id === updated.id ? updated : item)) }));
      setFlowError("");
    } catch (reason) { setFlowError(message(reason)); } finally { setActionBusy(null); }
  };

  // --- Health concern report: available from every screen ------------------
  const reportConcern = () => { setConcern({ stage: "form" }); setSaved(false); send({ type: "REPORT_URGENT" }); };
  const assessConcern = async (checkin: CheckIn) => {
    setBusy(true);
    try { const bundle = await api.assess(checkin); setConcern({ stage: "result", bundle }); setSaved(false); } finally { setBusy(false); }
  };
  const saveBundle = async (bundle: AssessmentBundle | null) => {
    if (!bundle || saved) return;
    setSaving(true);
    try { await api.saveAssessment(bundle.assessment_id); setSaved(true); setHistoryRefresh((value) => value + 1); } finally { setSaving(false); }
  };
  const reviewSensor = (bundle: AssessmentBundle) => { setQuick(bundle); setSaved(false); setPage("assessment"); };

  const onShortcut = useRef<(event: KeyboardEvent) => void>(() => undefined);
  onShortcut.current = (event: KeyboardEvent) => {
    if (!config) return;
    const action = matchShortcut(event, isTypingTarget(event.target));
    if (!action) return;
    // While a dialog is open, it owns the keyboard (Esc closes it).
    if (document.querySelector('[role="dialog"]')) return;
    if (action.type === "help") { event.preventDefault(); setShortcutsOpen(true); return; }
    if (action.type === "page" && view === "dashboard") { event.preventDefault(); setPage(action.page); }
    else if (action.type === "submit-checkin" && view === "urgent" && concern.stage === "form" && !busy) { event.preventDefault(); (document.getElementById("checkin-form") as HTMLFormElement | null)?.requestSubmit(); }
    else if (action.type === "save-assessment") {
      if (view === "urgent" && concern.stage === "result") { event.preventDefault(); void saveBundle(concern.bundle); }
      else if (view === "dashboard" && page === "assessment") { event.preventDefault(); void saveBundle(quick); }
    }
  };
  useEffect(() => {
    const listener = (event: KeyboardEvent) => onShortcut.current(event);
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, []);

  if (!config || !knowledge || view === "loading") {
    return (
      <div className="relative grid min-h-screen place-items-center overflow-hidden bg-space-black p-6 text-space-white">
        <Suspense fallback={null}><StarBackground reducedMotion={reducedMotion} /></Suspense><div className="mission-atmosphere" />
        {startupError ? <div className="glass-panel relative z-10 max-w-lg rounded-3xl border border-rose-400/25 p-8 text-center"><AlertTriangle className="mx-auto size-10 text-rose-300" /><h1 className="mt-4 text-2xl font-semibold">Local backend unavailable</h1><p className="mt-3 text-sm leading-6 text-space-muted">{startupError}</p><Button className="mt-5" onClick={() => void start()}><RotateCcw className="size-4" /> Retry</Button></div> : <div className="relative z-10 text-center"><img className="mx-auto size-16" src="./logo.svg" alt="AstroLife" /><LoaderCircle className="mx-auto mt-6 size-5 animate-spin text-cyan-300" /><p className="mt-3 telemetry-label">Initializing local crew console</p></div>}
      </div>
    );
  }

  const mission = activeMission.environment;
  const onboarded = snapshot.context.onboarded;
  const exitAside = onboarded ? <button type="button" className="text-link" onClick={() => send({ type: "EXIT" })}>Save and exit</button> : undefined;
  // The welcome screen comes before step 1, so it shows the stepper without a position.
  const flowProgress: FlowProgress | null = inFlow
    ? { index: FLOW_STEPS.indexOf(view as FlowStep) - 1, total: FLOW_STEPS.length - 1, label: view === "welcome" ? "Guided mission assessment" : STEP_LABELS[view as FlowStep] }
    : view === "urgent" ? { index: -1, total: 0, label: "Health concern report" } : null;
  const conditionTitles = config.condition_titles;
  const closeConcern = () => send({ type: "CLOSE_URGENT" });
  const linking = (port: string) => setSensor((current) => ({ ...current, connecting: true, fault: null, status: `Opening ${port}…` }));

  let screen: ReactNode = null;
  let screenKey: string = view;
  if (view === "welcome") {
    screen = <WelcomePage onBegin={() => send({ type: "NEXT" })} onResume={appState.open ? resume : undefined} resumeLabel="Resume Previous Mission" visual={<ParticleField className="welcome-particles" />} />;
  } else if (view === "mission") {
    screen = <MissionPage mission={profile.environment} onChange={(environment) => setProfile((current) => ({ ...current, environment, phase: knowledge.mission_context.missions[environment].phases.includes(current.phase) ? current.phase : knowledge.mission_context.missions[environment].phases[0] }))} onBack={() => send({ type: "BACK" })} onNext={() => send({ type: "NEXT" })} />;
  } else if (view === "context") {
    screen = <ContextPage profile={profile} context={knowledge.mission_context} onChange={setProfile} onBack={() => send({ type: "BACK" })} onNext={() => void saveContext()} busy={flowBusy} error={flowError} />;
  } else if (view === "hazards") {
    screen = <HazardsPage profile={profile} knowledge={knowledge} onBack={() => send({ type: "BACK" })} onNext={() => void beginCheckin("NEXT")} />;
  } else if (view === "safety" && questionView) {
    screen = <SafetyPage questions={questionView.safety} answers={answers} onChange={setAnswers} onBack={() => send({ type: "BACK" })} onNext={() => void submitSafety()} busy={flowBusy} error={flowError} aside={exitAside} />;
  } else if (view === "questions" && questionView) {
    screen = <QuestionsPage view={questionView} knowledge={knowledge} index={questionIndex} onIndex={setQuestionIndex} onAnswer={answerQuestion} onBack={() => send({ type: "BACK" })} onDone={() => send({ type: "NEXT" })} aside={exitAside} notice={notice} error={flowError} />;
  } else if (view === "measure") {
    screen = <MeasurePage sensor={sensor} onConnectStart={linking} onBack={() => send({ type: "BACK" })} onSubmit={(measurement) => void submitCheckin(measurement)} busy={flowBusy} error={flowError} aside={exitAside} />;
  } else if (view === "findings" && result) {
    screen = <FindingsPage result={result.result} entryId={result.entryId} config={config} knowledge={knowledge} onNext={() => send({ type: "NEXT" })} onExit={onboarded ? () => send({ type: "EXIT" }) : undefined} />;
  } else if (view === "compass") {
    screen = <CompassPage result={result?.result ?? null} actions={appState.actions} knowledge={knowledge} conditionTitles={conditionTitles} onToggleAction={(action) => void toggleAction(action)} onBack={() => send({ type: "BACK" })} onNext={() => send({ type: "NEXT" })} />;
  } else if (view === "actions") {
    screen = <ActionsPage actions={appState.actions} knowledge={knowledge} conditionTitles={conditionTitles} onToggle={(action) => void toggleAction(action)} onReassess={() => { send({ type: "EXIT" }); void beginCheckin("START_CHECKIN"); }} onBack={() => send({ type: "BACK" })} onNext={() => send({ type: "NEXT" })} busyId={actionBusy} error={flowError} />;
  } else if (view === "urgent") {
    screenKey = `urgent-${concern.stage}`;
    screen = concern.stage === "form"
      ? <CheckinPage config={config} onAssess={assessConcern} busy={busy} onCancel={closeConcern} />
      : concern.stage === "result"
        ? (
          <>
            <AssessmentPage config={config} bundle={concern.bundle} saved={saved} saving={saving} onSave={() => saveBundle(concern.bundle)} onEdit={() => setConcern({ stage: "form" })} />
            <div className="page-grid pt-0"><Button onClick={closeConcern}>Return to where I was</Button></div>
          </>
        )
        : (
          <div className="flow-page">
            <UrgentPanel assessment={concern.assessment} conditionTitles={conditionTitles} sources={knowledge.catalog.sources}>
              <Button variant="danger" onClick={() => { closeConcern(); send({ type: "NEXT" }); }}>I have acted on this · continue the check-in</Button>
              <Button onClick={closeConcern}>Change my answers</Button>
            </UrgentPanel>
            <p className="flow-footnote">Your answers are saved in this check-in. Continuing records the rest of your observations; it does not replace contacting the medical team.</p>
          </div>
        );
  } else if (view === "dashboard") {
    screenKey = `tab-${page}`;
    screen = page === "sensor" ? <SensorPage state={sensor} onReview={reviewSensor} onConnectStart={linking} />
      : page === "compass" ? <CompassPage framed={false} result={result?.result ?? null} actions={appState.actions} knowledge={knowledge} conditionTitles={conditionTitles} onToggleAction={(action) => void toggleAction(action)} />
        : page === "nasa" ? <NasaPage knowledge={knowledge} profile={appState.mission} />
          : page === "history" ? <HistoryPage config={config} active refreshKey={historyRefresh} />
            : page === "assessment" ? <AssessmentPage config={config} bundle={quick} saved={saved} saving={saving} onSave={() => saveBundle(quick)} onEdit={() => setPage("sensor")} />
              : (
                <DashboardPage
                  state={appState} knowledge={knowledge} config={config} sensor={sensor}
                  onStartCheckin={() => void beginCheckin("START_CHECKIN")} onResume={resume} onChangeMission={() => send({ type: "CHANGE_MISSION" })}
                  onOpen={setPage} onViewResult={(step) => send({ type: "VIEW_RESULT", step })}
                  onToggleAction={(action) => void toggleAction(action)} onReportConcern={reportConcern}
                />
              );
  }

  return (
    <div className="relative isolate min-h-screen overflow-hidden bg-space-black">
      <div className="black-hole-crown" data-page={view === "welcome" ? "sensor" : view} aria-hidden="true">
        <video ref={crownVideo} muted loop playsInline preload="auto">
          <source src="./videos/blackhole.webm" type="video/webm" />
        </video>
      </div>
      <Suspense fallback={null}><StarBackground reducedMotion={reducedMotion} /></Suspense>
      <div className="mission-atmosphere" data-mission={mission} aria-hidden="true" />
      <AppShell
        page={page} setPage={setPage} mission={mission} connected={sensor.connected} backendReady={backendReady} disclaimer={config.disclaimer}
        onShowShortcuts={() => setShortcutsOpen(true)} onReportConcern={view === "urgent" ? undefined : reportConcern}
        flow={flowProgress} scrollKey={`${screenKey}-${view === "questions" ? questionIndex : ""}`}
        onHome={() => { if (view === "dashboard") setPage("dashboard"); else if (onboarded && view !== "urgent") send({ type: "EXIT" }); }}
      >
        <AnimatePresence mode="wait" initial={false}>
          <Screen key={screenKey}>{screen}</Screen>
        </AnimatePresence>
        {flowError && view === "dashboard" && <div role="alert" className="flow-error mx-auto max-w-3xl">{flowError}</div>}
      </AppShell>
      <ShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
    </div>
  );
}
