"""Saved local assessments, displayed as they were recorded."""

from PySide6.QtCore import Qt
from PySide6.QtWidgets import (
    QAbstractItemView, QHeaderView, QSplitter, QTableWidget,
    QTableWidgetItem, QVBoxLayout, QWidget,
)

from astrotip.models.health_indicator import MISSION_LABELS, SYMPTOMS
from astrotip.ui.common import LEVEL_LABELS, browser, assessment_html, e, label


class HistoryPage(QWidget):
    def __init__(self, catalog, parent=None):
        super().__init__(parent)
        self.catalog = catalog
        self.entries = []
        layout = QVBoxLayout(self)
        layout.addWidget(label("Health history", "pageTitle"))
        layout.addWidget(label(
            "Saved on this computer. Past priorities reflect the observations recorded at that time.",
            "subtitle",
        ))
        self.storage_location = label("", "subtitle")
        layout.addWidget(self.storage_location)
        splitter = QSplitter(Qt.Orientation.Vertical)
        self.table = QTableWidget(0, 3)
        self.table.setHorizontalHeaderLabels(["Recorded", "Mission", "Priority"])
        self.table.horizontalHeader().setSectionResizeMode(QHeaderView.ResizeMode.Stretch)
        self.table.setSelectionBehavior(QAbstractItemView.SelectionBehavior.SelectRows)
        self.table.setSelectionMode(QAbstractItemView.SelectionMode.SingleSelection)
        self.table.setEditTriggers(QAbstractItemView.EditTrigger.NoEditTriggers)
        self.table.verticalHeader().hide()
        self.table.setAccessibleName("Saved check-ins")
        self.content = browser()
        splitter.addWidget(self.table)
        splitter.addWidget(self.content)
        splitter.setStretchFactor(0, 1)
        splitter.setStretchFactor(1, 3)
        layout.addWidget(splitter, 1)
        self.table.currentCellChanged.connect(lambda row, *_: self.show_entry(row))
        self.set_entries([])

    def set_entries(self, entries):
        self.entries = entries
        self.table.setRowCount(len(entries))
        for row, entry in enumerate(entries):
            values = [
                entry["created_at"],
                MISSION_LABELS.get(entry["checkin"]["mission"], entry["checkin"]["mission"]),
                LEVEL_LABELS.get(entry["assessment"]["level"], entry["assessment"]["level"]),
            ]
            for col, value in enumerate(values):
                self.table.setItem(row, col, QTableWidgetItem(str(value)))
        if entries:
            self.table.selectRow(0)
            self.show_entry(0)
        else:
            self.content.setHtml(
                '<h2>No saved check-ins</h2><p>Review a Daily Check-in, then choose '
                '<b>Save to history</b> on the Assessment page to keep a local record.</p>'
            )

    def show_entry(self, row):
        if row < 0 or row >= len(self.entries):
            return
        entry = self.entries[row]
        checkin, assessment = entry["checkin"], entry["assessment"]
        symptoms = ', '.join(SYMPTOMS.get(key, key) for key in checkin["symptoms"])
        readings = []
        for key, title, unit in (("heart_rate", "Heart rate", "bpm"), ("spo2", "SpO₂", "%"), ("sleep_hours", "Sleep", "hours")):
            value = checkin.get(key)
            readings.append(f'{title}: {value} {unit}' if value is not None else f'{title}: not recorded')
        html = (
            f'<h2>{e(assessment["summary"])}</h2>'
            f'<p>{e(entry["created_at"])}</p>'
            f'<p>{e(" · ".join(readings))}</p>'
            f'<p><b>Reading quality:</b> {e(checkin.get("signal_quality", "unknown"))}</p>'
            f'<p><b>Reported symptoms:</b> {e(symptoms or "None reported; conditions are not ruled out.")}</p>'
            f'<p><b>Notes (not analyzed):</b> {e(checkin.get("notes", "") or "None")}</p>'
        )
        html += f'<p><b>Input:</b> {e(checkin.get("input_source", "manual"))} {e(checkin.get("sensor_port", ""))}</p>'
        html += assessment_html(assessment, self.catalog)
        self.content.setHtml(html)
        self.content.verticalScrollBar().setValue(0)
