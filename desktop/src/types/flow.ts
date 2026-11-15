import type { Assessment, CheckIn, MissionId, PriorityLevel } from "@/types/backend";

/** NASA's five hazards of human spaceflight. */
export type HazardId = "radiation" | "isolation" | "distance" | "gravity" | "environment";

/**
 * Mission context chosen by the astronaut. It decides what is explained and
 * asked first. It is never sent to the assessment rules.
 */
export interface MissionProfile {
  environment: MissionId;
  phase: string;
  mission_day: number | null;
  eva_recent: boolean;
  gravity_transition_recent: boolean;
}

export interface Source { id: string; title: string; url: string }

export interface CatalogCondition {
  id: string;
  title: string;
  why_it_matters: string;
  priority_rationale: string;
  monitoring: string;
  limitations: string;
  hazard_ids: HazardId[];
  countermeasures: { text: string; evidence: string; source_ids: string[] }[];
  research: { text: string; source_ids: string[] }[];
  source_ids: string[];
}

export interface Catalog {
  reviewed_on: string;
  scope: string;
  priority_note: string;
  sources: Source[];
  hazards: { id: HazardId; title: string }[];
  conditions: CatalogCondition[];
}

export interface HazardDetail {
  summary: string;
  why_it_matters: string;
  observations: string[];
  limits: string;
  source_ids: string[];
}

export interface MissionContext {
  reviewed_on: string;
  note: string;
  phases: { id: string; title: string }[];
  hazards: Record<HazardId, HazardDetail>;
  missions: Record<MissionId, {
    title: string;
    phases: string[];
    hazard_order: HazardId[];
    emphasis: Partial<Record<HazardId, { rationale: string; source_ids: string[] }>>;
  }>;
}

/** An answer is an option value, a number, or the special values "unsure" / "skipped". */
export type AnswerValue = string | number;
export type Answers = Record<string, AnswerValue>;

/** Declarative display condition; see software/astrotip/questionnaire/registry.py. */
export type Condition =
  | { answer: { question: string; in: AnswerValue[] } }
  | { mission: { field: keyof MissionProfile; equals?: unknown; in?: unknown[] } }
  | { all: Condition[] }
  | { any: Condition[] };

export interface Question {
  id: string;
  domain: string;
  /** Set on follow-ups: the question whose answer made this one appear. */
  parent?: string;
  text: string;
  input: "boolean" | "scale" | "choice" | "number";
  required: boolean;
  urgent?: boolean;
  allow_unsure?: boolean;
  allow_skip?: boolean;
  options?: { value: string; label: string }[];
  validation?: { min: number; max: number; unit?: string };
  show_if?: Condition;
  evidence_ids: string[];
}

export interface QuestionDomain {
  id: string;
  title: string;
  hazard_ids: HazardId[];
  condition_ids: string[];
  promote_if?: Condition;
}

export interface QuestionRegistry {
  version: string;
  note: string;
  domains: QuestionDomain[];
  questions: Question[];
}

/** One Human Research Roadmap risk with its NASA evidence report. */
export interface EvidenceReport {
  risk_id: number;
  risk_title: string;
  risk_url: string;
  report_title: string;
  report_url: string;
}

/** NASA HRP evidence reports per catalog condition, from humanresearchroadmap.nasa.gov/evidence. */
export interface HrrEvidence {
  reviewed_on: string;
  source_url: string;
  note: string;
  conditions: Record<string, EvidenceReport[]>;
}

export interface Knowledge {
  catalog: Catalog;
  mission_context: MissionContext;
  registry: QuestionRegistry;
  hrr_evidence: HrrEvidence;
  /** Space-biology study records from the NASA OSDR Biological Data API. */
  osdr_studies?: OsdrStudies;
}

/** One OSDR study: fields as NASA reports them, plus why AstroLife shows it. */
export interface OsdrStudy {
  accession: string;
  title: string;
  organism: string;
  material: string;
  factors: string[];
  project_title: string;
  project_identifier: string;
  flight_program: string;
  mission_name: string;
  mission_start: string;
  mission_end: string;
  assay_types: string[];
  measurement_types: string[];
  managing_center: string;
  released: string;
  description: string;
  study_url: string;
  condition_ids: string[];
  relevance: string;
  provenance: { source: string; api_docs: string; request_url: string; retrieved_at: string; sha256: string; pipeline_version: string };
}

export interface OsdrStudies {
  version: string;
  note: string;
  limitations: string;
  api_docs: string;
  studies: OsdrStudy[];
  /** Studies in the curated list that have no verified cached record. */
  unavailable: { accession: string; reason: string }[];
}

export interface FollowupAction {
  id: number;
  session_id: string;
  entry_id: number | null;
  condition_id: string;
  level: PriorityLevel;
  text: string;
  /** The recorded observation or rule output that led to this action. */
  observation: string;
  status: "open" | "done";
  created_at: string;
  completed_at: string | null;
}

