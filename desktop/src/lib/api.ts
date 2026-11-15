import type { AstroLifeDesktopApi } from "@/types/backend";

function unavailable(): never {
  throw new Error("The native AstroLife backend is unavailable. Launch the app through Electron.");
}

export const api: AstroLifeDesktopApi = window.astrotip ?? {
  ping: async () => unavailable(),
  getConfig: async () => unavailable(),
  listPorts: async () => unavailable(),
  connectSensor: async () => unavailable(),
  disconnectSensor: async () => unavailable(),
  simulateSensor: async () => unavailable(),
  onPpgBatch: () => () => undefined,
  assess: async () => unavailable(),
  saveAssessment: async () => unavailable(),
  listHistory: async () => unavailable(),
  openNasaSource: async () => unavailable(),
  onBackendEvent: () => () => undefined,
};
