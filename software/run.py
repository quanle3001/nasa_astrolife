import sys
from PySide6.QtWidgets import (
    QApplication,
    QLabel,
    QMainWindow,
    QTabWidget,
)


class AstroTipWindow(QMainWindow):
    def __init__(self):
        super().__init__()

        self.setWindowTitle("AstroTip")
        self.resize(1100, 700)

        tabs = QTabWidget()

        pages = [
            "Dashboard",
            "Daily Check-in",
            "Photos & Camera",
            "Assessment",
            "Health History",
            "NASA Sources",
        ]

        for name in pages:
            tabs.addTab(QLabel(f"{name} - Coming Soon"), name)

        self.setCentralWidget(tabs)


if __name__ == "__main__":
    app = QApplication(sys.argv)
    window = AstroTipWindow()
    window.show()
    sys.exit(app.exec())
