import type { AstroTipDesktopApi } from "@/types/backend";

function unavailable(): never {
  throw new Error("The native AstroTip backend is unavailable. Launch the app through Electron.");
}

export const api: AstroTipDesktopApi = window.astrotip ?? {
  ping: async () => unavailable(),
  getConfig: async () => unavailable(),
  listPorts: async () => unavailable(),
  connectSensor: async () => unavailable(),
  disconnectSensor: async () => unavailable(),
  assess: async () => unavailable(),
  saveAssessment: async () => unavailable(),
  listHistory: async () => unavailable(),
  openNasaSource: async () => unavailable(),
  onBackendEvent: () => () => undefined,
};
