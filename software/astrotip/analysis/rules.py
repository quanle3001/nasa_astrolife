"""Transparent review prompts, never a diagnostic model or NASA risk score."""

from datetime import datetime, timezone

from astrotip.analysis.care_guidance import load_care_guidance, steps_for
from astrotip.analysis.nasa_guidance import load_catalog
from astrotip.models.health_indicator import Assessment, CheckIn, Finding, SYMPTOMS


LEVEL_ORDER = {"urgent": 0, "review": 1, "watch": 2, "info": 3}
#: Version of the review rules in this module. Recorded with every finding; bump it when a rule changes.
RULES_VERSION = "2026.11.2"
#: General adult resting heart-rate reference (MedlinePlus "Pulse"). A general
#: reference, not a NASA or mission limit; well-trained people can rest at 40-60.
RESTING_HEART_RATE = (60, 100)
#: General SpO2 reference values (MedlinePlus "Pulse Oximetry"), not flight limits.
SPO2_REVIEW, SPO2_URGENT = 92, 88
EMERGENCY_ACTION = (
    "Contact the crew medical officer or emergency medical service now and follow the "
    "approved mission emergency procedure. Do not wait for another sensor reading or this app."
)

# Each mapping is an app review prompt for a reported observation, not a diagnosis.
OBSERVATION_RULES = {
    "chest_pain": ("cardiovascular", "urgent"),
    "breathing_difficulty": ("hypoxia", "urgent"),
    "fainting": ("cardiovascular", "urgent"),
    "confusion": ("hypoxia", "urgent"),
    "sudden_vision_loss": ("sans", "urgent"),
    "sudden_neurological": ("medical_support", "urgent"),
    "vision_changes": ("sans", "review"),
    "dizziness": ("vestibular", "watch"),
    "palpitations": ("cardiovascular", "review"),
    "fatigue": ("sleep", "watch"),
    "poor_sleep": ("sleep", "watch"),
    "mood_concern": ("behavioral", "watch"),
    "team_conflict": ("behavioral", "watch"),
    "fever_or_infection": ("immune", "review"),
    "poor_intake": ("nutrition", "watch"),
    "muscle_weakness": ("fitness", "watch"),
    "bone_pain": ("bone", "review"),
    "eva_symptoms": ("eva", "urgent"),
    "radiation_alert": ("radiation", "urgent"),
    "environmental_alert": ("hypoxia", "urgent"),
}


def indicator_status(checkin: CheckIn) -> tuple[dict, ...]:
    """Where each measured indicator sits against a cited general reference.

    The status is for colour coding at a glance: "in_reference", "outside_reference",
    "review" or "urgent". It uses the same values as the prompts below, and it
    never says a person is healthy: a reading inside a reference only means this
    number did not trigger a prompt.
    """
    simulated = checkin.input_source == "simulated"
    suffix = " Simulated demo value, not a measurement." if simulated else ""
    result = []
    if checkin.heart_rate is not None:
        low, high = RESTING_HEART_RATE
        inside = low <= checkin.heart_rate <= high
        result.append({
            "id": "heart_rate", "label": "Heart rate", "value": checkin.heart_rate, "unit": "bpm",
            "status": "in_reference" if inside else "outside_reference",
            "reference": f"{low} to {high} bpm at rest (general adult reference)",
            "text": (f"Inside the general adult resting reference of {low} to {high} bpm." if inside else
                     f"{'Above' if checkin.heart_rate > high else 'Below'} the general adult resting reference of {low} to {high} bpm. "
                     "Activity raises the pulse, and well-trained people can rest at 40 to 60.") + suffix,
            "source_ids": ["medlineplus_pulse"],
        })
    if checkin.spo2 is not None:
        status = "urgent" if checkin.spo2 <= SPO2_URGENT else "review" if checkin.spo2 <= SPO2_REVIEW else "in_reference"
        text = {
            "urgent": f"At or below {SPO2_URGENT}%, the general reference for immediate medical attention.",
            "review": f"At or below {SPO2_REVIEW}%, the general reference for contacting a clinician.",
            "in_reference": f"Above {SPO2_REVIEW}%, so it does not trigger the general low-oxygen prompt.",
        }[status]
        result.append({
            "id": "spo2", "label": "Estimated blood oxygen (SpO2)", "value": checkin.spo2, "unit": "%",
            "status": status, "reference": f"above {SPO2_REVIEW}% (general reference)",
            "text": text + suffix, "source_ids": ["medlineplus_oximetry", "fda_oximeter_basics"],
        })
    return tuple(result)


