"""Accessible, offline-first visual mission selector."""

import json
from html import escape
from pathlib import Path

from PySide6.QtCore import Property, QEasingCurve, QPropertyAnimation, Qt, QUrl, Signal
from PySide6.QtGui import QColor, QDesktopServices, QKeyEvent, QLinearGradient, QPainter, QPainterPath, QPen, QPixmap
from PySide6.QtWidgets import (
    QDialog, QFrame, QHBoxLayout, QLabel, QPushButton, QScrollArea,
    QTextBrowser, QVBoxLayout, QWidget,
)

from astrotip.ui.animations.transitions import fade_in
from astrotip.ui.icons import space_icon


ASSET_ROOT = Path(__file__).resolve().parents[3] / "assets" / "nasa"
MANIFEST_PATH = ASSET_ROOT / "media_manifest.json"

MISSION_PRESENTATION = {
    "leo": {
        "title": "LOW EARTH ORBIT",
        "subtitle": "Orbital operations",
        "detail": "Earth limb · ISS context",
        "accent": "#48D5E9",
        "fallback": "images/leo.jpg",
    },
    "lunar": {
        "title": "LUNAR MISSION",
        "subtitle": "Surface operations",
        "detail": "Apollo surface reference",
        "accent": "#B9D8F2",
        "fallback": "images/lunar.jpg",
    },
    "mars": {
        "title": "MARS / DEEP SPACE",
        "subtitle": "Expedition operations",
        "detail": "Jezero Crater · Perseverance",
        "accent": "#E5A16C",
        "fallback": "images/mars.jpg",
    },
}


def load_media_manifest():
    try:
        data = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
        return {entry["mission"]: entry for entry in data.get("assets", [])}
    except (OSError, ValueError, KeyError, TypeError):
        return {}


