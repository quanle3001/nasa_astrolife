import { render, screen, within } from "@testing-library/react";
import type { SensorViewState } from "@/components/pages/sensor-page";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", () => ({ api: { listPorts: () => Promise.resolve([]), connectSensor: vi.fn(), disconnectSensor: vi.fn() } }));
vi.mock("@/components/monitor/ppg-chart", () => ({ PpgChart: () => <div data-testid="ppg-chart" /> }));
const { SensorPage } = await import("@/components/pages/sensor-page");

const base: Omit<SensorViewState, "fault"> = {
  connected: false, connecting: false, status: "Disconnected", usable: false, heartRate: null, spo2: null, bundle: null, lastUpdate: null, lastUsableAt: null,
  source: null, signalStatus: null, sampleRateHz: null, firmware: null, readingState: null, opticalState: null, measuredAt: null,
};

describe("SensorPage", () => {
  it("keeps a failed connection's reason visible as an alert, without OS error codes", () => {
    const fault = "Connection unavailable: [Errno 2] could not open port /dev/x: [Errno 2] No such file or directory. Close other serial monitors and check the cable / COM port.";
    render(<SensorPage state={{ ...base, fault }} onReview={() => undefined} onConnectStart={() => undefined} />);
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Couldn't connect to the sensor.");
    expect(alert).toHaveTextContent("check the cable / COM port");
    expect(alert).not.toHaveTextContent("[Errno");
  });

  it("shows a cancellable linking state", () => {
    render(<SensorPage state={{ ...base, connecting: true, fault: null, status: "Opening /dev/x…" }} onReview={() => undefined} onConnectStart={() => undefined} />);
    expect(screen.getByRole("button", { name: /Cancel/ })).toHaveAttribute("aria-busy", "true");
    expect(screen.getByText("Opening /dev/x…")).toBeInTheDocument();
  });
});

describe("SensorPage live monitor", () => {
  it("names unavailable estimates as no reading and explains they are not normal results", () => {
    render(<SensorPage state={{ ...base, fault: null }} onReview={() => undefined} onConnectStart={() => undefined} />);
    const monitor = screen.getByTestId("live-monitor");
    expect(within(monitor).getByLabelText("Latest sensor estimates")).toHaveTextContent("No reading");
    expect(monitor).toHaveTextContent("It is not a normal result");
    expect(within(monitor).getByRole("button", { name: /Run simulated stream/ })).toBeInTheDocument();
  });

  it("shows estimates with their source, firmware and timestamp when the sensor reports them", () => {
    render(<SensorPage state={{ ...base, fault: null, connected: true, usable: true, heartRate: 72, spo2: 98, source: "sensor", firmware: "astro-life-ppg-2", sampleRateHz: 25, signalStatus: "ready", opticalState: "ready", readingState: "steady", measuredAt: "2026-11-15T08:00:00+00:00" }} onReview={() => undefined} onConnectStart={() => undefined} />);
    const monitor = screen.getByTestId("live-monitor");
    expect(monitor).toHaveTextContent("72");
    expect(monitor).toHaveTextContent("98");
    expect(monitor).toHaveTextContent("ESP32 + MAX30102");
    expect(monitor).toHaveTextContent("astro-life-ppg-2");
    expect(monitor).toHaveTextContent("Recent reports agree");
    expect(within(monitor).queryByRole("button", { name: /Run simulated stream/ })).not.toBeInTheDocument();
  });
});
