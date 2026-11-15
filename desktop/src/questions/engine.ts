import type { Answers, Condition, HazardId, MissionProfile, Question, QuestionRegistry } from "@/types/flow";

/**
 * Deterministic question eligibility for the guided check-in.
 *
 * This mirrors `software/astrotip/questionnaire/registry.py`. Both are tested
 * against `software/resources/question_vectors.json`. The engine only decides
 * which questions to show and in what order; it never scores an answer. The
 * Python backend re-applies the same rules when a check-in is submitted.
 */

export const UNSURE = "unsure";
export const SKIPPED = "skipped";
export const SAFETY_DOMAIN = "safety";

export function conditionMet(condition: Condition | undefined, mission: MissionProfile, answers: Answers): boolean {
  if (!condition) return true;
  if ("all" in condition) return condition.all.every((child) => conditionMet(child, mission, answers));
  if ("any" in condition) return condition.any.some((child) => conditionMet(child, mission, answers));
  if ("answer" in condition) {
    const value = answers[condition.answer.question];
    return value !== undefined && condition.answer.in.includes(value);
  }
  const value = mission[condition.mission.field];
  return "equals" in condition.mission ? value === condition.mission.equals : (condition.mission.in ?? []).includes(value);
}

/** Safety first, then topics promoted by mission context, then by hazard emphasis. */
export function domainOrder(registry: QuestionRegistry, mission: MissionProfile, hazardOrder: HazardId[]): string[] {
  const rank = (index: number): [number, number, number] => {
    const domain = registry.domains[index];
    if (domain.id === SAFETY_DOMAIN) return [0, 0, index];
    if (domain.promote_if && conditionMet(domain.promote_if, mission, {})) return [1, 0, index];
    const positions = domain.hazard_ids.map((hazard) => hazardOrder.indexOf(hazard)).filter((position) => position >= 0);
    return [2, positions.length ? Math.min(...positions) : hazardOrder.length, index];
  };
  return registry.domains
    .map((_domain, index) => rank(index))
    .sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2])
    .map(([, , index]) => registry.domains[index].id);
}

/**
 * Keep only answers whose question is still shown. Questions are evaluated in
 * registry order against the answers kept so far, so changing an earlier
 * answer removes follow-up answers that no longer apply.
 */
export function applicableAnswers(registry: QuestionRegistry, mission: MissionProfile, answers: Answers): Answers {
  const kept: Answers = {};
  for (const question of registry.questions) {
    if (question.id in answers && conditionMet(question.show_if, mission, kept)) kept[question.id] = answers[question.id];
  }
  return kept;
}

/** Questions to ask for this mission and these answers, in presentation order. */
export function visibleQuestions(registry: QuestionRegistry, mission: MissionProfile, answers: Answers, hazardOrder: HazardId[]): Question[] {
  const kept = applicableAnswers(registry, mission, answers);
  const order = new Map(domainOrder(registry, mission, hazardOrder).map((id, index) => [id, index]));
  return registry.questions
    .map((question, index) => ({ question, index }))
    .filter(({ question }) => conditionMet(question.show_if, mission, kept))
    .sort((a, b) => (order.get(a.question.domain) ?? 0) - (order.get(b.question.domain) ?? 0) || a.index - b.index)
    .map(({ question }) => question);
}

/** Regular answer values for a question, without "unsure" / "skipped". */
export function optionValues(question: Question): string[] {
  return question.input === "boolean" ? ["yes", "no"] : (question.options ?? []).map((option) => option.value);
}

/** Message for an invalid answer, or an empty string when the answer is allowed. */
export function answerError(question: Question, value: unknown): string {
  if (value === UNSURE && question.allow_unsure) return "";
  if (value === SKIPPED && question.allow_skip) return "";
  if (question.input === "number") {
    const limits = question.validation ?? { min: -Infinity, max: Infinity };
    return typeof value === "number" && Number.isFinite(value) && value >= limits.min && value <= limits.max
      ? "" : `Enter a number from ${limits.min} to ${limits.max}.`;
  }
  return typeof value === "string" && optionValues(question).includes(value) ? "" : "Choose one of the answers.";
}

/** True when any urgent question was answered with a value that reports the concern. */
export function hasUrgentAnswer(registry: QuestionRegistry, mission: MissionProfile, answers: Answers): boolean {
  const kept = applicableAnswers(registry, mission, answers);
  return registry.questions.some((question) => question.urgent && kept[question.id] === "yes");
}

export interface QuestionnaireView {
  /** The universal safety screen, identical for every mission. */
  safety: Question[];
  /** Adaptive questions after the safety screen, in order. */
  questions: Question[];
  /** Answers with no-longer-applicable follow-ups removed. */
  answers: Answers;
  /** Ids of answers that were dropped because an earlier answer changed. */
  dropped: string[];
  answered: number;
  /** First adaptive question without an answer, or null when all are answered. */
  next: Question | null;
  safetyComplete: boolean;
}

/** Everything the question pages need for the current mission and answers. */
export function questionnaireView(registry: QuestionRegistry, mission: MissionProfile, answers: Answers, hazardOrder: HazardId[]): QuestionnaireView {
  const kept = applicableAnswers(registry, mission, answers);
  const visible = visibleQuestions(registry, mission, kept, hazardOrder);
  const safety = visible.filter((question) => question.domain === SAFETY_DOMAIN);
  const questions = visible.filter((question) => question.domain !== SAFETY_DOMAIN);
  return {
    safety, questions, answers: kept,
    dropped: Object.keys(answers).filter((id) => !(id in kept)),
    answered: questions.filter((question) => question.id in kept).length,
    next: questions.find((question) => !(question.id in kept)) ?? null,
    safetyComplete: safety.every((question) => question.id in kept),
  };
}
