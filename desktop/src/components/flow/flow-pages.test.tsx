import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import catalog from "../../../../software/resources/nasa_sources.json";
import hrrEvidence from "../../../../software/resources/hrr_evidence.json";
import missionContext from "../../../../software/resources/mission_context.json";
import registry from "../../../../software/resources/question_registry.json";
import type { AppConfig, Assessment, CheckIn } from "@/types/backend";
import type { Answers, AssessmentPlan, CapturedMeasurement, EvidenceTraceEntry, FollowupAction, Knowledge, MissionProfile, SessionResult } from "@/types/flow";

const noTrends = { algorithm_version: "history-descriptive-1.0", entries_considered: 1, simulated_excluded: 1, limits: "Descriptive only. AstroLife has no personal baseline or approved mission limit and does not interpret a change.",
  indicators: { heart_rate: { label: "Heart rate", unit: "bpm", count: 1, points: [] }, spo2: { label: "Estimated SpO2", unit: "%", count: 1, points: [] } } };
const getTrends = vi.fn(() => Promise.resolve(noTrends as unknown));
vi.mock("@/lib/api", () => ({ api: {
  listPorts: () => Promise.resolve([]), listHistory: () => Promise.resolve({ entries: [] }), getTrends: () => getTrends(), openNasaSource: vi.fn(() => Promise.resolve(true)),
  connectSensor: vi.fn(), disconnectSensor: vi.fn(), simulateSensor: vi.fn(() => Promise.resolve({})),
} }));
vi.mock("@/components/monitor/ppg-chart", () => ({ PpgChart: () => <div data-testid="ppg-chart" /> }));

const { ActionsPage } = await import("@/components/flow/actions-page");
const { CompassPage } = await import("@/components/compass/compass-page");
const { ContextPage } = await import("@/components/flow/context-page");
const { FindingsPage } = await import("@/components/flow/findings-page");
const { HazardsPage } = await import("@/components/flow/hazards-page");
const { MeasurePage } = await import("@/components/flow/measure-page");
const { QuestionsPage } = await import("@/components/flow/questions-page");
const { SafetyPage } = await import("@/components/flow/safety-page");
const { UrgentPanel } = await import("@/components/flow/urgent-panel");
const { WelcomePage } = await import("@/components/flow/welcome-page");
const { INITIAL_SENSOR } = await import("@/components/monitor/sensor-state");
const { questionnaireView } = await import("@/questions/engine");

const knowledge = { catalog, mission_context: missionContext, registry, hrr_evidence: hrrEvidence } as unknown as Knowledge;
const profile = (fields: Partial<MissionProfile> = {}): MissionProfile => ({ environment: "leo", phase: "orbit", mission_day: null, eva_recent: false, gravity_transition_recent: false, ...fields });
const config: AppConfig = {
  missions: { leo: "Low Earth orbit", lunar: "Lunar mission", mars: "Mars / deep space" },
  symptoms: { poor_sleep: "Poor sleep or disrupted schedule", chest_pain: "Chest pain or tightness" },
  condition_titles: Object.fromEntries(knowledge.catalog.conditions.map((condition) => [condition.id, condition.title])),
  history_path: "/tmp/h.sqlite3", disclaimer: "Educational prototype",
};
const safetyQuestions = knowledge.registry.questions.filter((question) => question.domain === "safety");
const safetyNo: Answers = Object.fromEntries(safetyQuestions.map((question) => [question.id, "no"]));
const view = (mission: MissionProfile, answers: Answers) => questionnaireView(knowledge.registry, mission, answers, knowledge.mission_context.missions[mission.environment].hazard_order);
const checkin = (fields: Partial<CheckIn> = {}): CheckIn => ({ heart_rate: null, spo2: null, signal_quality: "unknown", sleep_hours: null, symptoms: [], exercise_completed: null, notes: "", input_source: "manual", sensor_port: "", sensor_received_at: "", ...fields });
const assessment = (fields: Partial<Assessment> = {}): Assessment => ({ level: "info", summary: "No review trigger was entered.", findings: [], data_notes: [], created_at: "2026-11-15T08:00:00+00:00", catalog_reviewed_on: "2026-11-14", ...fields });
const action = (fields: Partial<FollowupAction> = {}): FollowupAction => ({ id: 1, session_id: "s", entry_id: 1, condition_id: "sleep", level: "watch", text: "Review fatigue and workload with the crew.", observation: "Reported: poor sleep.", status: "open", created_at: "2026-11-15T08:00:00+00:00", completed_at: null, ...fields });

