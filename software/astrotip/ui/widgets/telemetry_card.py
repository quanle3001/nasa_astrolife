"""Compact biomedical telemetry cards."""

from PySide6.QtCore import Qt
from PySide6.QtWidgets import QFrame, QHBoxLayout, QLabel, QVBoxLayout

from astrotip.ui.common import label
from astrotip.ui.icons import space_icon


class TelemetryCard(QFrame):
    """A metric card with a backwards-compatible setText interface."""

    def __init__(self, title, icon, empty_value="—", unit="", fallback_icon="•", parent=None):
        super().__init__(parent)
        self.setObjectName("panel")
        self.setMinimumHeight(152)
        self._title = title
        self._unit = unit
        outer = QVBoxLayout(self)
        outer.setContentsMargins(18, 16, 18, 16)
        heading = QHBoxLayout()
        heading.addWidget(label(title.upper(), "microLabel", False), 1)
        icon_label = label("", "metricIcon", False)
        icon_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        graphic = space_icon(icon, color="#48D5E9", active="#79E4F1")
        if graphic.isNull():
            icon_label.setText(fallback_icon)
        else:
            icon_label.setPixmap(graphic.pixmap(18, 18))
        heading.addWidget(icon_label)
        outer.addLayout(heading)
        value_row = QHBoxLayout()
        self.value_label = QLabel(empty_value)
        self.value_label.setObjectName("metricValue")
        self.value_label.setAccessibleName(title)
        value_row.addWidget(self.value_label)
        self.unit_label = label(unit, "metricUnit", False)
        value_row.addWidget(self.unit_label, 1, Qt.AlignmentFlag.AlignBottom)
        outer.addLayout(value_row)
        self.caption = label("AWAITING TELEMETRY", "microLabel", False)
        outer.addWidget(self.caption)

    def set_value(self, value=None, caption="AWAITING TELEMETRY"):
        self.value_label.setText("—" if value is None else str(value))
        self.caption.setText(caption)

    def setText(self, text):
        """Accept the old two-line metric strings used by SensorPage."""
        lines = str(text).splitlines()
        value = lines[-1] if len(lines) > 1 else lines[0]
        if value.startswith("—"):
            self.set_value(None)
        elif value.lower() == "unavailable":
            self.set_value("Unavailable", "NO VALID ESTIMATE")
        else:
            if self._unit and value.endswith(self._unit):
                value = value[: -len(self._unit)].strip()
            self.set_value(value, "LIVE SENSOR ESTIMATE")

    def text(self):
        return f"{self._title}\n{self.value_label.text()} {self._unit}".strip()
