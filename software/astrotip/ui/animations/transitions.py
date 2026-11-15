"""Page transitions that respect the optional reduced-motion setting."""

import os

from PySide6.QtCore import QEasingCurve, QPropertyAnimation
from PySide6.QtWidgets import QGraphicsOpacityEffect


def reduced_motion():
    return os.getenv("ASTROTIP_REDUCED_MOTION", "").lower() in {"1", "true", "yes"}


def fade_in(widget, duration=180):
    """Fade in a page without delaying content or urgent alerts."""
    if reduced_motion() or not widget:
        return None
    effect = widget.graphicsEffect()
    if not isinstance(effect, QGraphicsOpacityEffect):
        effect = QGraphicsOpacityEffect(widget)
        widget.setGraphicsEffect(effect)
    animation = QPropertyAnimation(effect, b"opacity", widget)
    animation.setStartValue(0.76)
    animation.setEndValue(1.0)
    animation.setDuration(duration)
    animation.setEasingCurve(QEasingCurve.Type.OutCubic)
    animation.start(QPropertyAnimation.DeletionPolicy.DeleteWhenStopped)
    widget._page_fade_animation = animation
    return animation
