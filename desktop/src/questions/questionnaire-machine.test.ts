import { describe, expect, it } from "vitest";
import { createActor } from "xstate";
import context from "../../../software/resources/mission_context.json";
import registryJson from "../../../software/resources/question_registry.json";
import { questionnaireMachine, viewOf, type QuestionnaireEvent } from "@/questions/questionnaire-machine";
import type { Answers, MissionContext, MissionProfile, QuestionRegistry } from "@/types/flow";

const registry = registryJson as unknown as QuestionRegistry;
const missions = (context as unknown as MissionContext).missions;
const profile = (fields: Partial<MissionProfile> = {}): MissionProfile => ({ environment: "leo", phase: "orbit", mission_day: null, eva_recent: false, gravity_transition_recent: false, ...fields });
const safetyNo: Answers = Object.fromEntries(registry.questions.filter((question) => question.domain === "safety").map((question) => [question.id, "no"]));

function start(mission: MissionProfile, answers: Answers = safetyNo) {
  const actor = createActor(questionnaireMachine).start();
  actor.send({ type: "LOAD", registry, mission, hazardOrder: missions[mission.environment].hazard_order, answers });
  const state = () => actor.getSnapshot().context;
  const ids = () => viewOf(state())!.questions.map((question) => question.id);
  const current = () => ids()[state().index] ?? "review";
  const send = (event: QuestionnaireEvent) => { actor.send(event); return state(); };
  return { state, ids, current, send };
}

describe("questionnaire machine", () => {
  it("asks nothing before a session is loaded", () => {
    const actor = createActor(questionnaireMachine).start();
    actor.send({ type: "ANSWER", questionId: "sleep.quality", value: "poorly" });
    expect(actor.getSnapshot().value).toBe("idle");
    expect(actor.getSnapshot().context.answers).toEqual({});
  });

  it("starts on a different first question for different missions", () => {
    expect(start(profile()).current()).toBe("balance.dizziness");
    expect(start(profile({ environment: "mars", phase: "transit" })).current()).toBe("wellbeing.mood");
    expect(start(profile({ eva_recent: true })).current()).toBe("eva.new_symptoms");
  });

  it("moves to the follow-up that an answer opens, then past it", () => {
    const flow = start(profile());
    flow.send({ type: "GOTO", index: flow.ids().indexOf("sleep.quality") });
    flow.send({ type: "ANSWER", questionId: "sleep.quality", value: "poorly" });
    expect(flow.current()).toBe("sleep.hours");
    flow.send({ type: "ANSWER", questionId: "sleep.hours", value: 4.5 });
    expect(flow.current()).toBe("sleep.duration");
    flow.send({ type: "ANSWER", questionId: "sleep.duration", value: "several_nights" });
    expect(flow.current()).toBe("sleep.fatigue");
  });

  it("skips follow-ups when the answer does not call for them", () => {
    const flow = start(profile());
    flow.send({ type: "GOTO", index: flow.ids().indexOf("sleep.quality") });
    flow.send({ type: "ANSWER", questionId: "sleep.quality", value: "well" });
    expect(flow.current()).toBe("sleep.fatigue");
    expect(flow.ids()).not.toContain("sleep.hours");
  });

  it("removes follow-up answers when an earlier answer changes, and reports them", () => {
    const flow = start(profile(), { ...safetyNo, "sleep.quality": "poorly", "sleep.hours": 4, "sleep.duration": "over_a_week" });
    const changed = flow.send({ type: "ANSWER", questionId: "sleep.quality", value: "okay" });
    expect(changed.dropped.sort()).toEqual(["sleep.duration", "sleep.hours"]);
    expect(changed.answers).not.toHaveProperty("sleep.hours");
    expect(changed.answers["sleep.quality"]).toBe("okay");
    expect(flow.send({ type: "ANSWER", questionId: "sleep.fatigue", value: "no" }).dropped).toEqual([]);
  });

  it("keeps an unsure answer as given and opens no follow-up for it", () => {
    const flow = start(profile());
    flow.send({ type: "ANSWER", questionId: "balance.dizziness", value: "unsure" });
    expect(flow.state().answers["balance.dizziness"]).toBe("unsure");
    expect(flow.ids()).not.toContain("balance.when");
    expect(flow.current()).toBe("balance.vision");
  });

  it("resumes at the first unanswered question and reaches the review at the end", () => {
    const flow = start(profile(), { ...safetyNo, "balance.dizziness": "no", "balance.vision": "no" });
    expect(flow.current()).toBe("heart.palpitations");
    for (const id of flow.ids().slice(flow.state().index)) flow.send({ type: "ANSWER", questionId: id, value: id === "strength.exercise" ? "completed" : id === "sleep.quality" ? "well" : "no" });
    expect(flow.current()).toBe("review");
    expect(flow.send({ type: "GOTO", index: 999 }).index).toBe(flow.ids().length);
    expect(flow.send({ type: "GOTO", index: -3 }).index).toBe(0);
  });

  it("applies the safety screen's answers through the same rules", () => {
    const flow = start(profile(), {});
    const next = flow.send({ type: "SET_ANSWERS", answers: { ...safetyNo, "safety.breathing": "yes", "sleep.hours": 3 } });
    expect(next.answers["safety.breathing"]).toBe("yes");
    expect(next.answers).not.toHaveProperty("sleep.hours");
    expect(next.dropped).toEqual(["sleep.hours"]);
  });

  it("forgets everything on reset", () => {
    const flow = start(profile(), { ...safetyNo, "sleep.quality": "poorly" });
    expect(flow.send({ type: "RESET" })).toEqual({ registry: null, mission: null, hazardOrder: [], answers: {}, index: 0, dropped: [] });
  });
});
