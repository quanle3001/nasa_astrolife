"""Optional, explicit daily observations. Empty fields stay unknown."""

from PySide6.QtCore import Signal
from PySide6.QtWidgets import (
    QCheckBox, QComboBox, QFormLayout, QGridLayout, QGroupBox, QHBoxLayout,
    QLineEdit, QMessageBox, QPushButton, QScrollArea, QTextEdit, QVBoxLayout, QWidget,
)

from astrotip.models.health_indicator import CheckIn, SYMPTOMS
from astrotip.ui.common import label
from astrotip.ui.icons import space_icon
from astrotip.ui.widgets.mission_gallery import MissionGallery


class CheckinPage(QWidget):
    assess_requested = Signal(object)

    def __init__(self, parent=None):
        super().__init__(parent)
        layout = QVBoxLayout(self)
        layout.setContentsMargins(4, 4, 4, 4)
        layout.addWidget(label("CREW DAILY LOG", "eyebrow", False))
        layout.addWidget(label("Daily health check-in", "pageTitle"))
        layout.addWidget(label(
            "Record what you know. Leave missing readings blank; unreported symptoms are not ruled out.",
            "subtitle",
        ))
        scroll = QScrollArea()
        scroll.setWidgetResizable(True)
        content = QWidget()
        body = QVBoxLayout(content)
        body.setContentsMargins(2, 5, 8, 8)
        # Decorative mission context only: it never enters the CheckIn or the rules.
        self.mission_gallery = MissionGallery()
        body.addWidget(self.mission_gallery)
        context = QGroupBox("Health observations")
        form = QFormLayout(context)
        self.heart_rate = QLineEdit()
        self.heart_rate.setPlaceholderText("Optional · beats per minute")
        self.heart_rate.setAccessibleName("Heart rate in beats per minute")
        form.addRow("Heart rate (bpm)", self.heart_rate)
        self.spo2 = QLineEdit()
        self.spo2.setPlaceholderText("Optional · percent")
        self.spo2.setAccessibleName("Estimated blood oxygen saturation in percent")
        form.addRow("Blood oxygen (%)", self.spo2)
        self.signal_quality = QComboBox()
        self.signal_quality.addItem("Unknown / not checked", "unknown")
        self.signal_quality.addItem("Good · stable, repeated reading", "good")
        self.signal_quality.addItem("Poor · motion, weak contact or unstable", "poor")
        form.addRow("Reading quality", self.signal_quality)
        self.sleep_hours = QLineEdit()
        self.sleep_hours.setPlaceholderText("Optional · hours in the last 24 hours")
        self.sleep_hours.setAccessibleName("Sleep hours in the last 24 hours")
        form.addRow("Sleep (hours)", self.sleep_hours)
        self.exercise_completed = QComboBox()
        self.exercise_completed.addItem("Not recorded / not applicable", None)
        self.exercise_completed.addItem("Completed prescribed session", True)
        self.exercise_completed.addItem("Missed prescribed session", False)
        form.addRow("Prescribed exercise", self.exercise_completed)
        body.addWidget(context)
        body.addWidget(label(
            "Pulse readings cannot diagnose a condition or measure radiation, bone health, "
            "eye changes, or cabin air quality. Severe symptoms need help even when readings look typical.",
            "subtitle",
        ))
        symptoms_box = QGroupBox("Symptoms and alerts reported today")
        symptoms_layout = QGridLayout(symptoms_box)
        self.symptom_checks = {}
        for index, (key, title) in enumerate(SYMPTOMS.items()):
            checkbox = QCheckBox(title)
            checkbox.setAccessibleName(title)
            self.symptom_checks[key] = checkbox
            symptoms_layout.addWidget(checkbox, index // 2, index % 2)
        body.addWidget(symptoms_box)
        body.addWidget(label("Notes for your record · not automatically analyzed", "subtitle"))
        self.notes = QTextEdit()
        self.notes.setPlaceholderText("Optional: timing, activity, changes from baseline, or information for the medical team.")
        self.notes.setMaximumHeight(100)
        self.notes.setAccessibleName("Optional notes, not analyzed")
        body.addWidget(self.notes)
        body.addStretch()
        scroll.setWidget(content)
        layout.addWidget(scroll, 1)
        footer = QHBoxLayout()
        footer.addWidget(label("Assessment stays in memory until you choose Save to history.", "subtitle"), 1)
        self.submit_button = QPushButton("Review health priorities")
        self.submit_button.setIcon(space_icon("fa6s.satellite-dish", color="#07131C", active="#07131C"))
        self.submit_button.setObjectName("primaryButton")
        self.submit_button.clicked.connect(self.submit)
        footer.addWidget(self.submit_button)
        layout.addLayout(footer)

    @staticmethod
    def _optional_number(field, name):
        text = field.text().strip()
        if not text:
            return None
        try:
            return float(text)
        except ValueError as exc:
            raise ValueError(f"Enter a number for {name}, or leave the field blank.") from exc

    def collect_checkin(self):
        return CheckIn(
            heart_rate=self._optional_number(self.heart_rate, "heart rate"),
            spo2=self._optional_number(self.spo2, "SpO₂"),
            signal_quality=self.signal_quality.currentData(),
            sleep_hours=self._optional_number(self.sleep_hours, "sleep hours"),
            symptoms=frozenset(key for key, widget in self.symptom_checks.items() if widget.isChecked()),
            exercise_completed=self.exercise_completed.currentData(),
            notes=self.notes.toPlainText().strip(),
        )

    def submit(self):
        try:
            checkin = self.collect_checkin()
        except ValueError as exc:
            QMessageBox.warning(self, "Check your observations", str(exc))
            return
        self.assess_requested.emit(checkin)
