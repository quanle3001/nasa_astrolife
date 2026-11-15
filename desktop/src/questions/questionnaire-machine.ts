import { assign, setup } from "xstate";
import { questionnaireView, type QuestionnaireView } from "@/questions/engine";
import type { Answers, AnswerValue, HazardId, MissionProfile, QuestionRegistry } from "@/types/flow";

/**
 * XState machine for the adaptive questionnaire.
 *
 * It holds the answers and the current position, and every transition is
 * deterministic: an answer is applied through the question engine, which
 * decides from the mission profile and the earlier answers which questions
 * exist. Follow-up answers that no longer apply are removed in the same step
 * and reported in `dropped`, so the screen can say what happened.
 *
 * The machine never scores an answer. It only decides what is asked next.
 */

export interface QuestionnaireContext {
  registry: QuestionRegistry | null;
  mission: MissionProfile | null;
  hazardOrder: HazardId[];
  answers: Answers;
  /** Index into the adaptive questions (after the safety screen); the review follows the last one. */
  index: number;
  /** Ids of answers removed by the latest change because their question no longer applies. */
  dropped: string[];
}

export type QuestionnaireEvent =
  | { type: "LOAD"; registry: QuestionRegistry; mission: MissionProfile; hazardOrder: HazardId[]; answers: Answers; index?: number }
  | { type: "ANSWER"; questionId: string; value: AnswerValue }
  | { type: "SET_ANSWERS"; answers: Answers }
  | { type: "GOTO"; index: number }
  | { type: "RESET" };

/** The questions for a context, or null before a session is loaded. */
export function viewOf(context: QuestionnaireContext): QuestionnaireView | null {
  return context.registry && context.mission ? questionnaireView(context.registry, context.mission, context.answers, context.hazardOrder) : null;
}

/** Result of applying one answer: the kept answers, what was dropped and where to go next. */
export function applyAnswer(context: QuestionnaireContext, questionId: string, value: AnswerValue): Pick<QuestionnaireContext, "answers" | "index" | "dropped"> {
  if (!context.registry || !context.mission) return { answers: context.answers, index: context.index, dropped: [] };
  const next = questionnaireView(context.registry, context.mission, { ...context.answers, [questionId]: value }, context.hazardOrder);
  const position = next.questions.findIndex((question) => question.id === questionId);
  // A follow-up opened by this answer is the very next question, so position + 1 reaches it.
  return { answers: next.answers, dropped: next.dropped, index: position >= 0 ? position + 1 : context.index };
}

const EMPTY: QuestionnaireContext = { registry: null, mission: null, hazardOrder: [], answers: {}, index: 0, dropped: [] };

export const questionnaireMachine = setup({
  types: {} as { context: QuestionnaireContext; events: QuestionnaireEvent },
}).createMachine({
  id: "astrolife-questionnaire",
  context: EMPTY,
  initial: "idle",
  on: {
    LOAD: {
      target: ".asking",
      actions: assign(({ event }) => {
        const view = questionnaireView(event.registry, event.mission, event.answers, event.hazardOrder);
        const first = view.next ? view.questions.indexOf(view.next) : view.questions.length;
        return { registry: event.registry, mission: event.mission, hazardOrder: event.hazardOrder, answers: view.answers, dropped: [], index: event.index ?? first };
      }),
    },
    RESET: { target: ".idle", actions: assign(() => EMPTY) },
  },
  states: {
    idle: {},
    asking: {
      on: {
        ANSWER: { actions: assign(({ context, event }) => applyAnswer(context, event.questionId, event.value)) },
        // Used by the safety screen, which sets several yes / no answers at once.
        SET_ANSWERS: {
          actions: assign(({ context, event }) => {
            const view = context.registry && context.mission ? questionnaireView(context.registry, context.mission, event.answers, context.hazardOrder) : null;
            return view ? { answers: view.answers, dropped: view.dropped } : { answers: event.answers, dropped: [] };
          }),
        },
        GOTO: { actions: assign(({ context, event }) => ({ index: Math.max(0, Math.min(event.index, viewOf(context)?.questions.length ?? 0)), dropped: [] })) },
      },
    },
  },
});