describe("WelcomePage", () => {
  it("offers Begin, and Resume only when there is something to resume", () => {
    const begin = vi.fn();
    const { rerender } = render(<WelcomePage onBegin={begin} />);
    expect(screen.getByRole("heading", { name: "ASTROLIFE" })).toBeInTheDocument();
    expect(screen.getByText("Your Next Step.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Begin Mission Assessment/ }));
    expect(begin).toHaveBeenCalledOnce();
    expect(screen.queryByRole("button", { name: /Resume/ })).not.toBeInTheDocument();
    rerender(<WelcomePage onBegin={begin} onResume={() => undefined} />);
    expect(screen.getByRole("button", { name: /Resume Previous Mission/ })).toBeInTheDocument();
  });

  it("leads a returning astronaut from the intro to the dashboard", () => {
    const dashboard = vi.fn();
    const begin = vi.fn();
    render(<WelcomePage onBegin={begin} onDashboard={dashboard} />);
    expect(screen.queryByRole("button", { name: /Begin Mission Assessment/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Open Mission Dashboard/ }));
    expect(dashboard).toHaveBeenCalledOnce();
    // The whole guided flow can be run again from the intro without losing saved history.
    fireEvent.click(screen.getByRole("button", { name: /Start a New Mission Assessment/ }));
    expect(begin).toHaveBeenCalledOnce();
  });
});

describe("ContextPage", () => {
  it("offers only the phases of the chosen mission and validates the mission day", () => {
    const onChange = vi.fn();
    render(<ContextPage profile={profile()} context={knowledge.mission_context} onChange={onChange} onBack={() => undefined} onNext={() => undefined} busy={false} error="" />);
    const phases = within(screen.getByRole("radiogroup", { name: "Mission phase" })).getAllByRole("radio").map((radio) => radio.textContent);
    expect(phases).toEqual(["In orbit or habitat", "Return and recovery"]);
    fireEvent.change(screen.getByLabelText(/Mission day/), { target: { value: "0" } });
    expect(screen.getByText(/whole number from 1 to 2000/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Save mission context/ })).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/Mission day/), { target: { value: "120" } });
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ mission_day: 120 }));
    fireEvent.click(within(screen.getByRole("radiogroup", { name: /EVA or pressure change/ })).getByRole("radio", { name: "Yes" }));
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ eva_recent: true }));
  });
});

describe("HazardsPage", () => {
  const titles = () => screen.getAllByRole("listitem").filter((item) => item.classList.contains("hazard-card")).map((item) => item.querySelector("strong")?.textContent);

  it("always lists all five NASA hazards, in the order for the selected mission", () => {
    const { unmount } = render(<HazardsPage profile={profile()} knowledge={knowledge} onBack={() => undefined} onNext={() => undefined} />);
    const leo = titles();
    expect(leo).toHaveLength(5);
    expect(leo[0]).toBe("Gravity fields");
    unmount();
    render(<HazardsPage profile={profile({ environment: "mars", phase: "transit" })} knowledge={knowledge} onBack={() => undefined} onNext={() => undefined} />);
    const mars = titles();
    expect([...mars].sort()).toEqual([...leo].sort());
    expect(mars.slice(0, 2)).toEqual(["Space radiation", "Distance from Earth"]);
    expect(screen.getAllByText("Emphasized for Mars / Deep Space")).toHaveLength(4);
  });

  it("expands a hazard into why it matters, the mission rationale, related risks and sources", () => {
    render(<HazardsPage profile={profile({ environment: "mars", phase: "transit" })} knowledge={knowledge} onBack={() => undefined} onNext={() => undefined} />);
    fireEvent.click(screen.getByRole("button", { name: /Distance from Earth/ }));
    const panel = document.getElementById("hazard-distance")!;
    expect(panel).toHaveTextContent("140 million miles");
    expect(panel).toHaveTextContent("Behavioral health and teamwork");
    expect(within(panel).getByText("NASA scientific evidence")).toBeInTheDocument();
    expect(within(panel).getAllByRole("button", { name: /NASA/ }).length).toBeGreaterThan(0);
  });
});

