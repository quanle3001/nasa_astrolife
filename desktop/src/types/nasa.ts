import type { MissionId } from "@/types/backend";

/** One instrument's readings, with timestamps exactly as published by RadLab. */
export interface RadLabSeries { timestamps: string[]; values: number[] }

/**
 * A bounded dataset from the NASA OSDR RadLab data API together with its
 * provenance. These are historical instrument readings. They are never the
 * astronaut's own exposure or live telemetry.
 */
export interface RadLabDataset {
  provider: string;
  api_url: string;
  documentation_url: string;
  request_url: string;
  measurement: string;
  /** Unit as documented by RadLab, or null when it could not be verified. */
  unit: string | null;
  unit_note: string;
  window_start: string;
  window_end: string;
  timestamp_note: string;
  /** When the data was retrieved from NASA (ISO 8601, UTC). */
  retrieved_at: string;
  response_sha256: string;
  data_sha256: string;
  row_count: number;
  limitations: string[];
  instruments: Record<string, RadLabSeries>;
}

export interface RadLabSummary { count: number; minimum: number; maximum: number; median: number; first_timestamp: string; last_timestamp: string }

export interface RadLabInstrumentNotes {
  note: string;
  instruments: Record<string, { environment: MissionId; label: string; description: string }>;
  preferred: Record<MissionId, string>;
}

/** Where the shown dataset came from. "none" means nothing verified is available. */
export type RadLabOrigin = "live" | "retrieved_on_this_computer" | "bundled_snapshot" | "none";

export interface RadLabResult {
  available: boolean;
  origin: RadLabOrigin;
  /** Why the latest retrieval failed, when the cache is being shown instead. */
  error: string | null;
  dataset: RadLabDataset | null;
  summary: Record<string, RadLabSummary>;
  instrument_notes: RadLabInstrumentNotes;
}
