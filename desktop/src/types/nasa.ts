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

/** Statistics and irregularities computed by the backend for one instrument. */
export interface RadLabInstrumentAnalysis {
  count: number;
  mean: number; median: number; minimum: number; maximum: number;
  standard_deviation: number; percentile_95: number;
  maximum_at: string; first_timestamp: string; last_timestamp: string;
  /** Usual interval between readings, in minutes. */
  cadence_minutes: number | null;
  expected_count: number | null;
  coverage_percent: number | null;
  gap_count: number; longest_gap_minutes: number;
  gaps: { start: string; end: string; minutes: number }[];
  zero_count: number;
  excursion_threshold: number; excursion_count: number; excursion_episodes: number;
  excursions: { start: string; end: string; readings: number; peak: number; peak_at: string }[];
  /** Mean per hour of the window; null for an hour without readings. */
  hourly_mean: (number | null)[];
  hours_without_data: number[];
  highest_hour: number | null; lowest_hour: number | null;
  first_half_mean: number | null; second_half_mean: number | null;
  environment: MissionId | null;
  /** Plain statements of what the analysis found. */
  observations: string[];
}

export interface RadLabAnalysis {
  method: { gap_rule: string; excursion_rule: string; statistics: string; limits: string };
  instruments: Record<string, RadLabInstrumentAnalysis>;
  by_environment: Record<MissionId, string[]>;
  undescribed: string[];
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
  /** Descriptive analysis computed by the backend from the retrieved readings. */
  analysis: RadLabAnalysis | null;
  instrument_notes: RadLabInstrumentNotes;
}
