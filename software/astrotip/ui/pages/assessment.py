"""Prioritized concerns with evidence, actions, and measurement limitations."""

from PySide6.QtCore import Signal
from PySide6.QtWidgets import QHBoxLayout, QPushButton, QVBoxLayout, QWidget

from astrotip.ui.common import browser, assessment_html, label


class AssessmentPage(QWidget):
    save_requested = Signal()
    checkin_requested = Signal()

    def __init__(self, catalog, parent=None):
        super().__init__(parent)
        self.catalog = catalog
        layout = QVBoxLayout(self)
        heading = QHBoxLayout()
        heading.addWidget(label("Health priorities & next steps", "pageTitle"), 1)
        self.save_button = QPushButton("Save to history")
        self.save_button.setEnabled(False)
        self.save_button.clicked.connect(self.save_requested.emit)
        heading.addWidget(self.save_button)
        edit = QPushButton("Edit check-in")
        edit.clicked.connect(self.checkin_requested.emit)
        heading.addWidget(edit)
        layout.addLayout(heading)
        self.summary = label("Complete a check-in to see your current priorities.", "summaryBanner")
        layout.addWidget(self.summary)
        self.urgent_action = label("", "urgentBanner")
        self.urgent_action.hide()
        layout.addWidget(self.urgent_action)
        self.content = browser()
        self.content.setAccessibleName("Health assessment and suggested actions")
        self.content.setHtml(
            '<h2>Start with what you know</h2><p>Report symptoms, mission alerts, and any available '
            'readings in Daily Check-in. The assessment explains why each concern is shown, '
            'suggests practical next steps.</p>'
            '<p>No input has been analyzed yet. Connect your sensor or enter an optional check-in.</p>'
        )
        layout.addWidget(self.content, 1)
        self.save_status = label("", "subtitle")
        layout.addWidget(self.save_status)
        self.storage_location = label("", "subtitle")
        layout.addWidget(self.storage_location)

    def set_assessment(self, assessment):
        self.summary.setText(assessment.summary)
        urgent_actions = list(dict.fromkeys(
            action for finding in assessment.findings if finding.level == "urgent"
            for action in getattr(finding, "actions", ())
        ))
        urgent_text = urgent_actions[0] if urgent_actions else "Follow the mission emergency procedure and contact the crew medical officer now."
        if len(urgent_actions) > 1:
            urgent_text += " Additional urgent actions are listed first below."
        self.urgent_action.setText("ACT NOW\n" + urgent_text)
        self.urgent_action.setVisible(assessment.level == "urgent")
        self.content.setHtml(assessment_html(assessment, self.catalog))
        self.content.verticalScrollBar().setValue(0)
        self.save_button.setEnabled(True)
        self.save_status.setText("Unsaved assessment. Save only if you want a local record on this computer.")

    def mark_saved(self):
        self.save_button.setEnabled(False)
        self.save_status.setText("Saved to local health history.")
