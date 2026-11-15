import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ASTRONAUT_EXIT_MS, useAstronautPresence } from "@/lib/astronaut-presence";
import type { AstronautPose } from "@/lib/transitions";

afterEach(() => {
  vi.useRealTimers();
});

describe("useAstronautPresence", () => {
  it("holds the hidden pose until the exit gesture finishes", () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(
      ({ pose, calm }: { pose: AstronautPose | null; calm: boolean }) => useAstronautPresence(pose, calm),
      { initialProps: { pose: "hero", calm: false } },
    );

    rerender({ pose: null, calm: false });
    expect(result.current).toBe("hidden");
    act(() => vi.advanceTimersByTime(ASTRONAUT_EXIT_MS));
    expect(result.current).toBeNull();
  });

  it("cancels a pending exit when navigation returns to a setup page", () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(
      ({ pose, calm }: { pose: AstronautPose | null; calm: boolean }) => useAstronautPresence(pose, calm),
      { initialProps: { pose: "side", calm: false } },
    );

    rerender({ pose: null, calm: false });
    expect(result.current).toBe("hidden");
    rerender({ pose: "side", calm: false });
    act(() => vi.advanceTimersByTime(ASTRONAUT_EXIT_MS));
    expect(result.current).toBe("side");
  });

  it("removes the astronaut immediately in calm mode", () => {
    const { result, rerender } = renderHook(
      ({ pose, calm }: { pose: AstronautPose | null; calm: boolean }) => useAstronautPresence(pose, calm),
      { initialProps: { pose: "hero", calm: true } },
    );

    rerender({ pose: null, calm: true });
    expect(result.current).toBeNull();
  });
});
