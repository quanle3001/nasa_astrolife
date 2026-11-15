import { describe, expect, it } from "vitest";
import context from "../../../software/resources/mission_context.json";
import registryJson from "../../../software/resources/question_registry.json";
import vectors from "../../../software/resources/question_vectors.json";
import { answerError, applicableAnswers, domainOrder, hasUrgentAnswer, questionnaireView, visibleQuestions } from "@/questions/engine";
import type { Answers, MissionContext, MissionProfile, QuestionRegistry } from "@/types/flow";

const registry = registryJson as unknown as QuestionRegistry;
const missions = (context as unknown as MissionContext).missions;
const profile = (fields: Partial<MissionProfile> = {}): MissionProfile => ({
  environment: "leo", phase: "orbit", mission_day: null, eva_recent: false, gravity_transition_recent: false, ...fields,
});
const order = (mission: MissionProfile) => missions[mission.environment].hazard_order;
const ids = (mission: MissionProfile, answers: Answers) => visibleQuestions(registry, mission, answers, order(mission)).map((question) => question.id);
const safetyNo: Answers = Object.fromEntries(registry.questions.filter((question) => question.domain === "safety").map((question) => [question.id, "no"]));

describe("question engine", () => {
  it("matches the Python engine on every shared case", () => {
    expect(vectors.registry_version).toBe(registry.version);
    for (const testCase of vectors.cases) {
      const mission = profile(testCase.mission as Partial<MissionProfile>);
      const answers = testCase.answers as Answers;
      expect(domainOrder(registry, mission, order(mission)), testCase.name).toEqual(testCase.domain_order);
      expect(ids(mission, answers), testCase.name).toEqual(testCase.visible);
      expect(applicableAnswers(registry, mission, answers), testCase.name).toEqual(testCase.applicable_answers);
    }
  });

  it("shows the same nine safety questions first for every mission", () => {
    const expected = Object.keys(safetyNo);
    expect(expected).toHaveLength(9);
    for (const mission of [profile(), profile({ environment: "lunar", phase: "surface" }), profile({ environment: "mars", phase: "transit", eva_recent: true })]) {
      expect(ids(mission, {}).slice(0, 9)).toEqual(expected);
    }
  });

  it("lets the mission change the order and add the EVA question", () => {
    expect(ids(profile(), {})).not.toContain("eva.new_symptoms");
    expect(ids(profile({ eva_recent: true }), {})[9]).toBe("eva.new_symptoms");
    expect(ids(profile({ gravity_transition_recent: true }), {})[9]).toBe("balance.dizziness");
    expect(ids(profile(), {})[9]).not.toBe(ids(profile({ environment: "mars", phase: "transit" }), {})[9]);
  });

  it("opens follow-ups for the relevant answer and removes them when it changes", () => {
    const mission = profile({ environment: "mars", phase: "transit" });
    let view = questionnaireView(registry, mission, { ...safetyNo, "sleep.quality": "poorly", "sleep.hours": 4, "sleep.duration": "over_a_week" }, order(mission));
    expect(view.questions.map((question) => question.id)).toEqual(expect.arrayContaining(["sleep.hours", "sleep.duration"]));
    expect(view.dropped).toEqual([]);
    view = questionnaireView(registry, mission, { ...view.answers, "sleep.quality": "well" }, order(mission));
    expect(view.questions.map((question) => question.id)).not.toContain("sleep.hours");
    expect(view.dropped.sort()).toEqual(["sleep.duration", "sleep.hours"]);
    expect(view.answers).not.toHaveProperty("sleep.hours");
  });

  it("does not open follow-ups for an unsure answer and keeps the uncertainty", () => {
    const mission = profile();
    const view = questionnaireView(registry, mission, { ...safetyNo, "sleep.quality": "unsure" }, order(mission));
    expect(view.questions.map((question) => question.id)).not.toContain("sleep.hours");
    expect(view.answers["sleep.quality"]).toBe("unsure");
  });

  it("tracks progress and the next unanswered question", () => {
    const mission = profile();
    const empty = questionnaireView(registry, mission, {}, order(mission));
    expect(empty.safetyComplete).toBe(false);
    expect(empty.answered).toBe(0);
    expect(empty.next?.id).toBe("balance.dizziness");
    const started = questionnaireView(registry, mission, { ...safetyNo, "balance.dizziness": "yes" }, order(mission));
    expect(started.safetyComplete).toBe(true);
    expect(started.answered).toBe(1);
    expect(started.next?.id).toBe("balance.when");
  });

  it("validates answers the same way as the backend", () => {
    const byId = Object.fromEntries(registry.questions.map((question) => [question.id, question]));
    expect(answerError(byId["sleep.quality"], "unsure")).toBe("");
    expect(answerError(byId["sleep.hours"], 6.5)).toBe("");
    expect(answerError(byId["sleep.hours"], "skipped")).toBe("");
    expect(answerError(byId["sleep.hours"], 25)).not.toBe("");
    expect(answerError(byId["sleep.hours"], Number.NaN)).not.toBe("");
    expect(answerError(byId["safety.chest_pain"], "unsure")).not.toBe("");
    expect(answerError(byId["safety.chest_pain"], "skipped")).not.toBe("");
    expect(answerError(byId["sleep.quality"], "terrible")).not.toBe("");
  });

  it("detects an urgent answer only when the concern is reported", () => {
    const mission = profile();
    expect(hasUrgentAnswer(registry, mission, safetyNo)).toBe(false);
    expect(hasUrgentAnswer(registry, mission, { ...safetyNo, "safety.breathing": "yes" })).toBe(true);
    expect(hasUrgentAnswer(registry, mission, { ...safetyNo, "eva.new_symptoms": "yes" })).toBe(false);
    expect(hasUrgentAnswer(registry, profile({ eva_recent: true }), { ...safetyNo, "eva.new_symptoms": "yes" })).toBe(true);
  });
});
