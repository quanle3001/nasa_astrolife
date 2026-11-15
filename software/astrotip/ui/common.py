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
        "body { color: #dbe7f3; font-family: 'Avenir Next', 'Segoe UI'; font-size: 10.5pt; }"
        "h1 { font-size: 23pt; color: #f2f7ff; }"
        "h2 { font-size: 17pt; color: #f2f7ff; margin-top: 22px; }"
        "h3 { font-size: 11pt; color: #68dec8; margin-top: 18px; letter-spacing: 1px; }"
        "p { line-height: 140%; margin-top: 8px; margin-bottom: 12px; }"
        "a { color: #78afff; }"
        "li { margin-bottom: 8px; }"
        "hr { color: #284361; }"
        ".muted { color: #91a6be; }"
    )
    return widget


def assessment_html(assessment, catalog):
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
        html += f'<h2>{e(condition["title"])}</h2><p>{e(finding["reason"])}</p>'
        actions = list(finding.get("actions", []))
        if data["level"] != "urgent":
            actions += [item["text"] for item in condition["countermeasures"] if item["evidence"] != "Research only"]
        if actions:
            html += '<h3>Suggested next steps</h3><ul>'
            html += ''.join(f'<li>{e(action)}</li>' for action in dict.fromkeys(actions)) + '</ul>'
    if not html:
        html = '<p>No specific follow-up trigger was entered. This does not establish that you are healthy.</p>'
    html += (
        '<hr><p class="muted">Pulse and oxygen estimates cannot diagnose a condition or assess '
        'radiation exposure, bone health, eye changes, or mental health. '
        'Seek help for concerning symptoms even if a reading looks typical.</p>'
    )
    level = data["level"]
    return f'<p style="color:{LEVEL_COLORS.get(level, LEVEL_COLORS["info"])}"><b>{e(LEVEL_LABELS.get(level, level))}</b></p>' + html
