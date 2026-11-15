import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { AppConfig } from "@/types/backend";

const config: AppConfig = {
  missions: { leo: "Low Earth Orbit", lunar: "Lunar Mission", mars: "Mars / Deep Space" },
  symptoms: {}, condition_titles: {}, history_path: "/tmp/astrotip-test.sqlite3", disclaimer: "Educational prototype",
};

describe("HistoryPage", () => {
  it("shows a loading state instead of a false empty state while history loads", async () => {
    let resolve: (value: { entries: [] }) => void = () => undefined;
    vi.doMock("@/lib/api", () => ({ api: { listHistory: () => new Promise((r) => { resolve = r; }) } }));
    const { HistoryPage } = await import("@/components/pages/history-page");
    render(<HistoryPage config={config} active refreshKey={0} />);
    expect(screen.getByLabelText("Loading saved check-ins")).toHaveAttribute("aria-busy", "true");
    expect(screen.queryByText("No saved check-ins")).not.toBeInTheDocument();
    resolve({ entries: [] });
    expect(await screen.findByText("No saved check-ins")).toBeInTheDocument();
    vi.doUnmock("@/lib/api");
  });
});
