# Astro Life — Native Desktop Application

The Astro Life desktop application is developed in **Python using PySide6 (Qt)**. It is designed as an offline-first interface for collecting, visualizing, storing, and eventually analyzing astronaut health indicators.

## Open from the Windows desktop

Double-click **Astro Life** on your desktop. The shortcut starts the app using the
project's virtual environment without opening a command window.

To recreate the shortcut after moving or copying this project, run this once from
the repository root in PowerShell:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File software/create_desktop_shortcut.ps1
```

The application is named Astro Life. The existing repository folder and Python
package keep their current paths, and existing history remains in the legacy
`%LOCALAPPDATA%/AstroTip/history.sqlite3` location.

## Software Architecture

| Directory | Responsibility |
|---|---|
| `run.py` | Main application entry point |
| `astrotip/ui/` | Desktop windows, dashboard, navigation, and interactive pages |
| `astrotip/inputs/` | ESP32 serial data, questionnaires, manual inputs, images, and camera capture |
| `astrotip/analysis/` | Measurement validation, local ML, and NASA-informed guidance |
| `astrotip/models/` | Shared health data structures, units, and metadata |
| `astrotip/storage/` | SQLite database and local health records |
| `resources/` | NASA references and dataset documentation |
| `tests/` | Software testing and validation |

## Requirements

- Python 3.11 or newer (Python 3.12 recommended)
- Visual Studio Code or another Python-compatible editor
- Python virtual environment (`venv`)
- Dependencies listed in `requirements.txt`

Core libraries:

- `PySide6` — Native desktop UI and future webcam capture
- `pyserial` — ESP32 communication
- `pyqtgraph` — Real-time health visualizations
- `numpy` — Numerical processing
- `Pillow` — Image processing and validation
- `sqlite3` — Built-in Python database library

Optional dependencies for local ML, dataset analysis, testing, and packaging are defined in `requirements-ml.txt` and `requirements-dev.txt`.

## Installation

Run the following commands from the repository root.

### 1. Create a virtual environment

```bash
python3 -m venv .venv
```

### 2. Activate the environment

macOS / Linux:

```bash
source .venv/bin/activate
```

Windows PowerShell:

```powershell
.venv\Scripts\Activate.ps1
```

### 3. Install dependencies

```bash
python -m pip install --upgrade pip
python -m pip install -r software/requirements.txt
```

### 4. Run the application

```bash
python software/run.py
```

### 5. Stop the application

Close the application window or press `Ctrl + C` in the terminal.

To deactivate the virtual environment:

```bash
deactivate
```

## ESP32 Firmware Development

The firmware is developed separately under:

`electrical/firmware/max30102_serial_test/`

It uses PlatformIO with the Arduino framework and the SparkFun MAX3010x library.

### Compile

From the repository root:

```bash
pio run -d electrical/firmware/max30102_serial_test
```

### Upload to ESP32

```bash
pio run -d electrical/firmware/max30102_serial_test -t upload
```

### Monitor sensor readings

```bash
pio device monitor -b 115200
```

Uploading and reading real sensor data require physical hardware. Compiling does not.

The firmware outputs descriptive serial reports containing red/infrared optical measurements, heart-rate and SpO₂ estimates, and measurement validity. It also streams each paired optical sample for the live waveform.

## Live optical waveform

The optional check-in contains health observations, with no mission selector or
assumed destination. Assessment guidance uses readings and reported observations.
Health history lists the recorded time and priority; older saved records remain
readable. The reference basis remains NASA's [hazards overview](https://www.nasa.gov/hrp/hazards/),
[risks overview](https://www.nasa.gov/hrp/risks/), and
[ongoing HRP research](https://www.nasa.gov/hrp/ongoing-hrp-research/), with linked
supporting references documented in `resources/dataset_manifest.md`.

Open **Astro Life** using the desktop shortcut, select your ESP32 COM port on
**Sensor monitor**, and click **Connect**. Rest a finger on the MAX30102. Scroll
down on smaller windows to view the graph, analysis, and save button.

The main screen uses a hospital-style layout: one cyan finger-pulse trace,
headed **Heart pulse**. When the signal is missing or the firmware cannot
estimate a pulse, the chart shows a horizontal **No signal** idle line. This
is a display indicator, not a measurement of zero heart rate or an ECG finding.
The screen includes
large pulse and blood-oxygen estimates, and a short next step. The graph shows
the last ten seconds of the actual infrared optical signal (PPG), not an ECG.
It does not add ECG spikes, estimate breathing rate or blood pressure, or
calculate new heart-rate/oxygen values from the displayed curve.

For the streamed trace only, a causal 1.5-second baseline filter removes slow
drift, a 0.04-second smoothing filter reduces jagged display noise, and the
signal is inverted to show optical absorption as upward pulses. Both filters
use the device timestamps. The plot scales automatically; its amplitude is
not a clinical measurement. These waveform filters change only the drawing.
Raw samples and device estimates remain unchanged; the large numbers show the
latest eligible device estimate directly.

Select **Sensor details** to show the red trace, raw counts, sample rate,
firmware version, and the wavelength legend. The legend labels the typical
MAX30102 LED wavelengths: red around 660 nm and
infrared around 880 nm, from the [manufacturer's datasheet, page 4](https://www.analog.com/media/en/technical-documentation/data-sheets/max30102.pdf).
These are hardware specifications, not wavelengths measured from your finger.

For the pulse waveform, compile and upload the updated `src/main.cpp` in the
firmware folder using the commands above. Close Astro Life's serial connection
and any serial monitor before uploading; reconnect afterward. Updating the
desktop app alone does not update the ESP32. Older report-only firmware still
produces a **Light signal · slow updates** view with lines connecting the reported
readings. This shows a slow signal trend; one sample per report is too sparse
to show the pulse shape. Both channels use solid lines without dot markers.

The firmware keeps paired red/IR FIFO reads and streams ASCII lines at 115200 baud:

```text
PPG,<sequence>,<read time in milliseconds>,<red ADC counts>,<infrared ADC counts>
```

The sensor configuration uses 100 samples/second with four-sample averaging,
giving approximately 25 FIFO pairs/second, as in the
[SparkFun SpO2 example](https://github.com/sparkfun/SparkFun_MAX3010x_Sensor_Library/blob/master/examples/Example8_SPO2/Example8_SPO2.ino).
Times describe when firmware reads each pair; they are not USB arrival times.
The app accepts both the original `ASTROTIP HEALTH MONITOR` report heading and
the new `ASTRO LIFE HEALTH MONITOR` heading. Firmware `astro-life-ppg-2` also
reports `Signal Status`, `Sample Rate` (Hz) and `Firmware` fields.

The firmware rejects vital estimates if any sample in its four-second window
lacks finger contact, reaches the 18-bit ADC ceiling, or has a zero red count.
It also rejects windows outside 20–30 samples/second, because the bundled
algorithm assumes 25 samples/second. A backlog that would overrun the library's
four-slot buffer triggers a fresh collection. These are conservative engineering
checks, not validated clinical signal-quality thresholds. The fixed contact
threshold may need calibration for a different sensor module or placement.

The large pulse and oxygen numbers show the latest eligible firmware estimates
immediately, including the first report and sudden changes. They are not
averaged, clamped to a normal range, or hidden while waiting for agreement.
There are no Rechecking or unconfirmed labels under the numbers. Missing or
firmware-invalid estimates still show a dash; contact loss, disconnection and
stale reports clear the values. Low-oxygen alerts remain immediate, and
**Review this reading** uses the same original estimate shown on screen.

**Sensor details** contains optical and report-consistency diagnostics. The
optical check inspects 100 samples for contact, clipping, continuity, timing and
large light-level changes. Report consistency examines three recent reports.
These diagnostics can mark signal quality as poor in the assessment, but do not
hide or modify numeric estimates. They are engineering heuristics, not validated
accuracy or motion tests; overlapping estimate windows are not independent
measurements. No firmware update is needed for this display behavior.

The bundled firmware algorithm can report a valid pulse after finding just two
optical peaks. It does not require regular spacing or validate pulse shape, so
noise or changing pressure can be counted as extra beats. The current 100 Hz /
four-sample averaging configuration matches its expected 25 Hz input. A high
resting value cannot be corrected by arbitrarily halving it or forcing it below
100 bpm. Its accuracy needs comparison against an independent measurement.

Rest the soft pad of your fingertip directly against the illuminated sensor
window with no air gap. Support your hand, use light contact rather than
squeezing, and keep the pressure steady. Keep your hand warm and relaxed and verify
unexpected readings with an approved monitor. See the
[FDA's pulse oximeter guidance](https://www.fda.gov/consumers/consumer-updates/pulse-oximeter-basics)
and [SparkFun's note on finger pressure](https://github.com/sparkfun/SparkFun_MAX3010x_Sensor_Library/blob/master/examples/Example8_SPO2/Example8_SPO2.ino).
Consistent values and a smooth trace do not prove accuracy.

Hardware check on 2026-11-14: the updated firmware and desktop reader received
1,500 consecutive samples from the connected ESP32 at 25.05 samples/second,
with no missing sequence numbers. Finger contact was detected, but numeric
pulse/oxygen estimates still varied during that check. Transport and timing
are verified; measurement accuracy and stable sensor mounting remain unresolved.
The previous 4 MB firmware was backed up locally under `.venv/firmware-backups/`
before uploading `astro-life-ppg-2`. Backups are excluded from Git.

The graph clears on disconnection, device errors, missing sample sequences,
device clock resets, lost finger contact, clipping, or a paused stream. Raw samples may appear before the
firmware has valid vital estimates, and they never enable saving a health
reading on their own. Optical traces remain in memory and are not saved to
health history.

## Planned Application Features

- **Live Dashboard:** Display real-time sensor data, signal quality, and health trends.
- **Daily Check-in:** Collect sleep, mood, fatigue, symptoms, and activity information.
- **Manual Health Input:** Record measurements from external instruments.
- **Photos & Camera:** Import image files or capture images directly with a webcam.
- **Health History:** Store and visualize measurements over time.
- **Local Assessment:** Interpret measurements using validated rules and optional lightweight ML.
- **NASA Sources:** Provide traceable evidence for spaceflight-related health guidance.

## Current Limitations

The application supports live serial readings, an optical waveform, optional
check-ins, rule-based guidance with NASA references used internally, and explicit
saving to local health history. It does not capture or analyze medical images
or run a trained machine-learning model. Sensor estimates and the graph have
not been clinically validated.

Close the PlatformIO Serial Monitor before connecting Astro Life, since both
programs generally cannot access the same serial port simultaneously.

## Development Notes

Keep the desktop application and embedded firmware modular. Verify the physical sensor and serial output before implementing higher-level assessment features.

NASA research references and compatible datasets should be documented with source information, measurement units, limitations, and data provenance.
