export type MissionId = "leo" | "lunar" | "mars";
export type PriorityLevel = "urgent" | "review" | "watch" | "info";

export interface CheckIn {
  mission: MissionId;
  heart_rate: number | null;
  spo2: number | null;
  signal_quality: "unknown" | "good" | "poor";
  sleep_hours: number | null;
  symptoms: string[];
  exercise_completed: boolean | null;
  notes: string;
  input_source?: "manual" | "sensor";
  sensor_port?: string;
  sensor_received_at?: string;
}

export interface Finding {
  condition_id: string;
  level: PriorityLevel;
  reason: string;
  actions: string[];
  source_ids: string[];
}

export interface Assessment {
  level: PriorityLevel;
  summary: string;
  findings: Finding[];
  data_notes: string[];
  created_at: string;
  catalog_reviewed_on: string;
}

export interface AssessmentBundle {
  assessment_id: string;
  checkin: CheckIn;
  assessment: Assessment;
}

export interface HistoryEntry {
  id: number;
  created_at: string;
  checkin: CheckIn;
  assessment: Assessment;
}

export interface AppConfig {
  missions: Record<MissionId, string>;
  symptoms: Record<string, string>;
  condition_titles: Record<string, string>;
  history_path: string;
  disclaimer: string;
}

export interface SerialPort { device: string; description: string }

export interface BackendEvent {
  event: "backend.ready" | "backend.stopped" | "sensor.connection" | "sensor.status" | "sensor.reading";
  payload: Record<string, unknown> & Partial<AssessmentBundle>;
}

export interface AstroLifeDesktopApi {
  ping: () => Promise<{ service: string; protocol: number; offline: boolean }>;
  getConfig: () => Promise<AppConfig>;
  listPorts: () => Promise<SerialPort[]>;
  connectSensor: (port: string) => Promise<{ state: string; port: string }>;
  disconnectSensor: () => Promise<{ state: string }>;
  assess: (checkin: CheckIn) => Promise<AssessmentBundle>;
  saveAssessment: (assessmentId: string) => Promise<{ saved: boolean; entry_id: number }>;
  listHistory: () => Promise<{ entries: HistoryEntry[] }>;
  openNasaSource: (url: string) => Promise<boolean>;
  onBackendEvent: (callback: (event: BackendEvent) => void) => () => void;
}

declare global {
  interface Window { astrotip?: AstroLifeDesktopApi }
}
