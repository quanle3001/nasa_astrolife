"""Bounded, live light-intensity plot; never synthesize a pulse or valid vitals."""

from collections import deque
from math import exp
from time import monotonic

import numpy as np
import pyqtgraph as pg
from PySide6.QtCore import QTimer
from PySide6.QtWidgets import QVBoxLayout, QWidget

from astrotip.inputs.sensor_serial import OpticalSample
from astrotip.ui.common import label


class OpticalWaveform(QWidget):
    WINDOW_SECONDS = 10
    MAX_SAMPLES = 1000

    def __init__(self, parent=None):
        super().__init__(parent)
        self.samples = deque(maxlen=self.MAX_SAMPLES)
        self.filtered = deque(maxlen=self.MAX_SAMPLES)
        self.baseline = None
        self.smoothed = None
        self.mode = None
        self.stream_seen = False
        self.pulse_available = None
        self.details_visible = False
        self.last_received = None
        self.dirty = False
        layout = QVBoxLayout(self)
        layout.setContentsMargins(0, 0, 0, 0)
        self.title = label("HEART PULSE", "waveformTitle")
        layout.addWidget(self.title)
        self.status = label("Connect the sensor to see its light signal.", "subtitle")
        layout.addWidget(self.status)
        self.plot = pg.PlotWidget(background="#040c10")
        self.plot.setAccessibleName("Live optical finger pulse over the last ten seconds, not an ECG")
        self.plot.setFixedHeight(220)
        self.plot.setMouseEnabled(x=False, y=False)
        self.plot.setMenuEnabled(False)
        self.plot.hideButtons()
        self.plot.showGrid(x=True, y=True, alpha=0.12)
        self.plot.setLabel("bottom", "Seconds", color="#819b9e")
        self.plot.getAxis("left").setStyle(showValues=False)
        self.plot.setXRange(-self.WINDOW_SECONDS, 0, padding=0)
        self.plot.setYRange(-1, 1)
        self.plot.enableAutoRange(axis="y")
        for axis in ("left", "bottom"):
            self.plot.getAxis(axis).setPen("#20363c")
            self.plot.getAxis(axis).setTextPen("#819b9e")
        self.legend = self.plot.addLegend(offset=(12, 8), labelTextColor="#e5edf8", brush=(4, 12, 16, 230))
        self.red_pen = pg.mkPen("#ff8394", width=2)
        self.ir_pen = pg.mkPen("#4ae8df", width=2)
        self.red_curve = self.plot.plot(name="Red · ~660 nm", pen=self.red_pen, antialias=True)
        self.ir_curve = self.plot.plot(name="Infrared · ~880 nm", pen=self.ir_pen, antialias=True)
        # A separate idle indicator, never a zero-valued sensor measurement.
        self.idle_line = pg.InfiniteLine(pos=0, angle=0, pen=pg.mkPen("#4ae8df", width=2))
        self.plot.addItem(self.idle_line, ignoreBounds=True)
        layout.addWidget(self.plot, 1)
        self.caption = label("Light signal from your fingertip · not an ECG", "subtitle")
        layout.addWidget(self.caption)
        self.set_details_visible(False)
        self.timer = QTimer(self)
        self.timer.setInterval(50)
        self.timer.timeout.connect(self.redraw)
        self.timer.start()
        self.clear("Connect the sensor to begin.")

    def clear(self, message="Waiting for the sensor.", reset_stream=True):
        self.samples.clear()
        self.filtered.clear()
        self.baseline = None
        self.smoothed = None
        self.mode = None
        if reset_stream:
            self.stream_seen = False
            self.pulse_available = None
        self.last_received = None
        self.dirty = False
        self.red_curve.clear()
        self.ir_curve.clear()
        self.idle_line.show()
        self.plot.disableAutoRange(axis="y")
        self.plot.setYRange(-1, 1, padding=0)
        self.title.setText("HEART PULSE")
        self.status.setText("No signal · " + message)

    def set_details_visible(self, visible):
        self.details_visible = visible
        self.red_curve.setVisible(visible)
        self.legend.setVisible(visible)
        self.plot.getAxis("left").setStyle(showValues=visible)
        self.plot.setLabel("left", "Relative light" if visible else "", color="#819b9e")
        self.caption.setText(
            "Stream display: baseline removed, lightly smoothed and inverted. Summary view: centered only. Scale adjusts automatically. "
            "LED wavelengths are specifications; raw samples and vital estimates are unchanged."
            if visible else "Optical pulse measured at your fingertip · flat line means no usable signal, not a stopped heart"
        )

    def add_sample(self, sample):
        self.stream_seen = True
        if sample.infrared <= 50000 or sample.red == 0:
            self.clear("Rest your fingertip directly on the sensor.", reset_stream=False)
            return
        if sample.infrared >= 262143 or sample.red >= 262143:
            self.clear("Signal too strong · reposition your finger gently.", reset_stream=False)
            return
        self._append(sample, "stream")

    def add_report(self, reading):
        # Older firmware reports just one optical pair per health report. Lines
        # connect these sparse readings as a trend, without inventing pulse detail.
        available = reading.finger_detected and reading.heart_rate is not None and reading.signal_status in {None, "ready"}
        was_available = self.pulse_available
        self.pulse_available = available
        if not available:
            self.clear("Rest your fingertip directly on the sensor.", reset_stream=False)
            return
        if was_available is False:
            self.clear(reset_stream=False)
        if not self.stream_seen:
            self._append(OpticalSample(0, reading.elapsed_seconds, reading.red, reading.infrared), "reports")

    def _append(self, sample, mode):
        dt = 0
        if self.mode != mode:
            self.clear(reset_stream=False)
        if self.samples:
            previous = self.samples[-1]
            gap = sample.elapsed_seconds - previous.elapsed_seconds
            dt = max(0, gap)
            if gap < 0 or gap > (1 if mode == "stream" else 8) or (
                mode == "stream" and sample.sequence != previous.sequence + 1
            ):
                # Do not draw a false line across missing packets, device resets
                # or a 32-bit device counter wrap.
                self.clear(reset_stream=False)
        self.mode = mode
        raw = np.array([sample.red, sample.infrared], dtype=float)
        if self.baseline is None:
            self.baseline = raw.copy()
            self.smoothed = np.zeros(2)
        elif mode == "stream":
            # Causal display-only filters using device time. No synthetic beats
            # or extra points; never feed this presentation signal into vitals.
            self.baseline += (1 - exp(-dt / 1.5)) * (raw - self.baseline)
            self.smoothed += (1 - exp(-dt / 0.04)) * (-(raw - self.baseline) - self.smoothed)
        self.samples.append(sample)
        self.filtered.append(self.smoothed.copy())
        while self.samples and sample.elapsed_seconds - self.samples[0].elapsed_seconds > self.WINDOW_SECONDS:
            self.samples.popleft()
            self.filtered.popleft()
        self.last_received = monotonic()
        self.dirty = True
        if mode == "stream":
            self.title.setText("HEART PULSE")
            self.status.setText("Live signal · keep your hand relaxed" if self.pulse_available is not False else "No pulse signal confirmed · keep gentle contact")
        else:
            self.title.setText("LIGHT SIGNAL · SLOW UPDATES")
            self.status.setText("Update the sensor software to see each heartbeat.")

    def redraw(self):
        if not self.dirty or not self.samples or self.pulse_available is False:
            return
        self.dirty = False
        self.idle_line.hide()
        self.plot.enableAutoRange(axis="y")
        values = np.array([(s.elapsed_seconds, s.red, s.infrared) for s in self.samples], dtype=float)
        times = values[:, 0] - values[-1, 0]
        centered = np.array(self.filtered) if self.mode == "stream" else values[:, 1:] - values[:, 1:].mean(axis=0)
        for index, curve in enumerate((self.red_curve, self.ir_curve)):
            curve.setData(times, centered[:, index], symbol=None)

    def check_freshness(self):
        if self.last_received is not None and monotonic() - self.last_received > (2 if self.mode == "stream" else 8):
            self.clear("Signal paused · waiting for the sensor.", reset_stream=False)
