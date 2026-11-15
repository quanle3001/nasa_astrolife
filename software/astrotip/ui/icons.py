"""QtAwesome-backed icon system with safe text fallbacks."""

from PySide6.QtGui import QIcon

try:
    import qtawesome as qta
except ImportError:  # The app remains usable while dependencies are being installed.
    qta = None


def space_icon(name, color="#9DB1C8", active="#68DEC8"):
    if qta is None:
        return QIcon()
    try:
        return qta.icon(
            name,
            color=color,
            color_active=active,
            color_selected=active,
            color_disabled="#52657A",
        )
    except Exception:
        return QIcon()