describe("HazardsPage with the computed assessment plan", () => {
  const plan: AssessmentPlan = {
    environment: "mars", mission_title: "Mars / Deep Space", question_count: 12, safety_question_count: 9,
    hazards: [
      { id: "radiation", title: "Space radiation", rank: 1, emphasized: true, rationale: "r", condition_ids: ["radiation"], hrr_risk_ids: [96], topic_ids: [], question_ids: [], indicator_ids: [] },
      { id: "isolation", title: "Isolation and confinement", rank: 3, emphasized: true, rationale: "r", condition_ids: ["sleep", "behavioral"], hrr_risk_ids: [99, 100, 101], topic_ids: ["sleep", "wellbeing"], question_ids: ["sleep.quality", "sleep.fatigue", "wellbeing.mood"], indicator_ids: ["sleep_hours"] },
    ],
    topics: [
      { domain_id: "safety", title: "Safety screen", position: 1, reason: "Universal safety screen: asked first on every mission.", hazard_ids: [], condition_ids: [], question_ids: [], follow_up_ids: [] },
      { domain_id: "wellbeing", title: "Mood and teamwork", position: 2, reason: 'Linked to the NASA hazard "Distance from Earth", presented second for a Mars / Deep Space mission.', hazard_ids: ["isolation", "distance"], condition_ids: ["behavioral"], question_ids: ["wellbeing.mood"], follow_up_ids: [] },
    ],
    indicators: [
      { id: "heart_rate", label: "Heart rate", unit: "bpm", source: "sensor", condition_ids: ["cardiovascular"], hazard_ids: ["gravity"], hazard_rank: 4, why: "w" },
      { id: "sleep_hours", label: "Sleep duration", unit: "hours", source: "question", condition_ids: ["sleep"], hazard_ids: ["isolation", "environment"], hazard_rank: 3, why: "w" },
    ],
  };

  it("explains what the check-in asks and collects, and why it starts where it does", () => {
    render(<HazardsPage profile={profile({ environment: "mars", phase: "transit" })} knowledge={knowledge} plan={plan} onBack={() => undefined} onNext={() => undefined} />);
    const summary = screen.getByLabelText("Your check-in plan");
    expect(summary).toHaveTextContent("9 safety items, then 12 questions in 1 health topics");
    expect(summary).toHaveTextContent("It starts with Mood and teamwork.");
    expect(summary).toHaveTextContent('Linked to the NASA hazard "Distance from Earth"');
    expect(within(summary).getByText("Heart rate · Cardiovascular changes")).toBeInTheDocument();
  });

  it("lists, per hazard, the real questions and indicators the plan derives from it", () => {
    render(<HazardsPage profile={profile({ environment: "mars", phase: "transit" })} knowledge={knowledge} plan={plan} onBack={() => undefined} onNext={() => undefined} />);
    expect(document.getElementById("hazard-radiation")).toHaveTextContent("AstroLife has no question or sensor for this hazard");
    fireEvent.click(screen.getByRole("button", { name: /Isolation and confinement/ }));
    const panel = document.getElementById("hazard-isolation")!;
    expect(panel).toHaveTextContent("How well have you been sleeping?");
    expect(panel).toHaveTextContent("Have you felt low, anxious or isolated?");
    expect(panel).toHaveTextContent("Measured or recorded: Sleep duration");
  });
});

