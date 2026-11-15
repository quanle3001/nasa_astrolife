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
  getTrends: async () => unavailable(),
  getKnowledge: async () => unavailable(),
  getMission: async () => unavailable(),
  saveMission: async () => unavailable(),
  planMission: async () => unavailable(),
  currentSession: async () => unavailable(),
  startSession: async () => unavailable(),
  saveSession: async () => unavailable(),
  previewSession: async () => unavailable(),
  submitSession: async () => unavailable(),
  listActions: async () => unavailable(),
  updateAction: async () => unavailable(),
  getRadLab: async () => unavailable(),
  openNasaSource: async () => unavailable(),
  onBackendEvent: () => () => undefined,
};
