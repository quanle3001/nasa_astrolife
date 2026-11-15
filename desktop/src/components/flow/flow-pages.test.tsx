import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import catalog from "../../../../software/resources/nasa_sources.json";
import missionContext from "../../../../software/resources/mission_context.json";
import registry from "../../../../software/resources/question_registry.json";
import type { AppConfig, Assessment, CheckIn } from "@/types/backend";
import type { Answers, FollowupAction, Knowledge, MissionProfile, SessionResult } from "@/types/flow";

vi.mock("@/lib/api", () => ({ api: {
  listPorts: () => Promise.resolve([]), listHistory: () => Promise.resolve({ entries: [] }), openNasaSource: vi.fn(() => Promise.resolve(true)),
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

const knowledge = { catalog, mission_context: missionContext, registry } as unknown as Knowledge;
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
});

describe("ContextPage", () => {
  it("offers only the phases of the chosen mission and validates the mission day", () => {
    const onChange = vi.fn();
    render(<ContextPage profile={profile()} context={knowledge.mission_context} onChange={onChange} onBack={() => undefined} onNext={() => undefined} busy={false} error="" />);
    const phases = within(screen.getByRole("radiogroup", { name: "Mission phase" })).getAllByRole("radio").map((radio) => radio.textContent);
    expect(phases).toEqual(["In orbit or habitat", "Return and recovery"]);
    fireEvent.change(screen.getByLabelText(/Mission day/), { target: { value: "0" } });
    expect(screen.getByText(/whole number from 1 to 2000/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Continue/ })).toBeDisabled();
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

describe("SafetyPage", () => {
  it("cannot be passed until the astronaut ticks an item or confirms that none apply", () => {
    const onChange = vi.fn();
    const { rerender } = render(<SafetyPage questions={safetyQuestions} answers={{}} onChange={onChange} onBack={() => undefined} onNext={() => undefined} busy={false} error="" />);
    expect(screen.getAllByRole("checkbox")).toHaveLength(10);
    expect(screen.getByRole("button", { name: /Continue to check-in/ })).toBeDisabled();
    fireEvent.click(screen.getByLabelText("None of these apply to me right now"));
    expect(onChange).toHaveBeenLastCalledWith(safetyNo);
    rerender(<SafetyPage questions={safetyQuestions} answers={safetyNo} onChange={onChange} onBack={() => undefined} onNext={() => undefined} busy={false} error="" />);
    expect(screen.getByRole("button", { name: /Continue to check-in/ })).toBeEnabled();
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
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuemax", String(current.questions.length));
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
    expect(screen.getByRole("heading", { name: "Your answers" })).toBeInTheDocument();
    expect(screen.getByText("Not sure")).toBeInTheDocument();
    expect(screen.getAllByText("Not answered").length).toBe(current.questions.length - 1);
    fireEvent.click(screen.getByRole("button", { name: /How well have you been sleeping/ }));
    expect(onIndex).toHaveBeenCalledWith(current.questions.findIndex((question) => question.id === "sleep.quality"));
    fireEvent.click(screen.getByRole("button", { name: "Continue to measurement" }));
    expect(onDone).toHaveBeenCalledOnce();
  });
});

describe("MeasurePage", () => {
  const renderPage = (sensor = INITIAL_SENSOR) => {
    const onSubmit = vi.fn();
    render(<MeasurePage sensor={sensor} onConnectStart={() => undefined} onBack={() => undefined} onSubmit={onSubmit} busy={false} error="" />);
    return onSubmit;
  };

  it("never submits a sensor measurement when no usable reading exists, but never blocks the check-in", () => {
    const onSubmit = renderPage();
    expect(screen.getByRole("button", { name: /See my findings/ })).toBeDisabled();
    expect(screen.getByText(/No usable reading yet/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: /Continue without a measurement/ }));
    fireEvent.click(screen.getByRole("button", { name: /See my findings/ }));
    expect(onSubmit).toHaveBeenCalledWith({ use: "none" });
  });

  it("asks the backend for its own sensor reading instead of sending numbers", () => {
    const onSubmit = renderPage({ ...INITIAL_SENSOR, connected: true, usable: true, heartRate: 72, spo2: 98, source: "sensor" });
    expect(screen.getByText("Your sensor measurement")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /See my findings/ }));
    expect(onSubmit).toHaveBeenCalledWith({ use: "sensor" });
  });

  it("accepts manual values from another instrument and labels simulated data", () => {
    const onSubmit = renderPage({ ...INITIAL_SENSOR, connected: true, usable: true, heartRate: 72, spo2: 98, source: "simulated" });
    expect(screen.getByText("Simulated data · not a measurement")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: /Enter values from another instrument/ }));
    expect(screen.getByRole("button", { name: /See my findings/ })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("SpO₂ (%)"), { target: { value: "abc" } });
    expect(screen.getByText("Enter a number, or leave this blank.")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("SpO₂ (%)"), { target: { value: "97" } });
    fireEvent.click(screen.getByRole("button", { name: /See my findings/ }));
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
      "Measurement quality", "What you reported", "Compared with earlier saved measurements", "Follow-up prompts", "NASA scientific context",
    ]);
    expect(screen.getByText("Your sensor measurement")).toBeInTheDocument();
    expect(screen.getByText("91%")).toBeInTheDocument();
    expect(screen.getByText("Poor sleep or disrupted schedule")).toBeInTheDocument();
    expect(screen.getByText("Not assessed · not treated as normal")).toBeInTheDocument();
    expect(screen.getByText("Unsure: Have you felt low, anxious or isolated?")).toBeInTheDocument();
    expect(await screen.findByText(/no trend is shown/)).toBeInTheDocument();
    expect(screen.getByText("Contact the crew medical officer promptly.")).toBeInTheDocument();
    expect(screen.queryByText("No specific concern was reported.")).not.toBeInTheDocument();
    expect(screen.getAllByText("Rule-based prompt").length).toBeGreaterThan(0);
    expect(screen.getByText("NASA scientific evidence")).toBeInTheDocument();
    expect(screen.getByText(/does not set your diagnosis/)).toBeInTheDocument();
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

describe("CompassPage (2D body map)", () => {
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
  });

  it("does not call an unhighlighted region healthy", () => {
    render(<CompassPage result={result} actions={[]} knowledge={knowledge} conditionTitles={config.condition_titles} onToggleAction={() => undefined} onNext={() => undefined} />);
    expect(screen.getByText(/a region without a highlight is not confirmed healthy/)).toBeInTheDocument();
    // The body-map region and the chip below it are both buttons for the same region.
    fireEvent.click(screen.getAllByRole("button", { name: "Eyes" })[0]);
    expect(screen.getByText(/This area was not examined and is not ruled out/)).toBeInTheDocument();
    fireEvent.keyDown(screen.getAllByRole("button", { name: "Lungs and oxygen" })[0], { key: "Enter" });
    expect(screen.getByText("98%")).toBeInTheDocument();
  });

  it("works before any check-in exists", () => {
    render(<CompassPage framed={false} result={null} actions={[]} knowledge={knowledge} conditionTitles={config.condition_titles} onToggleAction={() => undefined} />);
    expect(screen.getByText("Complete a check-in to see your own observations here.")).toBeInTheDocument();
    expect(screen.getByText(/No heart-rate measurement is recorded/)).toBeInTheDocument();
  });
});