describe("SafetyPage", () => {
  it("cannot be passed until the astronaut ticks an item or confirms that none apply", () => {
    const onChange = vi.fn();
    const { rerender } = render(<SafetyPage questions={safetyQuestions} answers={{}} onChange={onChange} onBack={() => undefined} onNext={() => undefined} busy={false} error="" />);
    expect(screen.getAllByRole("checkbox")).toHaveLength(10);
    expect(screen.getByRole("button", { name: /Continue to check-in/ })).toBeDisabled();
    expect(screen.getByText(/Tick what applies, or tick "None of these"/)).toBeInTheDocument();
    expect(screen.getByText(/a pulse and oxygen reading from your sensor/)).toBeInTheDocument();
    expect(screen.queryByText(/optional pulse/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("None of these apply to me right now"));
    expect(onChange).toHaveBeenLastCalledWith(safetyNo);
    rerender(<SafetyPage questions={safetyQuestions} answers={safetyNo} onChange={onChange} onBack={() => undefined} onNext={() => undefined} busy={false} error="" />);
    expect(screen.getByRole("button", { name: /Continue to check-in/ })).toBeEnabled();
    expect(screen.queryByText(/Tick what applies/)).not.toBeInTheDocument();
  });

  it("answers the whole screen when one item is ticked and offers immediate guidance", () => {
    const onChange = vi.fn();
    const { rerender } = render(<SafetyPage questions={safetyQuestions} answers={{}} onChange={onChange} onBack={() => undefined} onNext={() => undefined} busy={false} error="" />);
    fireEvent.click(screen.getByLabelText("Chest pain or tightness"));
    const reported = { ...safetyNo, "safety.chest_pain": "yes" };
    expect(onChange).toHaveBeenLastCalledWith(reported);
    rerender(<SafetyPage questions={safetyQuestions} answers={reported} onChange={onChange} onBack={() => undefined} onNext={() => undefined} busy={false} error="" />);
    expect(screen.getByRole("button", { name: /Show what to do now/ })).toBeEnabled();
    expect(screen.getByLabelText("None of these apply to me right now")).not.toBeChecked();
  });
});

describe("UrgentPanel", () => {
  it("shows only guidance produced by the rules, with a fallback when none is available", () => {
    const urgent = assessment({ level: "urgent", findings: [{ condition_id: "cardiovascular", level: "urgent", reason: "Reported: chest pain or tightness.", actions: ["Contact the crew medical officer now."], source_ids: ["medlineplus_emergencies"] }] });
    const { rerender } = render(<UrgentPanel assessment={urgent} conditionTitles={config.condition_titles} sources={knowledge.catalog.sources} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Contact the crew medical officer now.");
    expect(screen.getByRole("alert")).toHaveTextContent("Reported: chest pain or tightness.");
    expect(screen.getByRole("alert")).toHaveTextContent("Do not wait for a sensor reading");
    rerender(<UrgentPanel assessment={null} conditionTitles={{}} sources={[]} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Follow the mission emergency procedure");
  });
});

describe("QuestionsPage", () => {
  const setup = (mission: MissionProfile, answers: Answers, index: number) => {
    const onAnswer = vi.fn();
    const onIndex = vi.fn();
    const onDone = vi.fn();
    const current = view(mission, answers);
    render(<QuestionsPage view={current} knowledge={knowledge} index={index} onIndex={onIndex} onAnswer={onAnswer} onBack={() => undefined} onDone={onDone} />);
    return { onAnswer, onIndex, onDone, current };
  };

  it("shows one question at a time with its topic, hazard and NASA source", () => {
    const { onAnswer, current } = setup(profile({ environment: "mars", phase: "transit" }), safetyNo, 0);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Mood and teamwork");
    expect(screen.getAllByRole("heading", { level: 2 })).toHaveLength(1);
    expect(screen.getByText(/Related NASA hazards: Isolation and confinement · Distance from Earth/)).toBeInTheDocument();
    expect(screen.queryByText(/Why this question:/)).not.toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuemax", String(current.questions.length));
    // One way forward: until there is an answer, the only ways on are to answer, skip or say "not sure".
    expect(screen.queryByRole("button", { name: /Leave unanswered|Next question/ })).not.toBeInTheDocument();
    if (current.questions[0].required) expect(screen.getByText("Answer to continue")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2 })).toHaveFocus();
    fireEvent.click(screen.getByRole("radio", { name: /Yes/ }));
    expect(onAnswer).toHaveBeenCalledWith(current.questions[0], "yes");
    fireEvent.click(screen.getByRole("button", { name: /Not sure/ }));
    expect(onAnswer).toHaveBeenLastCalledWith(current.questions[0], "unsure");
    fireEvent.keyDown(window, { key: "2" });
    expect(onAnswer).toHaveBeenLastCalledWith(current.questions[0], "no");
  });

  it("marks a follow-up and validates a numeric answer", () => {
    const mission = profile();
    const answers = { ...safetyNo, "sleep.quality": "poorly" };
    const position = view(mission, answers).questions.findIndex((question) => question.id === "sleep.hours");
    const { onAnswer } = setup(mission, answers, position);
    expect(screen.getByText(/Follow-up to "How well have you been sleeping\?"/)).toBeInTheDocument();
    expect(screen.getByText(/Asked because you answered "Poorly" to the previous question/)).toBeInTheDocument();
    const input = screen.getByLabelText(/how many hours did you sleep/i);
    fireEvent.change(input, { target: { value: "30" } });
    expect(screen.getByText("Enter a number from 0 to 24.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirm" })).toBeDisabled();
    fireEvent.change(input, { target: { value: "4.5" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    expect(onAnswer).toHaveBeenCalledWith(expect.objectContaining({ id: "sleep.hours" }), 4.5);
  });

  it("ends with a review where unanswered items are shown as not answered", () => {
    const mission = profile();
    const current = view(mission, { ...safetyNo, "sleep.quality": "unsure" });
    const onIndex = vi.fn();
    const onDone = vi.fn();
    render(<QuestionsPage view={current} knowledge={knowledge} index={current.questions.length} onIndex={onIndex} onAnswer={() => undefined} onBack={() => undefined} onDone={onDone} />);
    expect(screen.getByRole("heading", { name: "Review your answers" })).toBeInTheDocument();
    expect(screen.getByText("Not sure")).toBeInTheDocument();
    expect(screen.getAllByText("Not answered").length).toBe(current.questions.length - 1);
    fireEvent.click(screen.getByRole("button", { name: /How well have you been sleeping/ }));
    expect(onIndex).toHaveBeenCalledWith(current.questions.findIndex((question) => question.id === "sleep.quality"));
    fireEvent.click(screen.getByRole("button", { name: "Continue to measurement" }));
    expect(onDone).toHaveBeenCalledOnce();
  });
});

describe("MeasurePage", () => {
  const savedMeasurement = (fields: Partial<CapturedMeasurement> = {}): CapturedMeasurement => ({
    heart_rate: 72, spo2: 98, signal_quality: "unknown", input_source: "sensor",
    sensor_port: "/dev/cu.usbserial-0001", sensor_received_at: "2026-11-15T08:00:00+00:00",
    aggregation: "median", report_count: 3, reports_required: 3, ...fields,
  });
  const renderPage = (sensor = INITIAL_SENSOR, measurement: CapturedMeasurement | null = null) => {
    const onSubmit = vi.fn();
    render(<MeasurePage sensor={sensor} measurement={measurement} onConnectStart={() => undefined} onBack={() => undefined} onSubmit={onSubmit} busy={false} error="" />);
    return onSubmit;
  };
  const primary = () => screen.getByRole("button", { name: /Use saved reading and see my findings/ });

  it("requires the sensor reading and says what is still missing", () => {
    const onSubmit = renderPage();
    expect(primary()).toBeDisabled();
    expect(screen.getByText("Required")).toBeInTheDocument();
    expect(screen.getByText(/Connect the ESP32 sensor to take your reading/)).toBeInTheDocument();
    expect(screen.getByText("Waiting for three agreeing reports")).toBeInTheDocument();
    expect(screen.queryByRole("radiogroup")).not.toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("guides the astronaut from connected to a usable reading", () => {
    renderPage({ ...INITIAL_SENSOR, connected: true, source: "sensor" });
    expect(screen.getByText(/Rest your fingertip on the lit window/)).toBeInTheDocument();
    expect(primary()).toBeDisabled();
  });

  it("keeps collecting until three reports agree", () => {
    renderPage({
      ...INITIAL_SENSOR, connected: true, usable: true, heartRate: 72, spo2: 98,
      source: "sensor", readingState: "collecting", samplesCollected: 2,
    });
    expect(screen.getByText(/Collecting stable reports \(2\/3\)/)).toBeInTheDocument();
    expect(primary()).toBeDisabled();
  });

  it("asks the backend for its own sensor reading instead of sending numbers", () => {
    const measurement = savedMeasurement();
    const onSubmit = renderPage({ ...INITIAL_SENSOR, connected: true, usable: true, measurementReady: true, heartRate: 72, spo2: 98, source: "sensor", readingState: "steady", samplesCollected: 3 }, measurement);
    expect(screen.getByText("Your sensor measurement")).toBeInTheDocument();
    expect(screen.getByText(/Measurement saved for this check-in from 3 agreeing reports/)).toBeInTheDocument();
    expect(screen.getByText(/Median of 3 agreeing reports/)).toBeInTheDocument();
    expect(screen.getByText("72 bpm")).toBeInTheDocument();
    expect(screen.getByText("98% SpO₂")).toBeInTheDocument();
    fireEvent.click(primary());
    expect(onSubmit).toHaveBeenCalledWith({ use: "sensor" });
  });

  it("keeps Continue enabled from the saved snapshot after live contact is lost", () => {
    const onSubmit = renderPage(INITIAL_SENSOR, savedMeasurement());
    expect(screen.getByText(/You can remove your finger and continue/)).toBeInTheDocument();
    expect(screen.queryByText("Waiting for three agreeing reports")).not.toBeInTheDocument();
    expect(primary()).toBeEnabled();
    fireEvent.click(primary());
    expect(onSubmit).toHaveBeenCalledWith({ use: "sensor" });
  });

  it("lets the astronaut discard the saved reading and measure again", () => {
    const onRemeasure = vi.fn();
    const { rerender } = render(<MeasurePage sensor={INITIAL_SENSOR} measurement={savedMeasurement()} onRemeasure={onRemeasure} onConnectStart={() => undefined} onBack={() => undefined} onSubmit={() => undefined} busy={false} error="" />);
    fireEvent.click(screen.getByRole("button", { name: "Measure again" }));
    expect(onRemeasure).toHaveBeenCalledTimes(1);
    rerender(<MeasurePage sensor={INITIAL_SENSOR} measurement={null} onRemeasure={onRemeasure} onConnectStart={() => undefined} onBack={() => undefined} onSubmit={() => undefined} busy={false} error="" />);
    expect(screen.queryByRole("button", { name: "Measure again" })).not.toBeInTheDocument();
    expect(screen.getByText("Waiting for three agreeing reports")).toBeInTheDocument();
  });

  it("explains how to take the reading and what the two numbers mean, with sources", () => {
    const guide = { title: "How to take a good fingertip reading",
      steps: [{ text: "Sit still and do not move the hand that is on the sensor.", source_ids: ["fda_oximetry"] }],
      meaning: [{ indicator: "heart_rate" as const, label: "Pulse (heart rate)", text: "How many times your heart beats in a minute.", source_ids: ["fda_oximetry"] },
        { indicator: "spo2" as const, label: "Blood oxygen (SpO2)", text: "An estimate of how much oxygen your blood is carrying.", source_ids: ["fda_oximetry"] }] };
    render(<MeasurePage guide={guide} sources={knowledge.catalog.sources} sensor={INITIAL_SENSOR} measurement={null} onConnectStart={() => undefined} onBack={() => undefined} onSubmit={() => undefined} busy={false} error="" />);
    expect(screen.getByText(/How to take a good fingertip reading/)).toBeInTheDocument();
    expect(screen.getByText(/Sit still and do not move the hand/)).toBeInTheDocument();
    expect(screen.getByText("Pulse (heart rate)")).toBeInTheDocument();
    expect(screen.getByText(/FDA: Pulse Oximeters/)).toBeInTheDocument();
    expect(screen.getByText(/not clinically validated/)).toBeInTheDocument();
  });

  it("labels simulated data", () => {
    renderPage(
      { ...INITIAL_SENSOR, connected: true, usable: true, measurementReady: true, heartRate: 72, spo2: 98, source: "simulated", readingState: "steady", samplesCollected: 3 },
      savedMeasurement({ input_source: "simulated", sensor_port: "simulated://max30102" }),
    );
    expect(screen.getByText("Simulated data · not a measurement")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Continue with saved simulated demo values/ })).toBeEnabled();
    expect(screen.queryByRole("button", { name: /Use saved reading/ })).not.toBeInTheDocument();
  });

  it("never dead-ends when the hardware fails, but needs a stated reason", () => {
    const onSubmit = renderPage();
    fireEvent.click(screen.getByRole("button", { name: /The sensor cannot be used right now/ }));
    const proceed = screen.getByRole("button", { name: "Continue without a sensor reading" });
    expect(proceed).toBeDisabled();
    expect(screen.getByText(/never assumed to be normal/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: /The sensor is not available or not working/ }));
    fireEvent.click(proceed);
    expect(onSubmit).toHaveBeenCalledWith({ use: "none", reason: "sensor_unavailable" });
  });

  it("accepts values from another instrument through the fallback only", () => {
    const onSubmit = renderPage();
    fireEvent.click(screen.getByRole("button", { name: /The sensor cannot be used right now/ }));
    fireEvent.click(screen.getByRole("radio", { name: /Enter values from another approved instrument/ }));
    const proceed = screen.getByRole("button", { name: "Continue without a sensor reading" });
    expect(proceed).toBeDisabled();
    fireEvent.change(screen.getByLabelText("SpO₂ (%)"), { target: { value: "abc" } });
    expect(screen.getByText("Enter a number, or leave this blank.")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("SpO₂ (%)"), { target: { value: "97" } });
    fireEvent.click(proceed);
    expect(onSubmit).toHaveBeenCalledWith({ use: "manual", heart_rate: null, spo2: 97, signal_quality: "unknown" });
  });
});

describe("FindingsPage", () => {
  const result = (fields: Partial<SessionResult> = {}): SessionResult => ({
    checkin: checkin({ heart_rate: 72, spo2: 91, symptoms: ["poor_sleep"], sleep_hours: 4.5, input_source: "sensor", sensor_received_at: "2026-11-15T08:00:00+00:00" }),
    assessment: assessment({ level: "review", summary: "Medical review needed.", data_notes: ["Signal quality is poor or unknown. Recheck placement."], findings: [
      { condition_id: "hypoxia", level: "review", reason: "Reported SpO2 91% meets the general reference for contacting a clinician.", actions: ["Contact the crew medical officer promptly."], source_ids: ["medlineplus_oximetry"] },
      { condition_id: "sleep", level: "watch", reason: "Reported: poor sleep or disrupted schedule.", actions: ["Review fatigue and workload with the crew."], source_ids: [] },
      { condition_id: "bone", level: "info", reason: "No specific concern was reported.", actions: [], source_ids: [] },
    ] }),
    session_notes: ["These items were not assessed and are not treated as normal:", "Unsure: Have you felt low, anxious or isolated?", "Skipped: Do you have bone or back pain?"],
    ...fields,
  });

  it("keeps measurement, reported observations, trends, rule prompts and NASA research in separate sections", async () => {
    render(<FindingsPage result={result()} entryId={5} config={config} knowledge={knowledge} onNext={() => undefined} />);
    expect(screen.getAllByRole("heading", { level: 2 }).map((heading) => heading.textContent)).toEqual([
      "Follow-up prompts", "Your measurement", "What you reported", "Compared with earlier saved measurements", "NASA scientific context",
    ]);
    expect(screen.getByText("Your sensor measurement")).toBeInTheDocument();
    expect(screen.getByText("91%")).toBeInTheDocument();
    expect(screen.getByText("Poor sleep or disrupted schedule")).toBeInTheDocument();
    expect(screen.getByText("Not assessed · not treated as normal")).toBeInTheDocument();
    expect(screen.getByText("Unsure: Have you felt low, anxious or isolated?")).toBeInTheDocument();
    expect(await screen.findByText(/no trend is shown/)).toHaveTextContent("1 simulated entry is not counted.");
    expect(screen.getByText("Contact the crew medical officer promptly.")).toBeInTheDocument();
    expect(screen.queryByText("No specific concern was reported.")).not.toBeInTheDocument();
    expect(screen.getAllByText("Rule-based prompt").length).toBeGreaterThan(0);
    expect(screen.getByText("NASA scientific evidence")).toBeInTheDocument();
    expect(screen.getByText(/does not set your diagnosis/)).toBeInTheDocument();
  });

  it("traces a prompt from the mission's NASA hazard and risk to the astronaut's own observation", () => {
    const entry: EvidenceTraceEntry = {
      condition_id: "sleep", condition_title: "Sleep loss and fatigue", level: "watch", mission_title: "Mars / Deep Space",
      hazards: [{ id: "isolation", title: "Isolation and confinement", rank: 3, emphasized: true }, { id: "environment", title: "Hostile or closed environments", rank: 5, emphasized: false }],
      nasa_risks: [{ risk_id: 100, risk_title: "Risk of Performance Decrements and Adverse Health Outcomes Resulting from Sleep Loss, Circadian Desynchronization, and Work Overload", risk_url: "https://humanresearchroadmap.nasa.gov/Risks/?i=100", report_title: "Evidence Report", report_url: "https://humanresearchroadmap.nasa.gov/evidence/reports/Sleep.pdf" }],
      observations: [{ kind: "answer", observation_id: "answer:sleep.quality", question_id: "sleep.quality", question: "How well have you been sleeping?", answer_id: "poorly", answer: "Poorly", rule_ids: ["observation:poor_sleep"] }],
      rule_reason: "Reported: poor sleep or disrupted schedule.", actions: ["Review fatigue and workload with the crew."],
      traceability: {
        nasa_source_ids: ["sleep", "research"], nasa_risk_ids: [100], question_ids: ["sleep.quality"], observation_ids: ["answer:sleep.quality"],
        rule_ids: ["observation:poor_sleep"], rules_engine: "astrotip.analysis.rules.assess", rules_version: "2026.11.1", catalog_reviewed_on: "2026-11-14",
        question_registry_version: "2026.11.1", evidence_reviewed_on: "2026-11-15", action_ids: [7], history_entry_id: 5, session_id: "abc",
      },
    };
    render(<FindingsPage result={result({ evidence_trace: [entry] })} entryId={5} config={config} knowledge={knowledge} onNext={() => undefined} />);
    const steps = within(screen.getByRole("list", { name: "Why AstroLife shows this prompt for Sleep loss and fatigue" })).getAllByRole("listitem");
    expect(steps.map((step) => step.querySelector(".trace-step")?.textContent)).toEqual(["Mission", "NASA hazard", "NASA health risk", "Your observation", "Rule-based prompt", "Follow-up"]);
    expect(steps[0]).toHaveTextContent("Mars / Deep Space");
    expect(steps[1]).toHaveTextContent("Isolation and confinement");
    expect(steps[1]).toHaveTextContent("presented third for this mission");
    expect(steps[2]).toHaveTextContent("Human Research Roadmap risk 100");
    expect(steps[3]).toHaveTextContent("How well have you been sleeping? Poorly");
    expect(steps[4]).toHaveTextContent("Follow up");
    expect(steps[5]).toHaveTextContent("1 action in your Action Center");
    // Identifiers for an audit are present but folded away.
    const audit = screen.getByText("Audit details").closest("details")!;
    expect(audit).not.toHaveAttribute("open");
    expect(audit).toHaveTextContent("astrotip.analysis.rules.assess · version 2026.11.1");
    expect(audit).toHaveTextContent("observation:poor_sleep");
    expect(audit).toHaveTextContent("answer:sleep.quality");
    expect(audit).toHaveTextContent("#7");
    expect(audit).toHaveTextContent("history entry #5");
    // The hypoxia prompt has no trace entry in this result and shows none.
    expect(screen.getAllByRole("list", { name: /Why AstroLife shows this prompt/ })).toHaveLength(1);
  });

  it("shows the backend's computed trend for real saved measurements without interpreting it", async () => {
    getTrends.mockResolvedValueOnce({ ...noTrends, entries_considered: 3, simulated_excluded: 0, indicators: {
      heart_rate: { label: "Heart rate", unit: "bpm", count: 3, points: [], mean: 70, minimum: 60, maximum: 80, latest: 80, previous: 70, change_from_previous: 10 },
      spo2: { label: "Estimated SpO2", unit: "%", count: 1, points: [], mean: 97, minimum: 97, maximum: 97, latest: 97, previous: null, change_from_previous: null },
    } });
    render(<FindingsPage result={result()} entryId={5} config={config} knowledge={knowledge} onNext={() => undefined} />);
    const row = (await screen.findByRole("rowheader", { name: "Heart rate" })).closest("tr")!;
    expect(row).toHaveTextContent("380 bpm70+1060 to 8070.0");
    expect(screen.queryByRole("rowheader", { name: "Estimated SpO2" })).not.toBeInTheDocument();
    expect(screen.getByText(/does not interpret a change/)).toBeInTheDocument();
  });

  it("says a missing measurement is unassessed and shows urgent guidance first", () => {
    const urgent = result({ checkin: checkin({ symptoms: ["chest_pain"] }), assessment: assessment({ level: "urgent", summary: "Immediate action needed.", findings: [
      { condition_id: "cardiovascular", level: "urgent", reason: "Reported: chest pain or tightness.", actions: ["Contact the crew medical officer now."], source_ids: [] },
      { condition_id: "sleep", level: "watch", reason: "Reported: poor sleep.", actions: ["Review fatigue."], source_ids: [] },
    ] }), session_notes: [] });
    render(<FindingsPage result={urgent} entryId={5} config={config} knowledge={knowledge} onNext={() => undefined} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Contact the crew medical officer now.");
    expect(screen.getByText(/Pulse and oxygen are unassessed, not normal/)).toBeInTheDocument();
    expect(screen.getByText(/1 lower-priority prompt is saved in your Action Center/)).toBeInTheDocument();
    expect(screen.queryByText("Your sensor measurement")).not.toBeInTheDocument();
  });
});

describe("ActionsPage", () => {
  it("lists actions with their reason and lets the astronaut complete or reopen one", () => {
    const onToggle = vi.fn();
    const onReassess = vi.fn();
    const actions = [action(), action({ id: 2, status: "done", completed_at: "2026-11-15T09:00:00+00:00", text: "Resume the prescribed exercise plan.", condition_id: "fitness" })];
    render(<ActionsPage actions={actions} knowledge={knowledge} conditionTitles={config.condition_titles} onToggle={onToggle} onReassess={onReassess} onNext={() => undefined} />);
    expect(screen.getByText(/1 open · 1 done/)).toBeInTheDocument();
    expect(screen.getAllByText("Reported: poor sleep.")).toHaveLength(2);
    fireEvent.click(screen.getByRole("checkbox", { name: /Mark done: Review fatigue/ }));
    expect(onToggle).toHaveBeenCalledWith(actions[0]);
    expect(screen.getByRole("checkbox", { name: /Reopen: Resume the prescribed exercise plan/ })).toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: /Reassess now/ }));
    expect(onReassess).toHaveBeenCalledOnce();
  });

  it("does not present an empty list as a clearance", () => {
    render(<ActionsPage actions={[]} knowledge={knowledge} conditionTitles={{}} onToggle={() => undefined} onReassess={() => undefined} onNext={() => undefined} />);
    expect(screen.getByText(/An empty list is not a health clearance/)).toBeInTheDocument();
  });
});

