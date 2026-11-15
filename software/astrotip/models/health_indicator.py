"""User observations and explainable assessment results (not diagnoses)."""

from dataclasses import dataclass, field
from math import isfinite


SYMPTOMS = {
    "chest_pain": "Chest pain or tightness",
    "breathing_difficulty": "Difficulty breathing",
    "fainting": "Fainting or loss of consciousness",
    "confusion": "New confusion",
    "sudden_vision_loss": "Sudden loss of vision",
    "sudden_neurological": "Sudden new dizziness, weakness or change in vision",
    "vision_changes": "New blurred vision or eye changes",
    "dizziness": "Dizziness, motion sickness or balance problems",
    "palpitations": "Racing or irregular heartbeat",
    "fatigue": "Fatigue or daytime sleepiness",
    "poor_sleep": "Poor sleep or disrupted schedule",
    "mood_concern": "Low mood, anxiety or isolation",
    "team_conflict": "Team tension or communication problems",
    "fever_or_infection": "Fever, rash or infection concern",
    "poor_intake": "Poor food or fluid intake",
    "muscle_weakness": "Reduced strength or exercise capacity",
    "bone_pain": "Bone or back pain",
    "eva_symptoms": "New symptoms after EVA / pressure change",
    "radiation_alert": "Radiation / dosimeter alert",
    "environmental_alert": "Cabin air, CO2 or contamination alert",
}


@dataclass(frozen=True)
class CheckIn:
    heart_rate: float | None = None
    spo2: float | None = None
    signal_quality: str = "unknown"
    sleep_hours: float | None = None
    symptoms: frozenset[str] = field(default_factory=frozenset)
    exercise_completed: bool | None = None
    notes: str = ""
    input_source: str = "manual"
    sensor_port: str = ""
    sensor_received_at: str = ""

    def __post_init__(self):
        # "simulated" marks demo data so it can never be mistaken for a real measurement.
        if self.input_source not in {"manual", "sensor", "simulated"}:
            raise ValueError("Unknown reading source.")
        if self.signal_quality not in {"unknown", "good", "poor"}:
            raise ValueError("Choose a valid signal quality.")
        for name, low, high in (("heart_rate", 1, 300), ("spo2", 1, 100), ("sleep_hours", 0, 24)):
            value = getattr(self, name)
            if value is not None and (
                isinstance(value, bool) or not isinstance(value, (int, float))
                or not isfinite(value) or not low <= value <= high
            ):
                raise ValueError(f"{name.replace('_', ' ').capitalize()} must be between {low} and {high}, or left blank.")
        if isinstance(self.symptoms, str):
            raise ValueError("Symptoms must be a collection of supported observation keys.")
        try:
            symptoms = frozenset(self.symptoms)
        except TypeError as exc:
            raise ValueError("Symptoms must be a collection of supported observation keys.") from exc
        if not symptoms.issubset(SYMPTOMS):
            raise ValueError("The check-in contains an unsupported observation.")
        object.__setattr__(self, "symptoms", symptoms)
        if self.exercise_completed is not None and type(self.exercise_completed) is not bool:
            raise ValueError("Exercise completion must be yes, no, or not reported.")
        if not isinstance(self.notes, str) or len(self.notes) > 5000:
            raise ValueError("Notes must contain no more than 5,000 characters.")


@dataclass(frozen=True)
class Finding:
    condition_id: str
    level: str
    reason: str
    #: Steps that involve the crew medical officer, a clinician or a mission procedure.
    actions: tuple[str, ...] = ()
    source_ids: tuple[str, ...] = ()
    #: Simple, sourced steps the astronaut can take themselves. Empty for urgent prompts.
    self_care: tuple[str, ...] = ()


@dataclass(frozen=True)
class Assessment:
    level: str
    summary: str
    findings: tuple[Finding, ...]
    data_notes: tuple[str, ...]
    created_at: str
    catalog_reviewed_on: str = ""
    #: Status of each measured indicator against a cited general reference (see rules.indicator_status).
    indicators: tuple[dict, ...] = ()
