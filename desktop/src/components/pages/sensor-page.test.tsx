import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", () => ({ api: { listPorts: () => Promise.resolve([]), connectSensor: vi.fn(), disconnectSensor: vi.fn() } }));
const { SensorPage } = await import("@/components/pages/sensor-page");

const base = { connected: false, connecting: false, status: "Disconnected", usable: false, heartRate: null, spo2: null, bundle: null, lastUpdate: null, lastUsableAt: null };

describe("SensorPage", () => {
  it("keeps a failed connection's reason visible as an alert, without OS error codes", () => {
    const fault = "Connection unavailable: [Errno 2] could not open port /dev/x: [Errno 2] No such file or directory. Close other serial monitors and check the cable / COM port.";
    render(<SensorPage state={{ ...base, fault }} mission="leo" onReview={() => undefined} onCheckin={() => undefined} onConnectStart={() => undefined} />);
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Couldn't connect to the sensor.");
    expect(alert).toHaveTextContent("check the cable / COM port");
    expect(alert).not.toHaveTextContent("[Errno");
    expect(screen.getByText("Connection failed")).toBeInTheDocument();
  });

  it("shows a cancellable linking state", () => {
    render(<SensorPage state={{ ...base, connecting: true, fault: null, status: "Opening /dev/x…" }} mission="leo" onReview={() => undefined} onCheckin={() => undefined} onConnectStart={() => undefined} />);
    expect(screen.getByRole("button", { name: /Cancel/ })).toHaveAttribute("aria-busy", "true");
    expect(screen.getByText("Opening /dev/x…")).toBeInTheDocument();
  });
});
