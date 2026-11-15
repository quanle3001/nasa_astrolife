import { render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const listPorts = vi.fn();
const connectSensor = vi.fn((_port: string) => Promise.resolve({ state: "connecting", port: "x" }));
vi.mock("@/lib/api", () => ({ api: { listPorts: () => listPorts(), connectSensor: (port: string) => connectSensor(port), disconnectSensor: vi.fn() } }));
const { SensorDock } = await import("@/components/monitor/sensor-dock");
const { INITIAL_SENSOR } = await import("@/components/monitor/sensor-state");

describe("SensorDock auto-connect", () => {
  beforeEach(() => { listPorts.mockReset(); connectSensor.mockClear(); });

  it("opens the ESP32's USB serial port without a click on the measurement step", async () => {
    listPorts.mockResolvedValue([{ device: "/dev/cu.Bluetooth-Incoming-Port", description: "n/a" }, { device: "/dev/cu.usbserial-0001", description: "CP2102 USB to UART Bridge" }]);
    const onConnectStart = vi.fn();
    render(<SensorDock state={INITIAL_SENSOR} onConnectStart={onConnectStart} autoConnect />);
    await waitFor(() => expect(connectSensor).toHaveBeenCalledWith("/dev/cu.usbserial-0001"));
    expect(onConnectStart).toHaveBeenCalledWith("/dev/cu.usbserial-0001");
  });

  it("never opens a port that does not look like the sensor, or when auto-connect is off", async () => {
    listPorts.mockResolvedValue([{ device: "/dev/cu.Bluetooth-Incoming-Port", description: "n/a" }]);
    const { unmount } = render(<SensorDock state={INITIAL_SENSOR} onConnectStart={() => undefined} autoConnect />);
    await waitFor(() => expect(listPorts).toHaveBeenCalled());
    unmount();
    listPorts.mockResolvedValue([{ device: "/dev/cu.usbserial-0001", description: "CP2102" }]);
    render(<SensorDock state={INITIAL_SENSOR} onConnectStart={() => undefined} />);
    await waitFor(() => expect(listPorts).toHaveBeenCalledTimes(2));
    expect(connectSensor).not.toHaveBeenCalled();
  });

  it("does not open a second link while one is active", async () => {
    listPorts.mockResolvedValue([{ device: "/dev/cu.usbserial-0001", description: "CP2102" }]);
    render(<SensorDock state={{ ...INITIAL_SENSOR, connected: true }} onConnectStart={() => undefined} autoConnect />);
    await waitFor(() => expect(listPorts).toHaveBeenCalled());
    expect(connectSensor).not.toHaveBeenCalled();
  });
});