/** One step of evidence behind a finding: an answer the astronaut gave or a value that was measured. */
export type TraceObservation =
  | { kind: "answer"; observation_id: string; question_id: string; question: string; answer_id: AnswerValue; answer: string; rule_ids: string[] }
  | { kind: "measurement"; observation_id: string; indicator_id: string; label: string; value: number; unit: string; source: string;
      sensor_port: string; measured_at: string; signal_quality: string; rule_ids: string[] };

/** Identifiers that make one finding auditable end to end. */
export interface Traceability {
  nasa_source_ids: string[];
  nasa_risk_ids: number[];
  question_ids: string[];
  observation_ids: string[];
  rule_ids: string[];
  rules_engine: string;
  rules_version: string;
  catalog_reviewed_on: string;
  question_registry_version: string;
  evidence_reviewed_on: string;
  action_ids: number[];
  history_entry_id?: number;
  session_id?: string;
}

/** Backend summary of one recorded indicator across saved check-ins. */
export interface TrendIndicator {
  label: string;
  unit: string;
  count: number;
  points: { entry_id: number; created_at: string; value: number; source: string }[];
  mean?: number; minimum?: number; maximum?: number; latest?: number;
  previous?: number | null;
  change_from_previous?: number | null;
}

export interface HistoryTrends {
  algorithm_version: string;
  entries_considered: number;
  simulated_excluded: number;
  indicators: Record<"heart_rate" | "spo2", TrendIndicator>;
  limits: string;
}

/**
 * Why a finding relates to the mission: the NASA hazard and risk it belongs
 * to, the astronaut's own observations that led the rules to it, and the
 * actions it created. Built by the Python backend.
 */
export interface EvidenceTraceEntry {
  condition_id: string;
  condition_title: string;
  level: PriorityLevel;
  mission_title: string;
  hazards: { id: HazardId; title: string; rank: number; emphasized: boolean }[];
  nasa_risks: EvidenceReport[];
  observations: TraceObservation[];
  rule_reason: string;
  actions: string[];
  /** Absent on check-ins saved before identifiers were recorded. */
  traceability?: Traceability;
}

/** Output of the Python rules for one check-in, plus what was not assessed. */
export interface SessionResult {
  checkin: CheckIn;
  assessment: Assessment;
  session_notes: string[];
  /** Absent on check-ins saved before the trace existed. */
  evidence_trace?: EvidenceTraceEntry[];
}

/** An indicator AstroLife can collect and the NASA risks it relates to. */
export interface PlanIndicator {
  id: string;
  label: string;
  unit: string;
  source: "sensor" | "question";
  condition_ids: string[];
  hazard_ids: HazardId[];
  hazard_rank: number | null;
  why: string;
}

/**
 * What a mission's check-in asks and collects, derived by the backend from the
 * NASA hazard and risk catalog: hazards in mission order, the topics and
 * questions that follow from them, and the indicators to collect.
 */
export interface AssessmentPlan {
  environment: MissionId;
  mission_title: string;
  hazards: {
    id: HazardId; title: string; rank: number; emphasized: boolean; rationale: string | null;
    condition_ids: string[]; hrr_risk_ids: number[]; topic_ids: string[]; question_ids: string[]; indicator_ids: string[];
  }[];
  topics: { domain_id: string; title: string; position: number; reason: string; hazard_ids: HazardId[]; condition_ids: string[]; question_ids: string[]; follow_up_ids: string[] }[];
  indicators: PlanIndicator[];
  question_count: number;
  safety_question_count: number;
}

export interface Session {
  session_id: string;
  started_at: string;
  updated_at: string;
  status: "in_progress" | "submitted" | "abandoned";
  registry_version: string;
  mission: MissionProfile;
  answers: Answers;
  position: string;
  entry_id: number | null;
  result: SessionResult | null;
}

export interface SubmittedSession extends SessionResult {
  session_id: string;
  entry_id: number;
  actions: FollowupAction[];
}

export interface SessionPreview extends SessionResult { urgent: boolean }

/** Why a check-in is submitted without a pulse and oxygen measurement. */
export type NoMeasurementReason = "sensor_unavailable" | "no_stable_reading";

/**
 * Which measurement to include. The sensor reading is the expected choice and
 * its values are read by the backend, not sent from here. Leaving the
 * measurement out is only accepted with a reason.
 */
export type MeasurementChoice =
  | { use: "sensor" }
  | { use: "none"; reason: NoMeasurementReason }
  | { use: "manual"; heart_rate: number | null; spo2: number | null; signal_quality: "unknown" | "good" | "poor" };

export interface AppState {
  mission: MissionProfile | null;
  open: Session | null;
  latest: Session | null;
  actions: FollowupAction[];
}
