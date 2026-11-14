
"""Main window for the AstroTip desktop application."""

# pylint: disable=no-name-in-module
from PySide6.QtWidgets import (
    QMainWindow,
    QTabWidget,
    QWidget,
    QVBoxLayout,
    QLabel,
)

PAGES = {
    "Dashboard": "Live heart rate, SpO2 and sensor readings",
    "Daily Check-in": "Sleep, mood, fatigue and symptoms",
    "Photos & Camera": "Import photos or capture images",
    "Assessment": "Health analysis and NASA-based guidance",
    "History": "Health trends and saved measurements",
    "NASA Sources": "NASA research and datasets",
}


class MainWindow(QMainWindow):
    """Main application window with placeholder pages."""

    def __init__(self):
        super().__init__()

        self.setWindowTitle("AstroTip - Astronaut Health Monitor")
        self.resize(1100, 700)

        tabs = QTabWidget()

        for name, description in PAGES.items():
            page = QWidget()
            layout = QVBoxLayout(page)

            title = QLabel(f"{name}\n\n{description}")
            title.setWordWrap(True)

            layout.addWidget(title)
            layout.addStretch()

            tabs.addTab(page, name)

        self.setCentralWidget(tabs)
