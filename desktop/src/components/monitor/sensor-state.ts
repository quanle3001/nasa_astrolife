import type { AssessmentBundle, MeasurementSource } from "@/types/backend";

/** Everything the UI knows about the sensor link and its newest report. */
export interface SensorViewState {
  connected: boolean;
  connecting: boolean;
  status: string;
  usable: boolean;
  heartRate: number | null;
  spo2: number | null;
  bundle: AssessmentBundle | null;
  /** Client time of the newest sensor message (usable or not). */
  lastUpdate: number | null;
  /** Client time of the newest usable reading. */
  lastUsableAt: number | null;
  /** Why the last connection attempt failed (backend message), kept until the next attempt. */
  fault: string | null;
  /** "sensor" for the ESP32, "simulated" for the labelled demo stream. */
  source: MeasurementSource | null;
  /** Firmware window status, e.g. ready / collecting / no_contact (null on older firmware). */
  signalStatus: string | null;
  sampleRateHz: number | null;
  firmware: string | null;
  /** Agreement of recent reports: waiting / collecting / steady / changing / settling. */
  readingState: string | null;
  /** Result of the raw optical window check; not a clinical quality score. */
  opticalState: string | null;
  /** Backend receive time (ISO 8601, UTC) of the newest complete report. */
  measuredAt: string | null;
}

export const INITIAL_SENSOR: SensorViewState = {
  connected: false, connecting: false, status: "Disconnected", usable: false,
  heartRate: null, spo2: null, bundle: null, lastUpdate: null, lastUsableAt: null, fault: null,
  source: null, signalStatus: null, sampleRateHz: null, firmware: null, readingState: null, opticalState: null, measuredAt: null,
};

/** Plain words for the engineering checks; none of these establish clinical accuracy. */
export const READING_STATE_TEXT: Record<string, string> = {
  waiting: "Waiting for a usable report",
  collecting: "Collecting agreeing reports",
  settling: "Optical window still settling",
  changing: "Recent reports disagree · hold still",
  steady: "Recent reports agree",
};
