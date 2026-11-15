import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
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
