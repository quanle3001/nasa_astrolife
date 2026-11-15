import { describe, expect, it } from "vitest";
import { astronautPoseForView, screenMotion } from "@/lib/transitions";

describe("astronautPoseForView", () => {
  it("keeps the astronaut through the welcome and both mission setup pages", () => {
    expect(astronautPoseForView("welcome")).toBe("hero");
    expect(astronautPoseForView("mission")).toBe("side");
    expect(astronautPoseForView("context")).toBe("side");
  });

  it("removes the decorative astronaut before health content begins", () => {
    expect(astronautPoseForView("hazards")).toBeNull();
    expect(astronautPoseForView("dashboard")).toBeNull();
  });
});

describe("screenMotion", () => {
  it("uses depth and a short overlapping exit for ordinary motion", () => {
    const motion = screenMotion(false);
    expect(motion.initial).toMatchObject({ opacity: 0, y: 14, scale: 0.995 });
    expect(motion.exit).toBeDefined();
    if (!motion.exit) throw new Error("normal motion requires an exit transition");
    expect(motion.exit.transition.duration).toBeLessThan(motion.transition.duration);
  });

  it("switches immediately with no spatial travel when motion is reduced", () => {
    const motion = screenMotion(true);
    expect(motion.initial).toBe(false);
    expect(motion.animate).toEqual({ opacity: 1 });
    expect(motion.exit).toBeUndefined();
    expect(motion.transition.duration).toBe(0);
  });
});
