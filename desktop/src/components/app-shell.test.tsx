import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AppShell } from "@/components/app-shell";

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
});
