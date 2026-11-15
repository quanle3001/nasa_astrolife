import { useEffect, useState } from "react";

/**
 * Display-only freshness for live telemetry. The Python backend alone decides
 * whether a reading is usable; this only tells the user how old the newest
 * value on screen is, so a frozen number is never mistaken for a live one.
 */
export const STALE_AFTER_MS = 10_000;

/** Current time, re-rendered every second while `active`. */
export function useNow(active: boolean, intervalMs = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(timer);
  }, [active, intervalMs]);
  return now;
}

export function isStale(at: number | null | undefined, now: number) {
  return at != null && now - at > STALE_AFTER_MS;
}

export function formatClock(at: number) {
  return new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(at);
}

export function formatAge(at: number, now: number) {
  const seconds = Math.max(0, Math.round((now - at) / 1000));
  return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}
