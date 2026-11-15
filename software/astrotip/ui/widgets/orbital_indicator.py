"""A tiny decorative mission-orbit indicator for the application header."""

from math import cos, pi, sin

from PySide6.QtCore import QPointF, QRectF, QTimer, Qt
from PySide6.QtGui import QColor, QPainter, QPen
from PySide6.QtWidgets import QWidget

from astrotip.ui.animations.transitions import reduced_motion


class OrbitalIndicator(QWidget):
    COLORS = {"leo": "#48D5E9", "lunar": "#B9D8F2", "mars": "#E5A16C"}

    def __init__(self, parent=None):
        super().__init__(parent)
        self.setFixedSize(78, 44)
        self.setCursor(Qt.CursorShape.PointingHandCursor)
        self.setAccessibleName("Decorative mission orbit animation")
        self._mission = "leo"
        self._angle = -0.6
        self._paused = reduced_motion()
        self._timer = QTimer(self)
        self._timer.setInterval(90)
        self._timer.timeout.connect(self._advance)
        if not self._paused:
            self._timer.start()
        self._update_tooltip()

    def set_mission(self, mission):
        self._mission = mission if mission in self.COLORS else "leo"
        self.update()

    def mouseReleaseEvent(self, event):
        if event.button() == Qt.MouseButton.LeftButton and not reduced_motion():
            self._paused = not self._paused
            if self._paused:
                self._timer.stop()
            else:
                self._timer.start()
            self._update_tooltip()
            event.accept()
            return
        super().mouseReleaseEvent(event)

    def _update_tooltip(self):
        state = "resume" if self._paused else "pause"
        self.setToolTip(f"Decorative mission orbit · click to {state}")
        self.setAccessibleDescription(f"Click to {state} the decorative orbit animation")

    def _advance(self):
        if self.isVisible():
            self._angle = (self._angle + 0.075) % (2 * pi)
            self.update()

    def paintEvent(self, event):
        painter = QPainter(self)
        painter.setRenderHint(QPainter.RenderHint.Antialiasing)
        center = QPointF(self.width() / 2, self.height() / 2)
        accent = QColor(self.COLORS[self._mission])
        painter.setPen(QPen(QColor(accent.red(), accent.green(), accent.blue(), 65), 1.0))
        painter.drawEllipse(QRectF(7, 8, 64, 28))
        painter.drawEllipse(QRectF(17, 5, 44, 34))
        painter.setPen(Qt.PenStyle.NoPen)
        painter.setBrush(QColor(37, 74, 108, 230))
        painter.drawEllipse(center, 6.5, 6.5)
        painter.setBrush(QColor(104, 222, 200, 190))
        painter.drawEllipse(center + QPointF(-1.5, -1.5), 2.5, 2.5)
        satellite = QPointF(
            center.x() + cos(self._angle) * 31,
            center.y() + sin(self._angle) * 13,
        )
        painter.setBrush(accent)
        painter.drawEllipse(satellite, 3.0, 3.0)
        painter.setBrush(QColor(accent.red(), accent.green(), accent.blue(), 42))
        painter.drawEllipse(satellite, 6.0, 6.0)
        painter.end()
