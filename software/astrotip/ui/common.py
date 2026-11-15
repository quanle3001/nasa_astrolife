"""Shared presentation helpers for the offline health guidance pages."""

from html import escape
from dataclasses import asdict, is_dataclass

from PySide6.QtCore import Qt
from PySide6.QtWidgets import QLabel, QTextBrowser


LEVEL_LABELS = {
    "urgent": "Act now",
    "review": "Medical review",
    "watch": "Follow up",
    "info": "Prevention & monitoring",
}
LEVEL_COLORS = {
    "urgent": "#ff7e8c",
    "review": "#ffc978",
    "watch": "#90c6ff",
    "info": "#8ad8c4",
}

PLAIN_TITLES = {
    "hypoxia": "Oxygen reading", "cardiovascular": "Pulse and heart health",
    "sans": "Eyes and vision", "vestibular": "Balance and dizziness",
    "fitness": "Strength and exercise", "bone": "Bones", "sleep": "Sleep and fatigue",
    "behavioral": "Mood and wellbeing", "immune": "Illness or infection",
    "nutrition": "Food and fluids", "radiation": "Radiation alert",
    "eva": "After a spacewalk", "medical_support": "Medical support",
}


def simple_summary(assessment):
    return {
        "urgent": "Immediate action needed. Contact the medical team or emergency services now.",
        "review": "Contact the medical team about this reading or concern.",
        "watch": "Check these readings and concerns. Follow your personal care plan.",
        "info": "No alert from the information entered. This is not a health clearance.",
    }[assessment.level]


def live_guidance_html(checkin, assessment):
    """One short next step; always evaluate the latest, unaveraged reading."""
    if assessment.level == "urgent":
        title = "Get help now"
        text = (f"Oxygen estimate: {checkin.spo2:g}%. This reading needs immediate medical attention. "
                "Contact the medical team or emergency services now. Do not wait for another reading.")
    elif assessment.level == "review":
        title = "Contact the medical team"
        text = f"Oxygen estimate: {checkin.spo2:g}%. Arrange a prompt check with an approved monitor and the medical team."
    else:
        title = "What to do"
        text = "Compare these estimates with your personal limits and an approved monitor. Tell the medical team about unexpected readings."
    return f'<b style="color:{LEVEL_COLORS[assessment.level]}">{e(title)}</b><p>{e(text)}</p>'


def e(value):
    return escape(str(value), quote=True)


def label(text, style="", word_wrap=True):
    widget = QLabel(text)
    widget.setWordWrap(word_wrap)
    widget.setTextFormat(Qt.TextFormat.PlainText)
    if style:
        widget.setObjectName(style)
    return widget


def browser():
    widget = QTextBrowser()
    widget.setOpenExternalLinks(True)
    widget.setReadOnly(True)
    widget.document().setDefaultStyleSheet(
        "body { color: #e5edf8; font-family: 'Segoe UI'; font-size: 11pt; }"
        "h1 { font-size: 23pt; color: #ffffff; }"
        "h2 { font-size: 17pt; color: #ffffff; margin-top: 22px; }"
        "h3 { font-size: 12pt; color: #9ee5d3; margin-top: 18px; }"
        "p { line-height: 140%; margin-top: 8px; margin-bottom: 12px; }"
        "a { color: #90c6ff; }"
        "li { margin-bottom: 8px; }"
        "hr { color: #2c425c; }"
        ".muted { color: #adbed4; }"
    )
    return widget


def assessment_html(assessment, catalog, detailed=False):
    """Show only relevant results and responses; keep reference content internal."""
    data = asdict(assessment) if is_dataclass(assessment) else assessment
    conditions = {item["id"]: item for item in catalog["conditions"]}
    html = ""
    for finding in data["findings"]:
        if finding["level"] == "info":
            continue
        if data["level"] == "urgent" and finding["level"] != "urgent":
            continue
        condition = conditions.get(finding["condition_id"])
        if not condition:
            continue
        title = condition["title"] if detailed else PLAIN_TITLES.get(condition["id"], condition["title"])
        html += f'<h2>{e(title)}</h2><p>{e(finding["reason"])}</p>'
        actions = list(finding.get("actions", []))
        if detailed and data["level"] != "urgent":
            actions += [item["text"] for item in condition["countermeasures"] if item["evidence"] != "Research only"]
        if actions:
            html += '<h3>Suggested next steps</h3><ul>'
            html += ''.join(f'<li>{e(action)}</li>' for action in dict.fromkeys(actions)) + '</ul>'
    if not html:
        html = '<p>No alert from the information entered. This does not establish that you are healthy.</p>'
    html += '<hr><p class="muted">If you feel unwell, contact the medical team even when the numbers look usual.</p>'
    level = data["level"]
    return f'<p style="color:{LEVEL_COLORS.get(level, LEVEL_COLORS["info"])}"><b>{e(LEVEL_LABELS.get(level, level))}</b></p>' + html
