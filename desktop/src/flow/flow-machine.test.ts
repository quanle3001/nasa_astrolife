import { describe, expect, it } from "vitest";
import { createActor } from "xstate";
import { FLOW_STEPS, flowMachine, flowView, type FlowEvent } from "@/flow/flow-machine";

function start(onboarded: boolean) {
  const actor = createActor(flowMachine).start();
  actor.send({ type: "LOADED", onboarded });
  const view = () => flowView(actor.getSnapshot().value);
  const send = (...events: (FlowEvent | FlowEvent["type"])[]) => {
    for (const event of events) actor.send(typeof event === "string" ? { type: event } as FlowEvent : event);
    return view();
  };
  return { view, send };
}

describe("flow machine", () => {
  it("walks a first launch from welcome through every step to the dashboard", () => {
    const flow = start(false);
    const visited = [flow.view()];
    for (let step = 0; step < FLOW_STEPS.length; step += 1) visited.push(flow.send("NEXT"));
    expect(visited).toEqual([...FLOW_STEPS, "dashboard"]);
  });

  it("resumes the dashboard on later launches and starts a check-in at the safety screen", () => {
    const flow = start(true);
    expect(flow.view()).toBe("dashboard");
    expect(flow.send("START_CHECKIN")).toBe("safety");
    expect(flow.send("NEXT", "NEXT", "NEXT")).toBe("findings");
  });

  it("supports Back through the questionnaire but not back into a submitted result", () => {
    const flow = start(false);
    flow.send("NEXT", "NEXT", "NEXT", "NEXT", "NEXT");
    expect(flow.view()).toBe("questions");
    expect(flow.send("BACK")).toBe("safety");
    expect(flow.send("BACK")).toBe("hazards");
    flow.send("NEXT", "NEXT", "NEXT", "NEXT");
    expect(flow.view()).toBe("findings");
    expect(flow.send("BACK")).toBe("findings");
    expect(flow.send("NEXT", "BACK")).toBe("findings");
  });

  it("cannot skip onboarding by exiting before the first dashboard visit", () => {
    const flow = start(false);
    flow.send("NEXT", "NEXT", "NEXT", "NEXT");
    expect(flow.view()).toBe("safety");
    expect(flow.send("EXIT")).toBe("safety");
  });

  it("lets a returning astronaut save and exit, change mission, and go back to the dashboard", () => {
    const flow = start(true);
    expect(flow.send("START_CHECKIN", "NEXT", "EXIT")).toBe("dashboard");
    expect(flow.send("CHANGE_MISSION")).toBe("mission");
    expect(flow.send("BACK")).toBe("dashboard");
    expect(flow.send("START_CHECKIN", "BACK")).toBe("dashboard");
  });

  it("resumes an interrupted check-in at the saved step", () => {
    expect(start(false).send({ type: "RESUME", step: "questions" })).toBe("questions");
    expect(start(true).send({ type: "RESUME", step: "measure" })).toBe("measure");
  });

  it("opens the latest result pages from the dashboard", () => {
    const flow = start(true);
    expect(flow.send({ type: "VIEW_RESULT", step: "compass" })).toBe("compass");
    expect(flow.send("EXIT")).toBe("dashboard");
    expect(flow.send({ type: "VIEW_RESULT", step: "actions" }, "NEXT")).toBe("dashboard");
  });

  it("allows an urgent report from every step and returns to the same step", () => {
    for (let steps = 0; steps <= FLOW_STEPS.length; steps += 1) {
      const flow = start(false);
      for (let index = 0; index < steps; index += 1) flow.send("NEXT");
      const before = flow.view();
      expect(flow.send("REPORT_URGENT"), before).toBe("urgent");
      expect(flow.send("NEXT"), "navigation is paused while urgent guidance is shown").toBe("urgent");
      expect(flow.send("CLOSE_URGENT"), before).toBe(before);
    }
  });
});
