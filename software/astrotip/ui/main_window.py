"""AstroTip's offline, evidence-linked health guidance workspace."""

from PySide6.QtWidgets import (
    QHBoxLayout, QMainWindow, QMessageBox, QTabWidget, QVBoxLayout, QWidget,
)

from astrotip.analysis.nasa_guidance import load_catalog
from astrotip.analysis.rules import assess
from astrotip.storage.database import HistoryStore
from astrotip.ui.common import label
from astrotip.ui.pages.assessment import AssessmentPage
from astrotip.ui.pages.checkin import CheckinPage
from astrotip.ui.pages.sensor import SensorPage
from astrotip.ui.pages.history import HistoryPage


STYLE = """
QWidget { background: #0c1626; color: #e5edf8; font-family: 'Segoe UI'; font-size: 10pt; }
QMainWindow { background: #0c1626; }
QLabel#metric { background: #152b41; font-size: 24pt; padding: 20px; border-radius: 9px; }
QLabel#brand { font-size: 23pt; font-weight: 700; color: #9ee5d3; }
QLabel#pageTitle { font-size: 20pt; font-weight: 600; margin: 9px 0; }
QLabel#subtitle { color: #adbed4; margin: 3px 0 8px 0; }
QLabel#summaryBanner { background: #18334a; border: 1px solid #30546d; border-radius: 9px; padding: 13px; font-size: 11pt; }
QLabel#urgentBanner { background: #47202c; border: 1px solid #b95768; border-radius: 8px; padding: 12px; color: #ffe2e6; }
QLabel#notice { color: #adbed4; border-top: 1px solid #293c53; padding-top: 8px; }
QTabWidget::pane { border: 0; }
QTabBar::tab { padding: 13px 18px; color: #adbed4; border-bottom: 3px solid transparent; }
QTabBar::tab:selected { color: #9ee5d3; border-bottom: 3px solid #8ad8c4; background: #15243a; }
QTabBar::tab:hover { background: #192d46; }
QPushButton { background: #203953; border: 1px solid #3d5b79; border-radius: 7px; padding: 10px 15px; }
QPushButton:hover { background: #2a4b69; }
QPushButton:focus { border: 2px solid #a8e9d7; }
QPushButton:disabled { color: #8290a3; background: #192638; border-color: #293b50; }
QPushButton#primaryButton { background: #88ddc6; color: #0c2b29; border: 1px solid #88ddc6; font-weight: 600; }
QPushButton#primaryButton:hover { background: #b0efdf; }
QLineEdit, QComboBox, QTextEdit, QTextBrowser { background: #101f33; border: 1px solid #32485f; border-radius: 6px; padding: 9px; selection-background-color: #346b81; }
QLineEdit:focus, QComboBox:focus, QTextEdit:focus { border-color: #8ad8c4; }
QComboBox { min-width: 180px; }
QComboBox QAbstractItemView { background: #192b42; color: #e5edf8; selection-background-color: #30556d; }
QListWidget { background: #101f33; border: 1px solid #32485f; border-radius: 6px; padding: 4px; }
QListWidget::item { padding: 14px 9px; border-bottom: 1px solid #23384f; }
QListWidget::item:selected { background: #24465a; color: #e9fff9; border-left: 3px solid #8ad8c4; }
QListWidget::item:hover { background: #1b354e; }
QGroupBox { font-weight: 600; border: 1px solid #32485f; border-radius: 8px; margin-top: 15px; padding: 18px 12px 12px; }
QGroupBox::title { subcontrol-origin: margin; left: 12px; padding: 0 6px; color: #9ee5d3; }
QCheckBox { padding: 6px; spacing: 9px; }
QCheckBox::indicator { width: 18px; height: 18px; }
QScrollArea { border: 0; }
QScrollBar:vertical { background: #101f33; width: 12px; margin: 0; }
QScrollBar::handle:vertical { background: #45617c; border-radius: 5px; min-height: 25px; }
QScrollBar::add-line:vertical, QScrollBar::sub-line:vertical { height: 0; }
QSplitter::handle { background: #263b52; }
QTableWidget { background: #101f33; gridline-color: #29415a; border: 1px solid #32485f; selection-background-color: #24465a; }
QHeaderView::section { background: #192d46; color: #c6d9ec; padding: 10px; border: 0; }
"""


