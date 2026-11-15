import { Cable, LoaderCircle, RefreshCw } from "lucide-react";
import { useEffect, useRef, useState, type Ref } from "react";
import { BorderBeam } from "@/components/effects/border-beam";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { SensorViewState } from "@/components/monitor/sensor-state";

/** Drop OS error codes such as "[Errno 2]" from what the crew reads; the full text stays in the tooltip. */
const plainError = (message: string) => message.replace(/\[Errno \d+\]\s*/g, "").replace(/\s{2,}/g, " ").trim();

/** Serial port picker and link control for the ESP32 + MAX30102. */
const USB_SERIAL = /usb|slab|wch|uart|cp210|ch34/i;

export function SensorDock({ state, onConnectStart, inputRef, autoConnect }: {
  state: SensorViewState; onConnectStart: (port: string) => void; inputRef?: Ref<HTMLInputElement>;
  /** Open the link without a click when a USB serial adapter is found (measurement step). */
  autoConnect?: boolean;
}) {
  const [ports, setPorts] = useState<{ device: string; description: string }[]>([]);
  const [port, setPort] = useState("");
  const [error, setError] = useState("");
  const chosen = useRef(false);

  const refresh = async () => {
    try {
      setError("");
      const found = await api.listPorts();
      setPorts(found);
      // Prefer a USB serial adapter over built-in ports when nothing was chosen yet.
      const usb = found.find((item) => USB_SERIAL.test(`${item.device} ${item.description}`));
      if (!chosen.current) setPort((usb ?? found[0])?.device ?? "");
      return usb?.device ?? null;
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); return null; }
  };
  useEffect(() => {
    let alive = true;
    void refresh().then(async (usbPort) => {
      // Only a port that looks like the ESP32's USB adapter is opened unasked.
      if (!alive || !autoConnect || !usbPort || state.connected || state.connecting) return;
      try { onConnectStart(usbPort); await api.connectSensor(usbPort); } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    });
    return () => { alive = false; };
  }, []);

  const toggle = async () => {
    try {
      setError("");
      if (state.connected || state.connecting) await api.disconnectSensor();
      else if (port.trim()) { onConnectStart(port.trim()); await api.connectSensor(port.trim()); }
      else setError("Select or enter the ESP32 serial port first.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
  };

  return (
    <Card className="sensor-command-dock">
      {state.usable && <BorderBeam duration={7} />}
      <div className="command-dock-title"><Cable className="size-4" /><span><h2>ESP32 UPLINK</h2><small>MAX30102 · 115200 BAUD</small></span></div>
      <div className="command-dock-control">
        <input ref={inputRef} list="serial-ports" value={port} onChange={(event) => { chosen.current = true; setPort(event.target.value); }} disabled={state.connected || state.connecting} className="control" aria-label="ESP32 serial port" placeholder="Select or enter a serial port" />
        <datalist id="serial-ports">{ports.map((item) => <option key={item.device} value={item.device}>{item.description}</option>)}</datalist>
        <Button onClick={refresh} disabled={state.connected || state.connecting} size="icon" aria-label="Refresh serial ports"><RefreshCw className="size-4" /></Button>
        <Button variant="primary" onClick={toggle} className="min-w-28" aria-busy={state.connecting || undefined}>{state.connecting ? <><LoaderCircle className="size-4 animate-spin" /> Cancel</> : state.connected ? "Disconnect" : "Initiate link"}</Button>
      </div>
      {error || state.fault ? (
        <div className="command-dock-state is-fault" role="alert" title={error || state.fault || undefined}>
          <span className="live-pulse is-fault" />
          <span><b>{error ? "Can't start the link." : "Couldn't connect to the sensor."}</b> {plainError(error || state.fault || "")}</span>
        </div>
      ) : (
        <div className="command-dock-state" role="status"><span className={cn("live-pulse", state.connected && "is-live", state.connecting && "is-connecting")} />{state.status}</div>
      )}
    </Card>
  );
}
