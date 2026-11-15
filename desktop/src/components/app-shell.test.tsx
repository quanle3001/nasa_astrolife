import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AppShell } from "@/components/app-shell";
import { MotionPreferenceProvider } from "@/lib/motion-preference";

describe("AppShell", () => {
  it("renders the medical disclaimer once, in the footer", () => {
    const disclaimer = "Educational prototype · Not a diagnosis or flight-certified medical device.";
    render(<AppShell page="sensor" setPage={() => undefined} mission="leo" connected={false} backendReady disclaimer={disclaimer}><p>content</p></AppShell>);
    const matches = screen.getAllByText(disclaimer);
    expect(matches).toHaveLength(1);
    expect(matches[0].closest("footer")).not.toBeNull();
  });

  it("announces backend and sensor state as text", () => {
    render(<AppShell page="sensor" setPage={() => undefined} mission="leo" connected={false} backendReady={false} disclaimer="x"><p /></AppShell>);
    expect(screen.getByLabelText("Local Python backend offline")).toHaveAttribute("role", "status");
    expect(screen.getByLabelText("No sensor connected")).toBeInTheDocument();
  });

  it("shows five dashboard tabs and no stepper outside the guided flow", () => {
    const setPage = vi.fn();
    render(<AppShell page="dashboard" setPage={setPage} mission="leo" connected={false} backendReady disclaimer="x"><p /></AppShell>);
    const nav = screen.getByRole("navigation", { name: "Primary navigation" });
    expect(Array.from(nav.querySelectorAll("button")).map((button) => button.textContent)).toEqual(["Dashboard", "Monitor", "Compass", "NASA data", "History"]);
    fireEvent.click(screen.getByRole("button", { name: /Monitor/ }));
    expect(setPage).toHaveBeenCalledWith("sensor");
  });

  it("replaces the tabs with the step position during the guided flow", () => {
    render(<AppShell page="dashboard" setPage={() => undefined} mission="mars" connected={false} backendReady disclaimer="x" flow={{ index: 3, total: 9, label: "Safety screen" }}><p /></AppShell>);
    expect(screen.queryByRole("navigation", { name: "Primary navigation" })).not.toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Guided check-in, step 4 of 9: Safety screen" })).toBeInTheDocument();
  });

  it("keeps the health-concern report reachable from the header", () => {
    const report = vi.fn();
    render(<AppShell page="dashboard" setPage={() => undefined} mission="leo" connected={false} backendReady disclaimer="x" onReportConcern={report} flow={{ index: 0, total: 9, label: "Choose mission" }}><p /></AppShell>);
    fireEvent.click(screen.getByRole("button", { name: /Report concern/ }));
    expect(report).toHaveBeenCalledOnce();
  });

  it("lets the user pause background motion and remembers it", () => {
    render(<MotionPreferenceProvider><AppShell page="sensor" setPage={() => undefined} mission="leo" connected={false} backendReady disclaimer="x"><p /></AppShell></MotionPreferenceProvider>);
    const toggle = screen.getByRole("button", { name: "Pause background motion" });
    expect(toggle).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(toggle);
    expect(screen.getByRole("button", { name: "Resume background motion" })).toHaveAttribute("aria-pressed", "true");
    expect(document.documentElement.dataset.motion).toBe("paused");
    expect(window.localStorage.getItem("astrotip.motion")).toBe("paused");
    fireEvent.click(screen.getByRole("button", { name: "Resume background motion" }));
    expect(document.documentElement.dataset.motion).toBe("auto");
  });
});