class AstroTipWindow(QMainWindow):
    def __init__(self, catalog=None, history_store=None):
        super().__init__()
        self.catalog = catalog if catalog is not None else load_catalog()
        self.history_store = history_store if history_store is not None else HistoryStore()
        self.latest_checkin = None
        self.latest_assessment = None
        self.setWindowTitle("AstroTip · Astronaut health priorities")
        self.resize(1200, 850)
        self.setMinimumSize(850, 620)
        self.setStyleSheet(STYLE)
        central = QWidget()
        layout = QVBoxLayout(central)
        layout.setContentsMargins(22, 12, 22, 12)
        header = QHBoxLayout()
        header.addWidget(label("ASTROTIP", "brand"))
        header.addWidget(label("CREW HEALTH COMPANION", "subtitle"), 1)
        header.addWidget(label("ESP32 + MAX30102", "subtitle"))
        layout.addLayout(header)
        self.tabs = QTabWidget()
        self.tabs.setDocumentMode(True)
        self.sensor_page = SensorPage(self.catalog)
        self.checkin_page = CheckinPage()
        self.assessment_page = AssessmentPage(self.catalog)
        self.history_page = HistoryPage(self.catalog)
        storage_text = f'Local history file (unencrypted): {getattr(self.history_store, "path", "custom history store")}'
        self.assessment_page.storage_location.setText(storage_text)
        self.history_page.storage_location.setText(storage_text)
        for page, title in (
            (self.sensor_page, "Sensor monitor"),
            (self.checkin_page, "Optional check-in"),
            (self.assessment_page, "Assessment"),
            (self.history_page, "Health History"),
        ):
            self.tabs.addTab(page, title)
        layout.addWidget(self.tabs, 1)
        layout.addWidget(label(
            "Educational prototype · Not a diagnosis or flight-certified medical device. "
            "Follow your mission medical procedures and contact the medical team for concerning symptoms.",
            "notice",
        ))
        self.setCentralWidget(central)
        self.sensor_page.snapshot_requested.connect(self.run_assessment)
        self.assessment_page.checkin_requested.connect(self.show_checkin)
        self.checkin_page.assess_requested.connect(self.run_assessment)
        self.assessment_page.save_requested.connect(self.save_assessment)
        self.tabs.currentChanged.connect(self._tab_changed)

    def show_checkin(self):
        self.tabs.setCurrentWidget(self.checkin_page)

    def run_assessment(self, checkin):
        try:
            assessment = assess(checkin, self.catalog)
        except (ValueError, TypeError) as exc:
            QMessageBox.warning(self, "Check your observations", str(exc))
            return
        self.latest_checkin = checkin
        self.latest_assessment = assessment
        self.assessment_page.set_assessment(assessment)
        self.tabs.setCurrentWidget(self.assessment_page)

    def save_assessment(self):
        if self.latest_assessment is None or self.latest_checkin is None:
            return
        try:
            self.history_store.save(self.latest_checkin, self.latest_assessment)
        except Exception as exc:
            QMessageBox.warning(self, "Could not save history", f"Your assessment is still available.\n\n{exc}")
            return
        self.assessment_page.mark_saved()
        self.refresh_history()

    def refresh_history(self):
        try:
            self.history_page.set_entries(self.history_store.list_entries())
        except Exception as exc:
            QMessageBox.warning(self, "Could not load history", str(exc))

    def _tab_changed(self, _index):
        if self.tabs.currentWidget() is self.history_page:
            self.refresh_history()

    def closeEvent(self, event):
        if self.sensor_page.shutdown():
            event.accept()
        else:
            event.ignore()
            self.sensor_page.status.setText("Waiting for the serial connection to close; try closing again shortly.")