def assess(checkin: CheckIn, catalog: dict | None = None, guidance: dict | None = None) -> Assessment:
    """Surface urgent concerns, then review needs, then prevention/unknown risks.

    NASA's public pages do not define a universal risk order or vital-sign cutoffs.
    The SpO2 guardrails below come from MedlinePlus general patient guidance, not
    spaceflight validation. No sensor reading rules out the other risk domains.
    """
    catalog = catalog if catalog is not None else load_catalog()
    guidance = guidance if guidance is not None else load_care_guidance(catalog)
    pending: dict[str, dict] = {
        condition["id"]: {"level": "info", "reasons": [], "actions": [], "source_ids": [], "self_care": []}
        for condition in catalog["conditions"]
    }

    def flag(condition_id, level, reason, action=None, source_ids=(), care=None):
        """Raise a prompt. `care` names the self-care guidance to attach; urgent prompts take none."""
        item = pending[condition_id]
        if LEVEL_ORDER[level] < LEVEL_ORDER[item["level"]]:
            item["level"] = level
        item["reasons"].append(reason)
        if action:
            item["actions"].append(action)
        item["source_ids"].extend(source_ids)
        if care and level != "urgent":
            for step in steps_for(guidance, care):
                item["self_care"].append(step["text"])
                item["source_ids"].extend(step["source_ids"])

    for key in SYMPTOMS:
        if key not in checkin.symptoms:
            continue
        condition_id, level = OBSERVATION_RULES[key]
        action = EMERGENCY_ACTION if level == "urgent" else (
            "Arrange prompt review with the crew medical officer or a clinician."
            if level == "review" else "If it continues or gets worse, review it with the crew care team and the approved countermeasure plan."
        )
        if key == "radiation_alert":
            action = "Follow the mission radiation alert and shelter procedure immediately; notify mission control and the crew medical officer."
        elif key == "environmental_alert":
            action = "Follow the cabin environmental emergency procedure immediately; notify the crew and mission control. SpO2 cannot detect elevated cabin CO2."
        source_ids = ("medlineplus_emergencies",) if key in {
            "chest_pain", "breathing_difficulty", "fainting", "confusion", "sudden_vision_loss", "sudden_neurological"
        } else ()
        flag(condition_id, level, f"Reported: {SYMPTOMS[key].lower()}. This does not establish a diagnosis.", action, source_ids, care=key)

    notes = [
        "Priorities are app review prompts based on readings and reported observations, not NASA rankings or disease probabilities.",
        "Unselected symptoms are unreported. Risks without a trigger remain unassessed, not ruled out.",
        "Fingertip readings cannot assess radiation dose, bone density, SANS, infection, mental health or cabin CO2.",
    ]
    if checkin.spo2 is None:
        notes.append("SpO2 was not provided; oxygenation cannot be assessed from this check-in.")
    else:
        notes.append(
            "SpO2 prompts use general MedlinePlus reference values (88% and 92%), not NASA flight limits. "
            "The crew medical team must set mission-specific limits; do not change oxygen or medication using this app."
        )
        if checkin.spo2 <= SPO2_URGENT:
            flag("hypoxia", "urgent", f"Reported SpO2 {checkin.spo2:g}% meets the general reference for immediate medical attention.",
                 EMERGENCY_ACTION, ("medlineplus_oximetry", "fda_oximetry"))
        elif checkin.spo2 <= SPO2_REVIEW:
            flag("hypoxia", "review", f"Reported SpO2 {checkin.spo2:g}% meets the general reference for contacting a clinician.",
                 "Contact the crew medical officer or a clinician promptly; follow the mission oxygenation assessment procedure.",
                 ("medlineplus_oximetry", "fda_oximetry"))
        else:
            notes.append("The entered SpO2 does not trigger the general low-reading prompt; it cannot establish safety or exclude illness.")

    has_reading = checkin.spo2 is not None or checkin.heart_rate is not None
    if has_reading:
        notes.append(
            "Pulse oximeters can be inaccurate with motion, poor circulation, cold skin, nail polish or skin pigmentation; symptoms still matter."
        )
        if checkin.signal_quality == "poor":
            notes.append("Signal quality was reported as poor. Recheck placement and obtain a validated measurement; do not delay care for symptoms or low readings.")
            if checkin.spo2 is not None:
                # A poor signal is a reason to measure again, not evidence of low oxygen.
                flag("hypoxia", "watch", "The oxygen reading was taken with a poor signal, so it may be wrong.",
                     "If a careful second reading is still unexpected, or you feel unwell, tell the crew medical officer.",
                     ("fda_oximetry",), care="poor_signal")
        elif checkin.signal_quality != "good":
            notes.append("Signal quality is not validated: the sensor's agreeing reports are an engineering check, not proof of accuracy. Recheck an unexpected value, and do not delay care for symptoms.")
    if checkin.heart_rate is None:
        notes.append("Heart rate was not provided. Cardiovascular status remains unassessed.")
    else:
        low, high = RESTING_HEART_RATE
        if low <= checkin.heart_rate <= high:
            notes.append(
                f"Heart rate {checkin.heart_rate:g} bpm is inside the general adult resting reference of {low} to {high} bpm (MedlinePlus). "
                "That is a general reference, not a mission limit or a personal baseline, and it cannot establish cardiovascular health."
            )
        else:
            side = "above" if checkin.heart_rate > high else "below"
            flag("cardiovascular", "watch",
                 f"Heart rate {checkin.heart_rate:g} bpm is {side} the general adult resting reference of {low} to {high} bpm. "
                 "Activity raises the pulse and well-trained people can rest at 40 to 60, so this is a prompt to recheck, not a diagnosis.",
                 "If your resting rate stays outside the reference, or you feel unwell, tell the crew medical officer and compare it with your approved limits.",
                 ("medlineplus_pulse",), care="heart_rate_outside_reference")

    if checkin.sleep_hours is None:
        notes.append("Sleep duration was not reported.")
    elif checkin.sleep_hours < 6:
        flag("sleep", "watch", f"Reported sleep was {checkin.sleep_hours:g} hours. Below 6 hours triggers an app reminder, not a NASA clinical cutoff.",
             "If short sleep continues, review fatigue and workload with the crew lead or medical team.", care="low_sleep")

    if checkin.exercise_completed is False:
        for condition_id in ("fitness", "bone"):
            flag(condition_id, "watch", "The prescribed exercise session was reported as missed; this does not measure fitness or bone loss.",
                 "If something keeps you from exercising, discuss it with the crew exercise specialist and resume when medically appropriate.",
                 care="missed_exercise")

    if checkin.notes.strip():
        notes.append("Free-text notes are saved only when requested and are not automatically analyzed. Select the relevant symptoms above for review prompts.")

    findings = []
    for condition in catalog["conditions"]:
        item = pending[condition["id"]]
        findings.append(Finding(
            condition_id=condition["id"],
            level=item["level"],
            reason=" ".join(item["reasons"]) or "No specific concern was reported for this area. This risk is not assessed or ruled out by this check-in.",
            actions=tuple(dict.fromkeys(item["actions"])),
            source_ids=tuple(dict.fromkeys([*item["source_ids"], *condition["source_ids"]])),
            # An urgent prompt shows the emergency action only.
            self_care=() if item["level"] == "urgent" else tuple(dict.fromkeys(item["self_care"])),
        ))
    findings.sort(key=lambda finding: LEVEL_ORDER[finding.level])
    level = findings[0].level
    summaries = {
        "urgent": "Immediate action needed. Follow the urgent guidance below and contact the crew medical officer / mission control now. Routine prevention advice must wait until urgent concerns are addressed.",
        "review": "Medical review needed. Contact the crew medical officer or a clinician promptly about the flagged concerns.",
        "watch": "Some things to follow up. Each prompt lists simple steps you can take yourself and when to involve the crew. These prompts do not establish a diagnosis or mission fitness.",
        "info": "Nothing you entered needs follow-up right now. This is not a medical clearance: risks you did not report or measure remain unassessed.",
    }
    return Assessment(
        level, summaries[level], tuple(findings), tuple(notes),
        datetime.now(timezone.utc).isoformat(), catalog["reviewed_on"], indicator_status(checkin),
    )
