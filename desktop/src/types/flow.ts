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

export interface Knowledge {
  catalog: Catalog;
  mission_context: MissionContext;
  registry: QuestionRegistry;
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

/** Output of the Python rules for one check-in, plus what was not assessed. */
export interface SessionResult {
  checkin: CheckIn;
  assessment: Assessment;
  session_notes: string[];
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

/** Which measurement to include. Sensor values are read by the backend, not sent from here. */
export type MeasurementChoice =
  | { use: "sensor" }
  | { use: "none" }
  | { use: "manual"; heart_rate: number | null; spo2: number | null; signal_quality: "unknown" | "good" | "poor" };

export interface AppState {
  mission: MissionProfile | null;
  open: Session | null;
  latest: Session | null;
  actions: FollowupAction[];
}
