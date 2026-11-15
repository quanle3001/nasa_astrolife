import type { FlowView } from "@/flow/flow-machine";

/**
 * The only large spatial gesture in the guided flow: Home owns the hero pose,
 * and both setup pages share a smaller landmark pose before health content.
 */
export type AstronautPose = "hero" | "side";

export function astronautPoseForView(view: FlowView): AstronautPose | null {
  if (view === "welcome") return "hero";
  if (view === "mission" || view === "context") return "side";
  return null;
}

/**
 * Shared screen transition for every top-level view. The exit is intentionally
 * shorter than the entrance so synchronized screens overlap without a blank
 * frame. Calm mode swaps immediately, avoiding both spatial travel and a
 * double-exposed crossfade; urgent or task-critical content never waits here.
 */
export function screenMotion(reduced: boolean) {
  if (reduced) {
    return {
      initial: false as const,
      animate: { opacity: 1 },
      exit: undefined,
      transition: { duration: 0 },
    };
  }
  return {
    initial: { opacity: 0, y: 14, scale: 0.995 },
    animate: { opacity: 1, y: 0, scale: 1 },
    exit: {
      opacity: 0, y: -6, scale: 0.998,
      transition: { duration: 0.16, ease: [0.4, 0, 1, 1] as const },
    },
    transition: { duration: 0.34, ease: [0.16, 1, 0.3, 1] as const },
  };
}
