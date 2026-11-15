import { MotionConfig, useReducedMotion } from "motion/react";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

/**
 * In-app "Pause motion" control (WCAG 2.2.2 Pause, Stop, Hide).
 *
 * The black-hole video, starfield and decorative loops run indefinitely, so a
 * user must be able to stop them without changing an OS setting. Pausing sets
 * `data-motion="paused"` on <html> (CSS mirrors the reduced-motion rules),
 * switches Motion to reduced mode, and stops video through media-playback.
 * The OS `prefers-reduced-motion` setting is always honored as well.
 */
const STORAGE_KEY = "astrotip.motion";

interface MotionPreference {
  /** True when the user paused motion in the app. */
  paused: boolean;
  setPaused: (paused: boolean) => void;
}

const MotionPreferenceContext = createContext<MotionPreference>({ paused: false, setPaused: () => undefined });

function readStored(): boolean {
  try { return window.localStorage.getItem(STORAGE_KEY) === "paused"; } catch { return false; }
}

export function applyMotionAttribute(paused: boolean) {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.motion = paused ? "paused" : "auto";
  document.dispatchEvent(new CustomEvent("astrotip:motion-change"));
}

export function MotionPreferenceProvider({ children }: { children: ReactNode }) {
  const [paused, setPausedState] = useState(readStored);
  useEffect(() => { applyMotionAttribute(paused); }, [paused]);
  const setPaused = useCallback((next: boolean) => {
    setPausedState(next);
    try { window.localStorage.setItem(STORAGE_KEY, next ? "paused" : "auto"); } catch { /* storage unavailable: keep in memory */ }
  }, []);
  const value = useMemo(() => ({ paused, setPaused }), [paused, setPaused]);
  return (
    <MotionPreferenceContext.Provider value={value}>
      <MotionConfig reducedMotion={paused ? "always" : "user"}>{children}</MotionConfig>
    </MotionPreferenceContext.Provider>
  );
}

export function useMotionPreference() {
  return useContext(MotionPreferenceContext);
}

/** True when decorative motion must stop: OS reduced-motion or the in-app pause. */
export function useCalmMotion(): boolean {
  const system = Boolean(useReducedMotion());
  return system || useContext(MotionPreferenceContext).paused;
}
