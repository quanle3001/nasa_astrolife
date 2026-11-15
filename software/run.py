"""Launch the AstroLife desktop application: python software/run.py."""

import sys

from PySide6.QtWidgets import QApplication, QMessageBox

from astrotip.ui.main_window import AstroLifeWindow
from astrotip.ui.theme import apply_base_theme


if __name__ == "__main__":
    app = QApplication(sys.argv)
    apply_base_theme(app)
    app.setApplicationName("AstroLife")
    app.setOrganizationName("AstroLife")
    try:
        window = AstroLifeWindow()
    except (OSError, ValueError, KeyError) as exc:
        QMessageBox.critical(None, "AstroLife could not start",
                             f"The local guidance catalog could not be loaded.\n\n{exc}")
        sys.exit(1)
    window.show()

    sys.exit(app.exec())
