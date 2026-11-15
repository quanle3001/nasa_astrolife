import { useEffect, useState } from "react";
import type { AstronautPose } from "@/lib/transitions";

/** The off-canvas pose exists only long enough to complete a graceful exit. */
export type RenderedAstronautPose = AstronautPose | "hidden";
export const ASTRONAUT_EXIT_MS = 700;

/**
 * Keeps the shared astronaut model mounted through its exit gesture. A new
 * pose cancels the pending removal, while calm mode removes it immediately.
 */
export function useAstronautPresence(pose: AstronautPose | null, calm: boolean): RenderedAstronautPose | null {
  const [renderedPose, setRenderedPose] = useState<RenderedAstronautPose | null>(pose);
  useEffect(() => {
    if (pose) {
      setRenderedPose(pose);
      return undefined;
    }
    if (calm) {
      setRenderedPose(null);
      return undefined;
    }
    setRenderedPose((current) => current ? "hidden" : null);
    const timer = window.setTimeout(() => setRenderedPose(null), ASTRONAUT_EXIT_MS);
    return () => window.clearTimeout(timer);
  }, [pose, calm]);
  return renderedPose;
}
