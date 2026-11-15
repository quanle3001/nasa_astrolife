"""Low-cost decorative starfield rendered with QPainter."""

import os
import random
from math import cos, sin

from PySide6.QtCore import QPointF, QTimer, Qt
from PySide6.QtGui import QColor, QPainter, QRadialGradient
from PySide6.QtWidgets import QWidget


class Starfield(QWidget):
    """A restrained, non-interactive background that pauses while hidden."""

    def __init__(self, parent=None, star_count=72):
        super().__init__(parent)
        self.setObjectName("starfield")
        self.setAttribute(Qt.WidgetAttribute.WA_TransparentForMouseEvents)
        self.setAutoFillBackground(False)
        rng = random.Random(2701)
        self._stars = [
            (QPointF(rng.random(), rng.random()), rng.uniform(0.45, 1.45), rng.randrange(90, 205))
            for _ in range(star_count)
        ]
        self._phase = 0.0
        self._reduced_motion = os.getenv("ASTROTIP_REDUCED_MOTION", "").lower() in {"1", "true", "yes"}
        self._timer = QTimer(self)
        self._timer.setInterval(120)
        self._timer.timeout.connect(self._advance)
        if not self._reduced_motion:
            self._timer.start()

    def _advance(self):
        if self.isVisible():
            self._phase = (self._phase + 0.018) % 6.283
            self.update()

    def paintEvent(self, event):
        painter = QPainter(self)
        painter.setRenderHint(QPainter.RenderHint.Antialiasing)
        # Space Portfolio-inspired atmospheric depth, rendered natively. The
        # gradients drift a few pixels only, so panels stay calm and readable.
        cyan_x = self.width() * (0.78 + (0 if self._reduced_motion else sin(self._phase) * 0.025))
        cyan_y = self.height() * (0.18 + (0 if self._reduced_motion else cos(self._phase) * 0.02))
        cyan = QRadialGradient(QPointF(cyan_x, cyan_y), max(260.0, self.width() * 0.42))
        cyan.setColorAt(0.0, QColor(23, 120, 155, 48))
        cyan.setColorAt(0.45, QColor(18, 76, 112, 22))
        cyan.setColorAt(1.0, QColor(7, 12, 24, 0))
        painter.fillRect(self.rect(), cyan)
        purple_x = self.width() * (0.38 + (0 if self._reduced_motion else cos(self._phase * 0.7) * 0.02))
        purple_y = self.height() * 0.82
        purple = QRadialGradient(QPointF(purple_x, purple_y), max(220.0, self.width() * 0.34))
        purple.setColorAt(0.0, QColor(90, 51, 150, 38))
        purple.setColorAt(0.55, QColor(46, 35, 105, 18))
        purple.setColorAt(1.0, QColor(7, 12, 24, 0))
        painter.fillRect(self.rect(), purple)
        for index, (position, radius, alpha) in enumerate(self._stars):
            shimmer = 0 if self._reduced_motion else sin(self._phase * 2.2 + index * 0.73) * 18
            painter.setPen(Qt.PenStyle.NoPen)
            painter.setBrush(QColor(170, 220, 245, int(max(45, min(225, alpha + shimmer)))))
            painter.drawEllipse(
                QPointF(position.x() * self.width(), position.y() * self.height()),
                radius,
                radius,
            )
        painter.end()
