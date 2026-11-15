"""Live ESP32 monitor with explicit connection and freshness states."""

from time import monotonic

from PySide6.QtCore import QTimer, Signal, Slot
from PySide6.QtWidgets import QComboBox, QFrame, QGroupBox, QHBoxLayout, QPushButton, QScrollArea, QVBoxLayout, QWidget

from astrotip.analysis.rules import assess
from astrotip.analysis.reading_stability import ReadingStability
from astrotip.analysis.optical_quality import OpticalSignalQuality
from astrotip.inputs.sensor_serial import SerialReader, available_ports
from astrotip.models.health_indicator import CheckIn
from astrotip.ui.common import browser, label, live_guidance_html, simple_summary
from astrotip.ui.icons import space_icon
from astrotip.ui.optical_waveform import OpticalWaveform


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
        self.stability = ReadingStability()
        self.optical_quality = OpticalSignalQuality()
        self.reading_state = "waiting"
        outer = QVBoxLayout(self)
        outer.setContentsMargins(0, 0, 0, 0)
        # Keep existing urgent guidance visible even while scrolling the graph.
        self.urgent_notice = label("", "urgentBanner")
        self.urgent_notice.hide()
        outer.addWidget(self.urgent_notice)
        scroll = QScrollArea()
        scroll.setWidgetResizable(True)
        content = QWidget()
        layout = QVBoxLayout(content)
        scroll.setWidget(content)
        outer.addWidget(scroll)
        heading = QHBoxLayout()
        heading.addWidget(label("Live health", "pageTitle"), 1)
        heading.addWidget(label("Rest your fingertip directly on the lit sensor window. Keep your hand still.", "subtitle"), 2)
        layout.addLayout(heading)
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
        layout.addLayout(controls)
        self.status = label("Disconnected", "connectionStatus")
        layout.addWidget(self.status)
        self.quality = label("No reading received", "subtitle")
        layout.addWidget(self.quality)
        monitor = QFrame()
        monitor.setObjectName("monitorCard")
        monitor_layout = QHBoxLayout(monitor)
        monitor_layout.setContentsMargins(16, 12, 16, 10)
        self.waveform = OpticalWaveform()
        monitor_layout.addWidget(self.waveform, 1)
        metrics = QWidget()
        metrics.setMinimumWidth(165)
        metrics.setMaximumWidth(225)
        metric_layout = QVBoxLayout(metrics)
        metric_layout.addWidget(label("PULSE", "pulseCaption"))
        self.heart_rate = label("—", "pulseValue", word_wrap=False)
        self.heart_rate.setAccessibleName("Latest pulse estimate in beats per minute")
        metric_layout.addWidget(self.heart_rate)
        metric_layout.addWidget(label("beats / min", "metricUnit"))
        metric_layout.addStretch()
        metric_layout.addWidget(label("BLOOD OXYGEN", "oxygenCaption"))
        self.spo2 = label("—", "oxygenValue", word_wrap=False)
        self.spo2.setAccessibleName("Latest blood oxygen estimate in percent")
        metric_layout.addWidget(self.spo2)
        metric_layout.addWidget(label("% · estimated", "metricUnit"))
        monitor_layout.addWidget(metrics)
        layout.addWidget(monitor)
        self.result = browser()
        self.result.setMinimumHeight(100)
        self.result.setMaximumHeight(120)
        self.result.setAccessibleName("Live sensor analysis and next steps")
        layout.addWidget(self.result, 1)
        actions = QHBoxLayout()
        self.snapshot_button = QPushButton("Review this reading")
        self.snapshot_button.setToolTip("Review the latest sensor estimate shown above.")
        self.snapshot_button.setEnabled(False)
        self.snapshot_button.clicked.connect(self.snapshot)
        actions.addWidget(self.snapshot_button)
        actions.addStretch()
        self.details_button = QPushButton("Sensor details")
        self.details_button.setCheckable(True)
        actions.addWidget(self.details_button)
        layout.addLayout(actions)
        self.details = QGroupBox("Sensor details")
        details_layout = QVBoxLayout(self.details)
        self.technical_details = label("Connect a sensor to see its details.", "subtitle")
        details_layout.addWidget(self.technical_details)
        self.details.hide()
        self.details_button.toggled.connect(self.details.setVisible)
        self.details_button.toggled.connect(self.waveform.set_details_visible)
        layout.addWidget(self.details)
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
            self.status.setText("No sensor found. Check the USB data cable, then select Refresh ports.")

    def toggle_connection(self):
        if self.reader is not None:
            self.disconnect_sensor()
            return
        port = self.ports.currentText().split(" · ", 1)[0].strip()
        if not port:
            self.status.setText("Select or enter the ESP32 COM port first.")
            return
        self.active_port = port
        self.optical_quality.reset()
        self.waveform.clear()
        self.invalidate("Waiting for the first complete report.")
        self.status.setText(f"Connecting · {port}")
        self.ports.setEnabled(False)
        self.refresh_button.setEnabled(False)
        self.connect_button.setText("Disconnect")
        self.connection_started = monotonic()
        worker = self.reader_factory(port, self)
        self.reader = worker
        # Ignore queued samples/errors after Disconnect or from an old session.
        worker.reading_received.connect(self._on_reading)
        worker.optical_sample_received.connect(self._on_sample)
        worker.status_changed.connect(self._on_status)
        worker.connected.connect(self._on_connected)
        worker.finished.connect(self._on_finished)
        worker.start()

    def _current_sender(self):
        return self.sender() is self.reader and self.reader is not None and not self.reader.isInterruptionRequested()

    @Slot(object)
    def _on_reading(self, reading):
        if self._current_sender():
            self.receive_reading(reading)

    @Slot(object)
    def _on_sample(self, sample):
        if self._current_sender():
            self.receive_optical_sample(sample)

    @Slot(str)
    def _on_status(self, message):
        if self._current_sender():
            self.device_status(message)

    @Slot()
    def _on_connected(self):
        if self._current_sender():
            self.status.setText(f"Connected · {self.active_port}")

    @Slot()
    def _on_finished(self):
        self.connection_finished(self.sender())

    def disconnect_sensor(self):
        self.optical_quality.reset()
        self.waveform.clear("Sensor disconnected · no live signal")
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
        self.optical_quality.reset()
        self.waveform.clear("Connection closed · reconnect to see the signal")
        if requested:
            self.status.setText("Disconnected")
        self.invalidate("Connection closed. Reconnect to obtain a fresh reading.")

    def device_status(self, message):
        self.optical_quality.reset(keep_stream=True)
        self.waveform.clear("Sensor interrupted · waiting for a fresh signal")
        self.technical_details.setText(message)
        self.status.setText("Sensor interrupted · reconnect if it does not recover")
        self.invalidate("Waiting for a fresh reading.")

    def invalidate(self, message):
        self.stability.reset()
        self.reading_state = "waiting"
        self.urgent_notice.hide()
        self.latest_checkin = None
        self.last_received = None
        self.snapshot_button.setEnabled(False)
        self.heart_rate.setText("—")
        self.spo2.setText("—")
        self.heart_rate.setStyleSheet("")
        self.spo2.setStyleSheet("")
        self.quality.setText(message)
        self.quality.setStyleSheet("")
        self.result.setPlainText("What to do\nRest your fingertip directly on the lit sensor window. Use light contact and keep your hand still.")

    def receive_optical_sample(self, sample):
        self.optical_quality.add_sample(sample)
        self.waveform.add_sample(sample)
        if sample.infrared <= 50000 or sample.red == 0 or max(sample.red, sample.infrared) >= 262143:
            if self.latest_checkin is not None:
                self.invalidate("Reposition your finger gently, then hold still.")

    def receive_reading(self, reading):
        now = monotonic()
        self.waveform.add_report(reading)
        self.status.setText(f"Connected · {self.active_port}")
        rate = f"{reading.sample_rate_hz:g} samples/s" if reading.sample_rate_hz is not None else "Sample rate unavailable (older firmware)"
        optical_state = self.optical_quality.evaluate(reading.elapsed_seconds)
        raw_pulse = f"{reading.heart_rate:g} bpm" if reading.heart_rate is not None else "unavailable"
        raw_oxygen = f"{reading.spo2:g}%" if reading.spo2 is not None else "unavailable"
        self.technical_details.setText(
            f"{self.active_port} · 115200 baud · {reading.firmware_version or 'Older report-only firmware'}\n"
            f"{rate} · window: {reading.signal_status or 'not reported'}\n"
            f"Raw red: {reading.red} · raw infrared: {reading.infrared}\n"
            f"Latest unaveraged estimates: pulse {raw_pulse} · oxygen {raw_oxygen}\n"
            f"Optical check: {optical_state}\n"
            "Display, alerts and review use the latest unaveraged estimates. These checks do not prove accuracy."
        )
        if not reading.usable:
            message = "Rest your fingertip directly on the sensor." if not reading.finger_detected else "Collecting a fresh reading · hold still for a few seconds"
            if reading.signal_status == "clipped":
                message = "Signal too strong · reposition your finger gently"
            elif reading.signal_status == "timing":
                message = "Sensor timing problem · reconnect the sensor"
            self.invalidate(message)
            self.last_received = now
            return
        self.last_received = now
        self.reading_state = self.stability.update(reading, signal_ready=optical_state in {"ready", "unavailable"})
        self.latest_checkin = CheckIn(
            heart_rate=reading.heart_rate, spo2=reading.spo2,
            # Firmware validity is not a clinically validated signal-quality score.
            signal_quality="poor" if self.reading_state in {"changing", "settling"} else "unknown", input_source="sensor", sensor_port=self.active_port,
            sensor_received_at=reading.received_at,
        )
        self.quality.setText("Live estimates · keep gentle contact and your hand relaxed")
        self.quality.setStyleSheet("")
        self.technical_details.setText(self.technical_details.text() + f"\nReport consistency: {self.reading_state}")
        assessment = assess(self.latest_checkin, self.catalog)
        # Show the firmware's latest eligible estimate directly. Consistency
        # diagnostics must not hide, hold, or adjust it toward a normal value.
        self.heart_rate.setText(f"{reading.heart_rate:g}" if reading.heart_rate is not None else "—")
        self.spo2.setText(f"{reading.spo2:g}" if reading.spo2 is not None else "—")
        self.heart_rate.setStyleSheet("color: #ffc978;" if self.reading_state == "changing" else "")
        oxygen_color = "#ff7e8c" if assessment.level == "urgent" else (
            "#ffc978" if assessment.level == "review" or self.reading_state == "changing" else ""
        )
        self.spo2.setStyleSheet(f"color: {oxygen_color};" if oxygen_color else "")
        self.urgent_notice.setText(simple_summary(assessment))
        self.urgent_notice.setVisible(assessment.level == "urgent")
        self.result.setHtml(live_guidance_html(self.latest_checkin, assessment))
        self.snapshot_button.setEnabled(True)

    def check_freshness(self):
        self.waveform.check_freshness()
        reference = self.last_received if self.last_received is not None else self.connection_started
        if reference is not None and monotonic() - reference > self.STALE_SECONDS:
            self.optical_quality.reset(keep_stream=True)
            self.invalidate("No reading for 8 seconds · check the sensor connection")
            self.status.setText("Signal paused")

    def snapshot(self):
        self.check_freshness()
        if self.latest_checkin is not None:
            self.snapshot_requested.emit(self.latest_checkin)

    def shutdown(self):
        self.timer.stop()
        self.waveform.timer.stop()
        if self.reader is not None:
            self.reader.requestInterruption()
            return self.reader.wait(1500)
        return True
