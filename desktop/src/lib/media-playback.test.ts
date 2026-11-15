import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type FakeVideo = HTMLVideoElement & { play: ReturnType<typeof vi.fn>; pause: ReturnType<typeof vi.fn> };
const fakeVideo = () => ({ play: vi.fn(() => Promise.resolve()), pause: vi.fn() }) as unknown as FakeVideo;

function setReducedMotion(reduced: boolean) {
  window.matchMedia = ((query: string) => ({ matches: reduced && query.includes("reduce"), media: query, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
}

describe("media playback coordinator", () => {
  const original = window.matchMedia;
  beforeEach(() => { vi.resetModules(); setReducedMotion(false); });
  afterEach(() => { window.matchMedia = original; });

  it("plays one foreground clip at a time", async () => {
    const { playForeground } = await import("@/lib/media-playback");
    const a = fakeVideo(), b = fakeVideo();
    expect(playForeground(a)).toBe(true);
    expect(playForeground(b)).toBe(true);
    expect(a.pause).toHaveBeenCalled();
    expect(b.play).toHaveBeenCalled();
  });

  it("pauses the ambient crown while a clip plays and resumes it afterwards", async () => {
    const { playForeground, registerAmbientVideo, releaseForeground } = await import("@/lib/media-playback");
    const crown = fakeVideo(), clip = fakeVideo();
    registerAmbientVideo(crown);
    expect(crown.play).toHaveBeenCalledTimes(1);
    playForeground(clip);
    expect(crown.pause).toHaveBeenCalled();
    releaseForeground(clip);
    expect(clip.pause).toHaveBeenCalled();
    expect(crown.play).toHaveBeenCalledTimes(2);
  });

  it("never autoplays under prefers-reduced-motion", async () => {
    setReducedMotion(true);
    const { playForeground, registerAmbientVideo } = await import("@/lib/media-playback");
    const crown = fakeVideo(), clip = fakeVideo();
    registerAmbientVideo(crown);
    expect(playForeground(clip)).toBe(false);
    expect(crown.play).not.toHaveBeenCalled();
    expect(clip.play).not.toHaveBeenCalled();
  });
});
