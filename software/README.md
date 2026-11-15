# AstroLife — Desktop Application

AstroLife's primary desktop interface is developed with **React, TypeScript, and
Electron**. It is an offline-first interface for collecting, visualizing,
storing, and analyzing astronaut health indicators. The existing Python modules
remain the source of truth for assessment rules, ESP32 serial input, and SQLite
history; Electron talks to them through a private structured child-process
bridge.

The original **PySide6 (Qt)** interface remains available as a fallback during
the migration.

## Open from the Windows desktop

For the primary React/Electron app, build or download the Windows installer
as described in [Desktop installers and releases](../docs/RELEASING.md). It
creates an **AstroLife** desktop icon and bundles Python. macOS installers and
GitHub Actions builds are described in the same guide.

The source-checkout shortcut described below launches the **legacy Qt fallback**.

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
| `../desktop/` | Primary React/TypeScript/Electron interface and native packaging |
| `run.py` | Legacy PySide6 fallback entry point |
| `astrotip/ui/` | Desktop windows, dashboard, navigation, and interactive pages |
| `astrotip/inputs/` | ESP32 serial reader and report parser; labelled simulated stream |
| `astrotip/bridge/` | JSON-lines service for the desktop app; PPG batching |
| `astrotip/analysis/` | Assessment rules, optical quality checks, mission context, assessment plan and evidence trace, history summary |
| `astrotip/questionnaire/` | Question registry validation; answers → check-in |
| `astrotip/nasa/` | RadLab and OSDR retrieval, Pydantic models, pandas/NumPy analysis |
| `astrotip/models/` | Shared health data structures, units, and metadata |
| `astrotip/storage/` | SQLite history, mission profile, sessions and follow-up actions |
| `resources/` | NASA catalog, mission context, question registry, evidence list, verified NASA caches |
| `tests/` | Software testing and validation |

## Requirements

- Python 3.11 or newer (Python 3.12 recommended)
- Visual Studio Code or another Python-compatible editor
- Python virtual environment (`venv`)
- Dependencies listed in `requirements.txt`

Core libraries:

- `PySide6` — Qt event loop for the backend; the Qt fallback interface
- `pyserial` — ESP32 communication
- `pandas`, `numpy` — NASA dataset processing, statistics, history summary
- `pydantic` — Validation of NASA API responses, units, timestamps and provenance
- `pyqtgraph`, `Pillow` — Charts and images in the Qt fallback
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

### 4. Run the primary React desktop application

```bash
cd desktop
npm install
npm start
```

### 5. Run the PySide6 fallback

```bash
python software/run.py
```

### 6. Stop the application

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

> This section describes the Qt fallback (`python software/run.py`) and the
> firmware behaviour shared by both interfaces. In the React app the check-in
> is the guided flow described in the [project README](../README.md), and the
> mission only changes the order of hazards and questions.

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

## Application Features

- **Guided check-in:** mission profile, NASA hazard order, safety screen, adaptive questions, required sensor reading, findings, follow-up actions.
- **Live monitor:** real-time ESP32/MAX30102 optical pulse and firmware estimates, with freshness and connection state.
- **Local assessment:** deterministic rules (`analysis/rules.py`); every finding carries an evidence trace.
- **NASA data:** RadLab radiation readings with pandas/NumPy analysis and provenance; one OSDR space-biology study; Human Research Roadmap evidence per topic. See [`docs/NASA_DATA.md`](../docs/NASA_DATA.md).
- **Health history:** saved check-ins, sessions and follow-up actions in one local SQLite file.
- **Concern report:** symptoms and optional values from another instrument, from any screen.
- **Reduced motion:** "Pause motion" in the React app; `ASTROTIP_REDUCED_MOTION=1` for the Qt fallback.

## Current Limitations

- This is an educational prototype, not a diagnosis or flight-certified medical device.
- Sensor estimates depend on the experimental ESP32/MAX30102 firmware and are not clinically validated.
- Local history is intentionally explicit and unencrypted.
- The mission changes the order of hazards and questions, never a finding. Mission media is decorative.
- No machine learning or language model is used. Photos and camera input are not part of the health workflow.
- The RadLab unit is not verified and is shown as "not stated by the API".

See [the React desktop guide](../desktop/README.md) for the bridge architecture,
native packaging, visual stack, test commands, and third-party notices. See
[`docs/UI_UX.md`](../docs/UI_UX.md#11-qt-fallback) for the retained Qt fallback.

The sections above under "Live optical waveform" describe the Qt fallback's
monitor and the firmware behaviour both interfaces share. The React app's
measurement step, hardware verification status and troubleshooting are in
[`docs/HARDWARE.md`](../docs/HARDWARE.md). Sensor estimates and the graph have
not been clinically validated.

Close the PlatformIO Serial Monitor before connecting Astro Life, since both
programs generally cannot access the same serial port simultaneously.

## Development Notes

Keep the desktop application and embedded firmware modular. Verify the physical sensor and serial output before implementing higher-level assessment features.

NASA research references and compatible datasets should be documented with source information, measurement units, limitations, and data provenance.