class MissionCard(QFrame):
    selected = Signal(str)
    preview_requested = Signal(str)

    def __init__(self, mission, media=None, parent=None):
        super().__init__(parent)
        self.mission = mission
        self.presentation = MISSION_PRESENTATION[mission]
        self.media = media or {}
        self._selected = False
        self._hover_strength = 0.0
        self.setMinimumSize(228, 178)
        self.setMaximumHeight(205)
        self.setCursor(Qt.CursorShape.PointingHandCursor)
        self.setFocusPolicy(Qt.FocusPolicy.StrongFocus)
        self.setAccessibleName(f"Select {self.presentation['title']}")
        self.setAccessibleDescription("Single-click to select. Double-click to open the NASA mission briefing.")
        self.setToolTip("Select mission · Double-click for NASA media briefing")
        image_path = ASSET_ROOT / self.media.get("local_path", self.presentation["fallback"])
        self._pixmap = QPixmap(str(image_path))
        layout = QVBoxLayout(self)
        layout.setContentsMargins(16, 14, 16, 14)
        top = QHBoxLayout()
        self.badge = QLabel("MISSION CONTEXT")
        self.badge.setStyleSheet(
            "color: rgba(242,247,255,210); font-size: 7pt; font-weight: 700; letter-spacing: 1px;"
        )
        top.addWidget(self.badge)
        top.addStretch()
        self.explore = QLabel("↗ EXPLORE")
        self.explore.setStyleSheet(
            f"color: {self.presentation['accent']}; font-size: 7pt; font-weight: 750; letter-spacing: 1px;"
        )
        self.explore.hide()
        top.addWidget(self.explore)
        layout.addLayout(top)
        layout.addStretch()
        self.title = QLabel(self.presentation["title"])
        self.title.setStyleSheet("color: white; font-size: 13pt; font-weight: 750;")
        self.title.setWordWrap(True)
        layout.addWidget(self.title)
        self.subtitle = QLabel(self.presentation["detail"])
        self.subtitle.setStyleSheet("color: rgba(235,244,255,210); font-size: 8pt;")
        self.subtitle.setWordWrap(True)
        layout.addWidget(self.subtitle)
        self._animation = QPropertyAnimation(self, b"hoverStrength", self)
        self._animation.setDuration(170)
        self._animation.setEasingCurve(QEasingCurve.Type.OutCubic)

    def get_hover_strength(self):
        return self._hover_strength

    def set_hover_strength(self, value):
        self._hover_strength = float(value)
        self.update()

    hoverStrength = Property(float, get_hover_strength, set_hover_strength)

    def set_selected(self, selected):
        self._selected = bool(selected)
        self.badge.setText("● ACTIVE MISSION" if self._selected else "MISSION CONTEXT")
        self.update()

    def _animate(self, target):
        self._animation.stop()
        self._animation.setStartValue(self._hover_strength)
        self._animation.setEndValue(target)
        self._animation.start()

    def enterEvent(self, event):
        self.explore.show()
        self._animate(1.0)
        super().enterEvent(event)

    def leaveEvent(self, event):
        if not self.hasFocus():
            self.explore.hide()
        self._animate(0.0)
        super().leaveEvent(event)

    def focusInEvent(self, event):
        self.explore.show()
        self._animate(1.0)
        super().focusInEvent(event)

    def focusOutEvent(self, event):
        self.explore.hide()
        self._animate(0.0)
        super().focusOutEvent(event)

    def mouseReleaseEvent(self, event):
        if event.button() == Qt.MouseButton.LeftButton and self.rect().contains(event.position().toPoint()):
            self.selected.emit(self.mission)
        super().mouseReleaseEvent(event)

    def mouseDoubleClickEvent(self, event):
        if event.button() == Qt.MouseButton.LeftButton:
            self.preview_requested.emit(self.mission)
            event.accept()
            return
        super().mouseDoubleClickEvent(event)

    def keyPressEvent(self, event: QKeyEvent):
        if event.key() == Qt.Key.Key_P or (
            event.key() in (Qt.Key.Key_Return, Qt.Key.Key_Enter)
            and event.modifiers() & Qt.KeyboardModifier.ControlModifier
        ):
            self.preview_requested.emit(self.mission)
            event.accept()
            return
        if event.key() in (Qt.Key.Key_Return, Qt.Key.Key_Enter, Qt.Key.Key_Space):
            self.selected.emit(self.mission)
            event.accept()
            return
        super().keyPressEvent(event)

    def paintEvent(self, event):
        painter = QPainter(self)
        painter.setRenderHint(QPainter.RenderHint.Antialiasing)
        path = QPainterPath()
        path.addRoundedRect(self.rect().adjusted(1, 1, -1, -1), 14, 14)
        painter.setClipPath(path)
        if not self._pixmap.isNull():
            scaled = self._pixmap.scaled(
                self.size(), Qt.AspectRatioMode.KeepAspectRatioByExpanding,
                Qt.TransformationMode.SmoothTransformation,
            )
            x = (scaled.width() - self.width()) // 2
            y = (scaled.height() - self.height()) // 2
            painter.drawPixmap(0, 0, scaled, x, y, self.width(), self.height())
        else:
            painter.fillPath(path, QColor("#172B48"))
        overlay = QLinearGradient(0, 0, 0, self.height())
        overlay.setColorAt(0, QColor(5, 13, 25, int(72 - 20 * self._hover_strength)))
        overlay.setColorAt(0.55, QColor(5, 13, 25, 92))
        overlay.setColorAt(1, QColor(5, 10, 20, 235))
        painter.fillPath(path, overlay)
        accent = QColor(self.presentation["accent"])
        if self._selected:
            painter.fillRect(0, self.height() - 4, self.width(), 4, accent)
        pen = QPen(accent if self._selected or self.hasFocus() else QColor(74, 100, 128))
        pen.setWidthF(2.0 if self._selected else 1.0 + self._hover_strength)
        painter.setPen(pen)
        painter.setBrush(Qt.BrushStyle.NoBrush)
        painter.drawPath(path)
        painter.end()


class ScaledImageLabel(QLabel):
    def __init__(self, pixmap, parent=None):
        super().__init__(parent)
        self._source = pixmap
        self.setObjectName("previewImage")
        self.setMinimumSize(430, 390)
        self.setAlignment(Qt.AlignmentFlag.AlignCenter)

    def resizeEvent(self, event):
        super().resizeEvent(event)
        if not self._source.isNull():
            self.setPixmap(self._source.scaled(
                self.contentsRect().size(),
                Qt.AspectRatioMode.KeepAspectRatio,
                Qt.TransformationMode.SmoothTransformation,
            ))


