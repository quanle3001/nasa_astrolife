import { assign, setup } from "xstate";

/**
 * Navigation state machine for the guided AstroLife journey.
 *
 * First launch walks the onboarding steps in order and ends on the dashboard.
 * Later launches start on the dashboard; a new check-in then begins at the
 * safety screen. Reporting an urgent concern is possible from every step and
 * returns to the same step afterwards.
 *
 * The machine owns navigation only. Answers, sessions and results live in the
 * Python backend; nothing here decides anything medical.
 */

/** Guided steps in order. Each maps to one page of the flow. */
export const FLOW_STEPS = ["welcome", "mission", "context", "hazards", "safety", "questions", "measure", "findings", "compass", "actions"] as const;
export type FlowStep = (typeof FLOW_STEPS)[number];
export type FlowView = FlowStep | "dashboard" | "urgent" | "loading";

/** Steps of a check-in that can be resumed after an interruption. */
export type ResumableStep = "safety" | "questions" | "measure";

export type FlowEvent =
  | { type: "LOADED"; onboarded: boolean }
  | { type: "NEXT" }
  | { type: "BACK" }
  | { type: "EXIT" }
  | { type: "RESUME"; step: ResumableStep }
  | { type: "START_CHECKIN" }
  | { type: "CHANGE_MISSION" }
  | { type: "VIEW_RESULT"; step: "findings" | "compass" | "actions" }
  | { type: "REPORT_URGENT" }
  | { type: "CLOSE_URGENT" };

export const flowMachine = setup({
  types: {} as { context: { onboarded: boolean }; events: FlowEvent },
  guards: {
    onboarded: ({ context }) => context.onboarded,
    loadedOnboarded: ({ event }) => event.type === "LOADED" && event.onboarded,
    resumeSafety: ({ event }) => event.type === "RESUME" && event.step === "safety",
    resumeQuestions: ({ event }) => event.type === "RESUME" && event.step === "questions",
    resumeMeasure: ({ event }) => event.type === "RESUME" && event.step === "measure",
    viewFindings: ({ event }) => event.type === "VIEW_RESULT" && event.step === "findings",
    viewCompass: ({ event }) => event.type === "VIEW_RESULT" && event.step === "compass",
    viewActions: ({ event }) => event.type === "VIEW_RESULT" && event.step === "actions",
  },
  actions: {
    markOnboarded: assign({ onboarded: true }),
  },
}).createMachine({
  id: "astrolife-flow",
  context: { onboarded: false },
  initial: "loading",
  states: {
    loading: {
      on: {
        LOADED: [
          { guard: "loadedOnboarded", target: "app.dashboard", actions: "markOnboarded" },
          { target: "app.welcome" },
        ],
      },
    },
    app: {
      initial: "welcome",
      // An urgent concern can be reported from every step of the app.
      on: { REPORT_URGENT: "urgent" },
      states: {
        last: { type: "history", history: "shallow" },
        welcome: { on: { NEXT: "mission", RESUME: [
          { guard: "resumeSafety", target: "safety" }, { guard: "resumeQuestions", target: "questions" }, { guard: "resumeMeasure", target: "measure" },
        ] } },
        mission: { on: { NEXT: "context", BACK: [{ guard: "onboarded", target: "dashboard" }, { target: "welcome" }] } },
        context: { on: { NEXT: "hazards", BACK: "mission" } },
        hazards: { on: { NEXT: "safety", BACK: "context", EXIT: { guard: "onboarded", target: "dashboard" } } },
        safety: { on: { NEXT: "questions", BACK: [{ guard: "onboarded", target: "dashboard" }, { target: "hazards" }], EXIT: { guard: "onboarded", target: "dashboard" } } },
        questions: { on: { NEXT: "measure", BACK: "safety", EXIT: { guard: "onboarded", target: "dashboard" } } },
        measure: { on: { NEXT: "findings", BACK: "questions", EXIT: { guard: "onboarded", target: "dashboard" } } },
        // A submitted result is final: there is no way back into its answers.
        findings: { on: { NEXT: "compass", EXIT: "dashboard" } },
        compass: { on: { NEXT: "actions", BACK: "findings", EXIT: "dashboard" } },
        actions: { on: { NEXT: "dashboard", BACK: "compass", EXIT: "dashboard" } },
        dashboard: {
          entry: "markOnboarded",
          on: {
            START_CHECKIN: "safety",
            CHANGE_MISSION: "mission",
            RESUME: [
              { guard: "resumeSafety", target: "safety" }, { guard: "resumeQuestions", target: "questions" }, { guard: "resumeMeasure", target: "measure" },
            ],
            VIEW_RESULT: [
              { guard: "viewFindings", target: "findings" }, { guard: "viewCompass", target: "compass" }, { guard: "viewActions", target: "actions" },
            ],
          },
        },
      },
    },
    urgent: { on: { CLOSE_URGENT: "app.last" } },
  },
});

/** The page to render for a machine state value. */
export function flowView(value: unknown): FlowView {
  if (typeof value === "string") return value as FlowView;
  if (value && typeof value === "object" && "app" in value) return (value as { app: FlowView }).app;
  return "loading";
}
