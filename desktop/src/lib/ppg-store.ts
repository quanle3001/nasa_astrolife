import { api } from "@/lib/api";
import { PpgBuffer } from "@/lib/ppg-buffer";

/**
 * The one live optical buffer shared by every chart in the app.
 *
 * Batches are written here directly from the IPC listener and read by the
 * chart on its own redraw timer. They deliberately do not pass through React
 * state: 25 samples per second must not re-render the component tree.
 */
export const ppgBuffer = new PpgBuffer();

let unsubscribe: (() => void) | null = null;

/** Start receiving batches; safe to call more than once. Returns a stop function. */
export function startPpgStream(): () => void {
  if (!unsubscribe) unsubscribe = api.onPpgBatch((batch) => ppgBuffer.push(batch));
  return () => {
    unsubscribe?.();
    unsubscribe = null;
  };
}
