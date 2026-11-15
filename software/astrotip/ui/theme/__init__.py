"""AstroLife visual system."""

from astrotip.ui.theme.styles import APP_STYLESHEET


def apply_base_theme(app):
    """Apply Qt-Material's maintained widget baseline before AstroLife QSS."""
    try:
        from qt_material import apply_stylesheet
    except ImportError:
        return False
    apply_stylesheet(app, theme="dark_purple.xml")
    return True


__all__ = ["APP_STYLESHEET", "apply_base_theme"]