class MissionPreviewDialog(QDialog):
    """Enlarged, attributed NASA media view; decorative context only."""

    def __init__(self, mission, media, parent=None):
        super().__init__(parent)
        presentation = MISSION_PRESENTATION[mission]
        self.setObjectName("missionPreview")
        self.setWindowTitle(f"AstroLife · {presentation['title']} mission briefing")
        self.setAttribute(Qt.WidgetAttribute.WA_DeleteOnClose)
        self.resize(980, 620)
        self.setMinimumSize(760, 500)
        outer = QVBoxLayout(self)
        outer.setContentsMargins(18, 18, 18, 18)
        panel = QFrame()
        panel.setObjectName("missionPreviewPanel")
        body = QHBoxLayout(panel)
        body.setContentsMargins(18, 18, 18, 18)
        body.setSpacing(22)
        image_path = ASSET_ROOT / media.get("local_path", presentation["fallback"])
        body.addWidget(ScaledImageLabel(QPixmap(str(image_path))), 3)
        copy = QVBoxLayout()
        eyebrow = QLabel("NASA MISSION MEDIA / DECORATIVE CONTEXT")
        eyebrow.setObjectName("eyebrow")
        copy.addWidget(eyebrow)
        title = QLabel(presentation["title"])
        title.setObjectName("pageTitle")
        title.setWordWrap(True)
        copy.addWidget(title)
        classification = media.get("classification", "NASA mission image")
        badge = QLabel(classification.upper())
        badge.setObjectName("statusPill")
        badge.setWordWrap(True)
        copy.addWidget(badge)
        details = QTextBrowser()
        details.setOpenExternalLinks(True)
        details.setHtml(
            f"<h2>{escape(media.get('title', presentation['detail']))}</h2>"
            f"<p>{escape(media.get('description', 'Bundled offline NASA mission imagery.'))}</p>"
            f"<p><b>NASA asset ID:</b> {escape(media.get('nasa_id', 'Unavailable'))}<br>"
            f"<b>Credit:</b> NASA / {escape(media.get('credit', 'NASA'))}<br>"
            f"<b>Date:</b> {escape(media.get('date_created', 'Not recorded'))}</p>"
            "<p style='color:#8FA3BA'>Mission imagery is decorative and does not affect health assessment rules. "
            "NASA does not endorse AstroLife.</p>"
        )
        copy.addWidget(details, 1)
        actions = QHBoxLayout()
        source = QPushButton("Open NASA source  ↗")
        source.setIcon(space_icon("fa6s.arrow-up-right-from-square", color="#07131C", active="#07131C"))
        source.setObjectName("primaryButton")
        source_url = media.get("source_url", "")
        source.setEnabled(bool(source_url))
        source.clicked.connect(lambda: QDesktopServices.openUrl(QUrl(source_url)))
        actions.addWidget(source)
        close = QPushButton("Close")
        close.setIcon(space_icon("fa6s.xmark"))
        close.clicked.connect(self.close)
        actions.addWidget(close)
        copy.addLayout(actions)
        body.addLayout(copy, 2)
        outer.addWidget(panel)
        fade_in(self, 240)


class MissionGallery(QWidget):
    mission_changed = Signal(str)

    def __init__(self, parent=None):
        super().__init__(parent)
        manifest = load_media_manifest()
        outer = QVBoxLayout(self)
        outer.setContentsMargins(0, 0, 0, 0)
        heading = QHBoxLayout()
        title = QLabel("CHOOSE MISSION CONTEXT")
        title.setObjectName("microLabel")
        heading.addWidget(title)
        heading.addStretch()
        self.credit = QLabel("")
        self.credit.setObjectName("microLabel")
        self.credit.setOpenExternalLinks(True)
        self.credit.setTextFormat(Qt.TextFormat.RichText)
        heading.addWidget(self.credit)
        outer.addLayout(heading)
        scroll = QScrollArea()
        scroll.setWidgetResizable(True)
        scroll.setHorizontalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAsNeeded)
        scroll.setVerticalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAlwaysOff)
        scroll.setMinimumHeight(196)
        content = QWidget()
        row = QHBoxLayout(content)
        row.setContentsMargins(0, 5, 0, 5)
        row.setSpacing(12)
        self.cards = {}
        for mission in ("leo", "lunar", "mars"):
            card = MissionCard(mission, manifest.get(mission))
            card.selected.connect(self.set_mission)
            card.preview_requested.connect(self.show_preview)
            self.cards[mission] = card
            row.addWidget(card, 1)
        scroll.setWidget(content)
        outer.addWidget(scroll)
        self._manifest = manifest
        self.set_mission("leo", emit=False)

    def show_preview(self, mission):
        if mission not in self.cards:
            return
        self.set_mission(mission)
        self._preview = MissionPreviewDialog(mission, self._manifest.get(mission, {}), self.window())
        self._preview.show()

    def set_mission(self, mission, emit=True):
        if mission not in self.cards:
            return
        for key, card in self.cards.items():
            card.set_selected(key == mission)
        media = self._manifest.get(mission, {})
        credit = media.get("credit", "NASA media · offline fallback")
        asset_id = media.get("nasa_id", "")
        text = f"NASA / {credit} · {asset_id}".strip(" ·")
        source_url = media.get("source_url", "")
        self.credit.setText(f'<a style="color:#8EDCE8" href="{escape(source_url)}">{escape(text)}</a>' if source_url else escape(text))
        self.credit.setToolTip(
            f"{media.get('title', 'NASA mission image')}\n{media.get('classification', '')}\n{source_url}".strip()
        )
        if emit:
            self.mission_changed.emit(mission)
