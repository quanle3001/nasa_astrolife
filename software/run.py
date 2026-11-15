"""Launch the Astro Life desktop application: python software/run.py."""

import sys

from PySide6.QtWidgets import QApplication, QMessageBox

from astrotip.ui.main_window import AstroLifeWindow


if __name__ == "__main__":
    app = QApplication(sys.argv)
    app.setApplicationName("Astro Life")
    app.setOrganizationName("Astro Life")
    try:
        window = AstroLifeWindow()
    except (OSError, ValueError, KeyError) as exc:
        QMessageBox.critical(None, "Astro Life could not start", f"The local guidance catalog could not be loaded.\n\n{exc}")
        sys.exit(1)
    window.show()

    sys.exit(app.exec())
