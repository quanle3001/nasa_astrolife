"""Transparent review prompts, never a diagnostic model or NASA risk score."""

from datetime import datetime, timezone

from astrotip.analysis.nasa_guidance import load_catalog
from astrotip.models.health_indicator import Assessment, CheckIn, Finding, SYMPTOMS


LEVEL_ORDER = {"urgent": 0, "review": 1, "watch": 2, "info": 3}
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


def assess(checkin: CheckIn, catalog: dict | None = None) -> Assessment:
    """Surface urgent concerns, then review needs, then prevention/unknown risks.

    NASA's public pages do not define a universal risk order or vital-sign cutoffs.
    The SpO2 guardrails below come from MedlinePlus general patient guidance, not
    spaceflight validation. No sensor reading rules out the other risk domains.
    """
    catalog = catalog if catalog is not None else load_catalog()
    pending: dict[str, dict] = {
        condition["id"]: {"level": "info", "reasons": [], "actions": [], "source_ids": []}
        for condition in catalog["conditions"]
    }

    def flag(condition_id, level, reason, action=None, source_ids=()):
        item = pending[condition_id]
        if LEVEL_ORDER[level] < LEVEL_ORDER[item["level"]]:
            item["level"] = level
        item["reasons"].append(reason)
        if action:
            item["actions"].append(action)
        item["source_ids"].extend(source_ids)

    for key in SYMPTOMS:
        if key not in checkin.symptoms:
            continue
        condition_id, level = OBSERVATION_RULES[key]
        action = EMERGENCY_ACTION if level == "urgent" else (
            "Arrange prompt review with the crew medical officer or a clinician."
            if level == "review" else "Review this concern with the crew care team and use the approved countermeasure plan."
        )
        if key == "radiation_alert":
            action = "Follow the mission radiation alert and shelter procedure immediately; notify mission control and the crew medical officer."
        elif key == "environmental_alert":
            action = "Follow the cabin environmental emergency procedure immediately; notify the crew and mission control. SpO2 cannot detect elevated cabin CO2."
        source_ids = ("medlineplus_emergencies",) if key in {
            "chest_pain", "breathing_difficulty", "fainting", "confusion", "sudden_vision_loss", "sudden_neurological"
        } else ()
        flag(condition_id, level, f"Reported: {SYMPTOMS[key].lower()}. This does not establish a diagnosis.", action, source_ids)

    notes = [
        "Priorities are app review prompts based on reported concerns and mission context, not NASA rankings or disease probabilities.",
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
        if checkin.spo2 <= 88:
            flag("hypoxia", "urgent", f"Reported SpO2 {checkin.spo2:g}% meets the general reference for immediate medical attention.",
                 EMERGENCY_ACTION, ("medlineplus_oximetry", "fda_oximetry"))
        elif checkin.spo2 <= 92:
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
        if checkin.signal_quality != "good":
            notes.append("Signal quality is poor or unknown. Recheck placement and obtain a validated measurement; do not delay care for symptoms or low readings.")
            if checkin.spo2 is not None:
                flag("hypoxia", "watch", "The entered oxygen reading has poor or unknown signal quality.",
                     "Recheck with a warm, still hand and a validated device while following any higher-priority medical advice.",
                     ("fda_oximetry",))
    if checkin.heart_rate is None:
        notes.append("Heart rate was not provided. Cardiovascular status remains unassessed.")
    else:
        flag("cardiovascular", "watch", f"Heart rate {checkin.heart_rate:g} bpm was recorded; there is no personal baseline or approved mission limit in this app.",
             "Compare this reading with your clinician-approved limits and recent baseline; report a new or concerning change.")

    if checkin.sleep_hours is None:
        notes.append("Sleep duration was not reported.")
    elif checkin.sleep_hours < 6:
        flag("sleep", "watch", f"Reported sleep was {checkin.sleep_hours:g} hours. Below 6 hours triggers an app reminder, not a NASA clinical cutoff.",
             "Review fatigue and workload with the crew; protect the scheduled sleep period and follow the mission sleep plan.")

    if checkin.exercise_completed is False:
        for condition_id in ("fitness", "bone"):
            flag(condition_id, "watch", "The prescribed exercise session was reported as missed; this does not measure fitness or bone loss.",
                 "Discuss barriers with the crew exercise specialist and resume the prescribed plan when medically appropriate.")

    if checkin.mission in {"lunar", "mars"}:
        flag("radiation", "watch", "Beyond low Earth orbit, radiation protection needs explicit mission planning; exposure was not measured here.",
             "Review dosimetry, space-weather alerts and the approved shelter plan with mission control.")
        flag("medical_support", "watch", "Greater distance from Earth changes access to medical support and resupply; this is a planning reminder.",
             "Review onboard medical resources, crew training and delayed-communication care procedures.")

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
        ))
    findings.sort(key=lambda finding: LEVEL_ORDER[finding.level])
    level = findings[0].level
    summaries = {
        "urgent": "Immediate action needed. Follow the urgent guidance below and contact the crew medical officer / mission control now. Routine prevention advice must wait until urgent concerns are addressed.",
        "review": "Medical review needed. Contact the crew medical officer or a clinician promptly about the flagged concerns.",
        "watch": "Concerns or prevention reminders to review. These prompts do not establish a diagnosis or mission fitness.",
        "info": "No review trigger was entered. Health risks remain unassessed; this is not a clearance or an all-clear.",
    }
    return Assessment(
        level, summaries[level], tuple(findings), tuple(notes),
        datetime.now(timezone.utc).isoformat(), catalog["reviewed_on"],
    )
