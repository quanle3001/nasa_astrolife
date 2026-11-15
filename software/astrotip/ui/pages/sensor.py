"""Live ESP32 monitor with explicit connection and freshness states."""

from time import monotonic

from PySide6.QtCore import QTimer, Signal
from PySide6.QtWidgets import QComboBox, QFrame, QHBoxLayout, QPushButton, QVBoxLayout, QWidget

from astrotip.analysis.rules import assess
from astrotip.inputs.sensor_serial import SerialReader, available_ports
from astrotip.models.health_indicator import CheckIn
from astrotip.ui.common import assessment_html, browser, label
from astrotip.ui.icons import space_icon
from astrotip.ui.widgets.telemetry_card import TelemetryCard


class SensorPage(QWidget):
    snapshot_requested = Signal(object)
    STALE_SECONDS = 8

    def __init__(self, catalog, parent=None, reader_factory=SerialReader):
        super().__init__(parent)
        self.catalog = catalog
        self.reader_factory = reader_factory
        self.reader = None
        self.latest_checkin = None
        self.last_received = None
        self.connection_started = None
        self.active_port = ""
        layout = QVBoxLayout(self)
        layout.setContentsMargins(4, 4, 4, 4)
        layout.setSpacing(10)
        layout.addWidget(label("BIOMEDICAL TELEMETRY", "eyebrow", False))
        layout.addWidget(label("Live sensor monitor", "pageTitle"))
        layout.addWidget(label("Connect your ESP32, then rest a finger on the MAX30102 optical sensor.", "subtitle"))
        connection_panel = QFrame()
        connection_panel.setObjectName("panel")
        connection_layout = QVBoxLayout(connection_panel)
        connection_layout.setContentsMargins(15, 13, 15, 13)
        connection_layout.addWidget(label("SENSOR LINK  /  ESP32 + MAX30102", "microLabel", False))
        controls = QHBoxLayout()
        self.ports = QComboBox()
        self.ports.setEditable(True)
        self.ports.setAccessibleName("ESP32 serial port")
        self.ports.lineEdit().setPlaceholderText("Select or enter a COM port")
        controls.addWidget(self.ports, 1)
        self.refresh_button = QPushButton("Refresh ports")
        self.refresh_button.setIcon(space_icon("fa6s.rotate"))
        self.refresh_button.clicked.connect(self.refresh_ports)
        controls.addWidget(self.refresh_button)
        self.connect_button = QPushButton("Connect")
        self.connect_button.setIcon(space_icon("fa6s.plug"))
        self.connect_button.setObjectName("primaryButton")
        self.connect_button.clicked.connect(self.toggle_connection)
        controls.addWidget(self.connect_button)
        connection_layout.addLayout(controls)
        self.status = label("Disconnected", "summaryBanner")
        connection_layout.addWidget(self.status)
        layout.addWidget(connection_panel)
        metrics = QHBoxLayout()
        self.heart_rate = TelemetryCard("Heart rate", "fa6s.heart-pulse", unit="bpm", fallback_icon="♥")
        self.spo2 = TelemetryCard("Estimated SpO₂", "fa6s.droplet", unit="%", fallback_icon="O₂")
        metrics.addWidget(self.heart_rate, 1)
        metrics.addWidget(self.spo2, 1)
        layout.addLayout(metrics)
        self.quality = label("No reading received", "subtitle")
        layout.addWidget(self.quality)
        self.result = browser()
        self.result.setAccessibleName("Live sensor analysis and next steps")
        self.result.setMinimumHeight(130)
        layout.addWidget(self.result, 1)
        self.snapshot_button = QPushButton("Review / save this reading")
        self.snapshot_button.setIcon(space_icon("fa6s.wave-square"))
        self.snapshot_button.setEnabled(False)
        self.snapshot_button.clicked.connect(self.snapshot)
        layout.addWidget(self.snapshot_button)
        layout.addWidget(label(
            "Experimental estimates only. Keep your finger still; unavailable values mean the device could not obtain a usable estimate.",
            "subtitle",
        ))
        self.timer = QTimer(self)
        self.timer.setInterval(1000)
        self.timer.timeout.connect(self.check_freshness)
        self.timer.start()
        self.invalidate("Connect the sensor to start receiving readings.")
        self.refresh_ports()

    def refresh_ports(self):
        previous = self.ports.currentText()
        self.ports.clear()
        try:
            ports = available_ports()
        except OSError as exc:
            ports = []
            self.status.setText(f"Could not list ports: {exc}")
        for port, description in ports:
            self.ports.addItem(f"{port} · {description}", port)
        if previous:
            self.ports.setCurrentText(previous)
        if not ports:
            self.status.setText("No serial ports found. Check the USB data cable and Device Manager, then refresh or enter the port manually.")

    def toggle_connection(self):
        if self.reader is not None:
            self.disconnect_sensor()
            return
        port = self.ports.currentText().split(" · ", 1)[0].strip()
        if not port:
            self.status.setText("Select or enter the ESP32 COM port first.")
            return
        self.active_port = port
        self.invalidate("Waiting for the first complete report.")
        self.status.setText(f"Connecting to {port} at 115200 baud…")
        self.ports.setEnabled(False)
        self.refresh_button.setEnabled(False)
        self.connect_button.setText("Disconnect")
        self.connection_started = monotonic()
        worker = self.reader_factory(port, self)
        self.reader = worker
        # Ignore queued samples/errors after Disconnect or from an old session.
        worker.reading_received.connect(lambda reading: self.receive_reading(reading) if self.reader is worker and not worker.isInterruptionRequested() else None)
        worker.status_changed.connect(lambda text: self.device_status(text) if self.reader is worker and not worker.isInterruptionRequested() else None)
        worker.connected.connect(lambda: self.status.setText(f"Connected to {port} · waiting for sensor data") if self.reader is worker and not worker.isInterruptionRequested() else None)
        worker.finished.connect(lambda: self.connection_finished(worker))
        worker.start()

    def disconnect_sensor(self):
        if self.reader is not None:
            self.reader.requestInterruption()
            self.connect_button.setEnabled(False)
            self.status.setText("Disconnecting…")
        self.invalidate("Sensor disconnected. No current reading is available.")

    def connection_finished(self, worker):
        if self.reader is not worker:
            return
        requested = worker.isInterruptionRequested()
        self.reader = None
        worker.deleteLater()
        self.ports.setEnabled(True)
        self.refresh_button.setEnabled(True)
        self.connect_button.setEnabled(True)
        self.connect_button.setText("Connect")
        self.connection_started = None
        if requested:
            self.status.setText("Disconnected")
        self.invalidate("Connection closed. Reconnect to obtain a fresh reading.")

    def device_status(self, message):
        self.status.setText(message)
        self.invalidate(message)

    def invalidate(self, message):
        self.latest_checkin = None
        self.last_received = None
        self.snapshot_button.setEnabled(False)
        self.heart_rate.setText("Heart rate\n— bpm")
        self.spo2.setText("Estimated SpO₂\n— %")
        self.quality.setText(message)
        self.result.setPlainText("No current measurement to analyze. Missing readings do not establish that you are healthy.")

    def receive_reading(self, reading):
        now = monotonic()
        self.status.setText(f"Receiving from {self.active_port} · 115200 baud")
        if not reading.usable:
            self.invalidate("Place your finger on the sensor and hold still." if not reading.finger_detected else "Finger detected; estimates are not yet valid. Hold still while the sensor collects more samples.")
            self.last_received = now
            return
        self.last_received = now
        self.latest_checkin = CheckIn(
            heart_rate=reading.heart_rate, spo2=reading.spo2,
            # Firmware validity is not a clinically validated signal-quality score.
            signal_quality="unknown", input_source="sensor", sensor_port=self.active_port,
            sensor_received_at=reading.received_at,
        )
        self.heart_rate.setText(f"Heart rate\n{reading.heart_rate:g} bpm" if reading.heart_rate is not None else "Heart rate\nUnavailable")
        self.spo2.setText(f"Estimated SpO₂\n{reading.spo2:g} %" if reading.spo2 is not None else "Estimated SpO₂\nUnavailable")
        self.quality.setText("Finger detected · updated now · device-valid estimates; clinical accuracy unknown")
        assessment = assess(self.latest_checkin, self.catalog)
        self.result.setHtml(assessment_html(assessment, self.catalog))
        self.snapshot_button.setEnabled(True)

    def check_freshness(self):
        reference = self.last_received if self.last_received is not None else self.connection_started
        if reference is not None and monotonic() - reference > self.STALE_SECONDS:
            self.invalidate("No fresh complete report for 8 seconds. Check the sensor, cable, firmware and serial monitor.")
            self.status.setText("Waiting for fresh sensor data")

    def snapshot(self):
        self.check_freshness()
        if self.latest_checkin is not None:
            self.snapshot_requested.emit(self.latest_checkin)

    def shutdown(self):
        self.timer.stop()
        if self.reader is not None:
            self.reader.requestInterruption()
            return self.reader.wait(1500)
        return True
