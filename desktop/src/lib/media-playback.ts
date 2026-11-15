import { useEffect, useState, type RefObject } from "react";

/**
 * Process-wide video coordination for the renderer.
 *
 * - At most one foreground clip (mission previews) plays at a time.
 * - Ambient loops (the black-hole crown) pause while a foreground clip plays
 *   and when the window is hidden, then resume.
 * - Nothing autoplays under prefers-reduced-motion.
 */
const ambient = new Set<HTMLVideoElement>();
let foreground: HTMLVideoElement | null = null;

const reducedMotion = () =>
  (typeof window !== "undefined" && Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches))
  || (typeof document !== "undefined" && document.documentElement.dataset.motion === "paused");
const documentHidden = () => typeof document !== "undefined" && document.visibilityState === "hidden";

function safePlay(video: HTMLVideoElement) {
  try {
    const result = video.play();
    if (result && typeof result.catch === "function") result.catch(() => undefined);
  } catch { /* jsdom / unsupported media: keep the poster */ }
}

function syncAmbient() {
  const allowed = !foreground && !documentHidden() && !reducedMotion();
  for (const video of ambient) {
    if (allowed) safePlay(video);
    else video.pause();
  }
}

if (typeof document !== "undefined") {
  // In-app "Pause motion" toggled (see motion-preference.tsx).
  document.addEventListener("astrotip:motion-change", () => {
    if (reducedMotion() && foreground) { foreground.pause(); foreground = null; }
    syncAmbient();
  });
  document.addEventListener("visibilitychange", () => {
    if (documentHidden() && foreground) { foreground.pause(); foreground = null; }
    syncAmbient();
  });
}

export function registerAmbientVideo(video: HTMLVideoElement) {
  ambient.add(video);
  syncAmbient();
  return () => { ambient.delete(video); video.pause(); };
}

export function playForeground(video: HTMLVideoElement) {
  if (reducedMotion() || documentHidden()) return false;
  if (foreground && foreground !== video) foreground.pause();
  foreground = video;
  syncAmbient();
  safePlay(video);
  return true;
}

export function releaseForeground(video: HTMLVideoElement) {
  video.pause();
  if (foreground === video) { foreground = null; syncAmbient(); }
}

/** Ambient background loop: registers with the coordinator; never plays when reduced motion is set. */
export function useAmbientVideo(ref: RefObject<HTMLVideoElement | null>, mounted = true) {
  useEffect(() => {
    const video = ref.current;
    if (!video || !mounted) return;
    return registerAmbientVideo(video);
  }, [ref, mounted]);
}

/**
 * Foreground preview clip. Plays only while `active` (hover/focus), visible on
 * screen and allowed; reports `failed` so callers keep the poster image.
 */
export function usePreviewVideo(ref: RefObject<HTMLVideoElement | null>, active: boolean, segment: [number, number] | null = null) {
  const [failed, setFailed] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const video = ref.current;
    if (!video || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => setVisible(Boolean(entry?.isIntersecting)), { threshold: 0.25 });
    observer.observe(video);
    return () => observer.disconnect();
  }, [ref]);

  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    const start = segment?.[0] ?? 0;
    const end = segment?.[1] ?? Number.POSITIVE_INFINITY;
    const onPlaying = () => setPlaying(true);
    const onTime = () => { if (segment && (video.currentTime < start || video.currentTime >= end)) video.currentTime = start; };
    const onStop = () => setPlaying(false);
    const onError = () => { setFailed(true); setPlaying(false); };
    video.addEventListener("playing", onPlaying);
    video.addEventListener("timeupdate", onTime);
    video.addEventListener("pause", onStop);
    video.addEventListener("ended", onStop);
    video.addEventListener("error", onError);
    return () => {
      video.removeEventListener("playing", onPlaying);
      video.removeEventListener("timeupdate", onTime);
      video.removeEventListener("pause", onStop);
      video.removeEventListener("ended", onStop);
      video.removeEventListener("error", onError);
      releaseForeground(video);
    };
  }, [ref, segment]);

  useEffect(() => {
    const video = ref.current;
    if (!video || failed) return;
    if (active && visible) playForeground(video);
    else releaseForeground(video);
  }, [ref, active, visible, failed]);

  return { failed, playing };
}
