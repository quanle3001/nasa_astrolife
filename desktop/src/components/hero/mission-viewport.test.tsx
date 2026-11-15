import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MissionViewport } from "@/components/hero/mission-viewport";

const idle = { connected: false, connecting: false, heartRate: null, spo2: null };

describe("MissionViewport", () => {
  it("shows the selected mission's NASA image with provenance", () => {
    render(<MissionViewport mission="mars" telemetry={idle} />);
    expect(screen.getByRole("img", { name: /Mars \/ Deep Space/ })).toBeInTheDocument();
    expect(screen.getAllByText("PIA24264").length).toBeGreaterThan(0);
  });

  it("states missing readings plainly instead of inventing values", () => {
    render(<MissionViewport mission="leo" telemetry={idle} />);
    expect(screen.getAllByText("No reading")).toHaveLength(2);
    expect(screen.getByText("Estimated SpO₂")).toBeInTheDocument();
    expect(screen.getByText("Standby")).toBeInTheDocument();
  });

  it("shows device values only when the sensor provides them", () => {
    render(<MissionViewport mission="leo" telemetry={{ connected: true, connecting: false, heartRate: 72, spo2: 97 }} />);
    expect(screen.getByText("72")).toBeInTheDocument();
    expect(screen.getByText("97")).toBeInTheDocument();
    expect(screen.queryByText("No reading")).not.toBeInTheDocument();
    expect(screen.getByText("Online")).toBeInTheDocument();
  });
});
