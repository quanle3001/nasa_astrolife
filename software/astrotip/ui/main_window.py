"""AstroLife's offline, evidence-linked crew health workspace."""

from PySide6.QtCore import QEasingCurve, QParallelAnimationGroup, QPropertyAnimation, QSize, Qt
from PySide6.QtWidgets import (
    QButtonGroup, QFrame, QHBoxLayout, QLabel, QMainWindow, QMessageBox,
    QPushButton, QTabWidget, QVBoxLayout, QWidget,
)

from astrotip.analysis.nasa_guidance import load_catalog
from astrotip.analysis.rules import assess
from astrotip.models.health_indicator import MISSION_LABELS
from astrotip.storage.database import HistoryStore
from astrotip.ui.animations.starfield import Starfield
from astrotip.ui.animations.transitions import fade_in, reduced_motion
from astrotip.ui.common import label
from astrotip.ui.icons import space_icon
from astrotip.ui.pages.assessment import AssessmentPage
from astrotip.ui.pages.checkin import CheckinPage
from astrotip.ui.pages.history import HistoryPage
from astrotip.ui.pages.sensor import SensorPage
from astrotip.ui.theme import APP_STYLESHEET
from astrotip.ui.widgets.orbital_indicator import OrbitalIndicator


class AstroTipWindow(QMainWindow):
    NAV_ITEMS = (
        ("fa6s.heart-pulse", "◉", "Sensor monitor"),
        ("fa6s.user-astronaut", "◇", "Optional check-in"),
        ("fa6s.clipboard-check", "△", "Assessment"),
        ("fa6s.clock-rotate-left", "◫", "Health history"),
    )

    def __init__(self, catalog=None, history_store=None):
        super().__init__()
        self.catalog = catalog if catalog is not None else load_catalog()
        self.history_store = history_store if history_store is not None else HistoryStore()
        self.latest_checkin = None
        self.latest_assessment = None
        self._sidebar_collapsed = False
        self.setWindowTitle("AstroLife · Crew health console")
        self.resize(1320, 880)
        self.setMinimumSize(900, 640)
        self.setStyleSheet(APP_STYLESHEET)

        central = QWidget()
        central.setObjectName("appSurface")
        self.starfield = Starfield(central)
        self.starfield.lower()
        shell = QHBoxLayout(central)
        shell.setContentsMargins(0, 0, 0, 0)
        shell.setSpacing(0)
        shell.addWidget(self._build_sidebar())
        shell.addWidget(self._build_workspace(), 1)
        self.setCentralWidget(central)

        self.sensor_page.snapshot_requested.connect(self.run_assessment)
        self.assessment_page.checkin_requested.connect(self.show_checkin)
        self.checkin_page.assess_requested.connect(self.run_assessment)
        self.assessment_page.save_requested.connect(self.save_assessment)
        self.tabs.currentChanged.connect(self._tab_changed)
        self.checkin_page.mission.currentIndexChanged.connect(self._mission_changed)
        self._tab_changed(0)
        self._mission_changed()

    def _build_sidebar(self):
        sidebar = QFrame()
        sidebar.setObjectName("sidebar")
        sidebar.setMinimumWidth(224)
        sidebar.setMaximumWidth(224)
        self.sidebar = sidebar
        layout = QVBoxLayout(sidebar)
        self.sidebar_layout = layout
        layout.setContentsMargins(18, 24, 18, 18)
        layout.setSpacing(7)
        brand_row = QHBoxLayout()
        self.brand_mark = label("A", "brandMark", False)
        self.brand_mark.setAlignment(Qt.AlignmentFlag.AlignCenter)
        brand_row.addWidget(self.brand_mark)
        self.brand_title = label("ASTROLIFE", "brand", False)
        brand_row.addWidget(self.brand_title, 1)
        self.sidebar_toggle = QPushButton("‹")
        self.sidebar_toggle.setObjectName("sidebarToggle")
        self.sidebar_toggle.setToolTip("Collapse navigation")
        self.sidebar_toggle.setAccessibleName("Collapse navigation sidebar")
        self.sidebar_toggle.clicked.connect(self.toggle_sidebar)
        toggle_icon = space_icon("fa6s.angles-left", color="#B9A5FF", active="#FFFFFF")
        if not toggle_icon.isNull():
            self.sidebar_toggle.setText("")
            self.sidebar_toggle.setIcon(toggle_icon)
        brand_row.addWidget(self.sidebar_toggle)
        layout.addLayout(brand_row)
        self.brand_subtitle = label("CREW HEALTH CONSOLE", "eyebrow", False)
        layout.addWidget(self.brand_subtitle)
        layout.addSpacing(26)
        self.workspace_label = label("WORKSPACE", "microLabel", False)
        layout.addWidget(self.workspace_label)

        self.nav_group = QButtonGroup(self)
        self.nav_group.setExclusive(True)
        self.nav_buttons = []
        for index, (icon_name, fallback, title) in enumerate(self.NAV_ITEMS):
            button = QPushButton(title)
            icon = space_icon(icon_name)
            if icon.isNull():
                button.setText(f"{fallback}   {title}")
            else:
                button.setIcon(icon)
                button.setIconSize(QSize(18, 18))
            button.setObjectName("navButton")
            button.setCheckable(True)
            button.setAccessibleName(f"Open {title}")
            button.clicked.connect(lambda _checked=False, page=index: self.tabs.setCurrentIndex(page))
            self.nav_group.addButton(button, index)
            self.nav_buttons.append(button)
            layout.addWidget(button)
        layout.addStretch()

        self.mission_panel = QFrame()
        self.mission_panel.setObjectName("panel")
        mission_layout = QVBoxLayout(self.mission_panel)
        mission_layout.setContentsMargins(13, 12, 13, 12)
        mission_layout.addWidget(label("MISSION CONTEXT", "microLabel", False))
        self.sidebar_mission = label("Low Earth orbit", "sectionTitle")
        self.sidebar_mission.setStyleSheet("font-size: 11pt;")
        mission_layout.addWidget(self.sidebar_mission)
        mission_layout.addWidget(label("Decorative context only\nAssessment rules unchanged", "subtitle"))
        layout.addWidget(self.mission_panel)
        layout.addSpacing(8)
        self.local_mode_label = label("LOCAL MODE  ·  NO CLOUD SYNC", "microLabel", False)
        layout.addWidget(self.local_mode_label)
        return sidebar

    def toggle_sidebar(self):
        """Animate the navigation width using the PyOneDark/PyDracula pattern."""
        self._sidebar_collapsed = not self._sidebar_collapsed
        start = self.sidebar.width()
        end = 78 if self._sidebar_collapsed else 224
        self._apply_sidebar_content(self._sidebar_collapsed)
        if reduced_motion():
            self.sidebar.setMinimumWidth(end)
            self.sidebar.setMaximumWidth(end)
            return
        group = QParallelAnimationGroup(self)
        for property_name in (b"minimumWidth", b"maximumWidth"):
            animation = QPropertyAnimation(self.sidebar, property_name, group)
            animation.setStartValue(start)
            animation.setEndValue(end)
            animation.setDuration(260)
            animation.setEasingCurve(QEasingCurve.Type.InOutCubic)
            group.addAnimation(animation)
        self._sidebar_animation = group
        group.start()

    def _apply_sidebar_content(self, collapsed):
        for widget in (
            self.brand_mark, self.brand_title, self.brand_subtitle,
            self.workspace_label, self.mission_panel, self.local_mode_label,
        ):
            widget.setVisible(not collapsed)
        self.sidebar_layout.setContentsMargins(10 if collapsed else 18, 24, 10 if collapsed else 18, 18)
        for button, (icon_name, fallback, title) in zip(self.nav_buttons, self.NAV_ITEMS):
            icon = space_icon(icon_name)
            button.setText(
                (fallback if collapsed else f"{fallback}   {title}")
                if icon.isNull() else ("" if collapsed else title)
            )
            if not icon.isNull():
                button.setIcon(icon)
            button.setProperty("compact", collapsed)
            button.style().unpolish(button)
            button.style().polish(button)
        toggle_icon = space_icon(
            "fa6s.angles-right" if collapsed else "fa6s.angles-left",
            color="#B9A5FF", active="#FFFFFF",
        )
        self.sidebar_toggle.setIcon(toggle_icon)
        self.sidebar_toggle.setText(("›" if collapsed else "‹") if toggle_icon.isNull() else "")
        action = "Expand" if collapsed else "Collapse"
        self.sidebar_toggle.setToolTip(f"{action} navigation")
        self.sidebar_toggle.setAccessibleName(f"{action} navigation sidebar")

    def _build_workspace(self):
        workspace = QWidget()
        workspace.setObjectName("pageSurface")
        layout = QVBoxLayout(workspace)
        layout.setContentsMargins(20, 16, 20, 12)
        layout.setSpacing(12)

        topbar = QFrame()
        topbar.setObjectName("topBar")
        top = QHBoxLayout(topbar)
        top.setContentsMargins(17, 10, 14, 10)
        titles = QVBoxLayout()
        titles.setSpacing(1)
        titles.addWidget(label("ASTROLIFE / CREW MEDICAL", "microLabel", False))
        self.current_page_label = label("Sensor monitor", "sectionTitle", False)
        titles.addWidget(self.current_page_label)
        top.addLayout(titles, 1)
        self.orbit_indicator = OrbitalIndicator()
        top.addWidget(self.orbit_indicator)
        self.mission_pill = label("LEO · LOCAL", "statusPill", False)
        self.mission_pill.setAlignment(Qt.AlignmentFlag.AlignCenter)
        top.addWidget(self.mission_pill)
        self.system_pill = label("●  SYSTEM READY", "statusPill", False)
        self.system_pill.setAlignment(Qt.AlignmentFlag.AlignCenter)
        top.addWidget(self.system_pill)
        layout.addWidget(topbar)

        self.tabs = QTabWidget()
        self.tabs.setDocumentMode(True)
        self.tabs.tabBar().hide()
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
            page.setObjectName("pageSurface")
            self.tabs.addTab(page, title)
        layout.addWidget(self.tabs, 1)
        layout.addWidget(label(
            "Educational prototype · Not a diagnosis or flight-certified medical device. "
            "Follow mission medical procedures and contact the medical team for concerning symptoms.",
            "notice",
        ))
        return workspace

    def resizeEvent(self, event):
        super().resizeEvent(event)
        if self.centralWidget():
            self.starfield.setGeometry(self.centralWidget().rect())
            self.starfield.lower()

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

    def _mission_changed(self, *_args):
        mission = self.checkin_page.mission.currentData() or "leo"
        name = MISSION_LABELS.get(mission, mission)
        self.sidebar_mission.setText(name)
        self.mission_pill.setText(f"{mission.upper()}  ·  LOCAL")
        self.orbit_indicator.set_mission(mission)

    def _tab_changed(self, index):
        if index < 0 or index >= len(self.nav_buttons):
            return
        self.nav_buttons[index].setChecked(True)
        self.current_page_label.setText(self.tabs.tabText(index))
        if self.tabs.currentWidget() is self.history_page:
            self.refresh_history()
        # Urgent actions are shown immediately without transitional delay.
        urgent = self.tabs.currentWidget() is self.assessment_page and self.latest_assessment is not None and self.latest_assessment.level == "urgent"
        if not urgent:
            fade_in(self.tabs.currentWidget())

    def closeEvent(self, event):
        if self.sensor_page.shutdown():
            event.accept()
        else:
            event.ignore()
            self.sensor_page.status.setText("Waiting for the serial connection to close; try closing again shortly.")