describe("CompassPage (region buttons; the 3D viewer needs WebGL, which the test environment lacks)", () => {
  const result: SessionResult = {
    checkin: checkin({ heart_rate: 72, spo2: 98, input_source: "sensor" }),
    assessment: assessment({ level: "watch", findings: [
      { condition_id: "cardiovascular", level: "watch", reason: "Heart rate 72 bpm was recorded.", actions: ["Compare with your baseline."], source_ids: [] },
      { condition_id: "sans", level: "info", reason: "No specific concern.", actions: [], source_ids: [] },
    ] }),
    session_notes: [],
  };

  it("opens the NASA-linked information, the recorded measurement and actions for a selected structure", () => {
    render(<CompassPage result={result} actions={[action({ condition_id: "cardiovascular", text: "Compare with your baseline." })]} knowledge={knowledge} conditionTitles={config.condition_titles} onToggleAction={() => undefined} onNext={() => undefined} />);
    fireEvent.click(screen.getByRole("button", { name: /^Heart and circulation · has a prompt to review$/ }));
    expect(screen.getByRole("heading", { name: "Heart and circulation" })).toBeInTheDocument();
    expect(screen.getByText("72 bpm")).toBeInTheDocument();
    expect(screen.getByText("Your sensor measurement")).toBeInTheDocument();
    expect(screen.getByText("Heart rate 72 bpm was recorded.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Cardiovascular changes" })).toBeInTheDocument();
    expect(within(screen.getByRole("list", { name: "Related NASA hazards" })).getByText("Gravity fields")).toBeInTheDocument();
    expect(screen.getByText("NASA scientific evidence")).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: /Mark done: Compare with your baseline/ })).toBeInTheDocument();
    // NASA research detail is folded away until the astronaut asks for it.
    expect(screen.queryByText(/What to watch:/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Show NASA research and sources/ }));
    expect(screen.getByText(/What to watch:/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Hide NASA research and sources/ })).toHaveAttribute("aria-expanded", "true");
    // The Human Research Roadmap evidence report for this risk is one click away.
    expect(screen.getByRole("button", { name: /Evidence Report: Risk of Cardiovascular Adaptations/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Roadmap risk page" })).toHaveAttribute("title", "https://humanresearchroadmap.nasa.gov/Risks/?i=179");
  });

  it("does not call an unhighlighted region healthy", () => {
    render(<CompassPage result={result} actions={[]} knowledge={knowledge} conditionTitles={config.condition_titles} onToggleAction={() => undefined} onNext={() => undefined} />);
    expect(screen.getByText(/a region without a mark is not confirmed healthy/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Eyes" }));
    expect(screen.getByText(/This area was not examined and is not ruled out/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Lungs and oxygen" }));
    expect(screen.getByText("98%")).toBeInTheDocument();
  });

  it("stays usable through the region buttons when the device cannot draw 3D, with no 2D map", () => {
    render(<CompassPage result={result} actions={[]} knowledge={knowledge} conditionTitles={config.condition_titles} onToggleAction={() => undefined} onNext={() => undefined} />);
    expect(screen.getByRole("status")).toHaveTextContent(/The 3D body cannot be shown on this device. Choose a body region from the buttons below/);
    expect(screen.queryByRole("group", { name: /Body map/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("radiogroup", { name: "Body view" })).not.toBeInTheDocument();
    expect(within(screen.getByRole("navigation", { name: "Body regions" })).getAllByRole("button")).toHaveLength(10);
    fireEvent.click(screen.getByRole("button", { name: "Brain and behavior" }));
    expect(screen.getByRole("heading", { name: "Sleep loss and fatigue" })).toBeInTheDocument();
  });

  it("works before any check-in exists", () => {
    render(<CompassPage framed={false} result={null} actions={[]} knowledge={knowledge} conditionTitles={config.condition_titles} onToggleAction={() => undefined} />);
    expect(screen.getByText("Complete a check-in to see your own observations here.")).toBeInTheDocument();
    expect(screen.getByText(/No heart-rate measurement is recorded/)).toBeInTheDocument();
  });
});
